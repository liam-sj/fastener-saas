import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  private get db(): any { return this.prisma; }

  async findAll(query: { page?: number; pageSize?: number; status?: string; customerId?: number }) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, pageSize = 20, status, customerId } = query;
    const where: any = { tenantId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const [list, total] = await Promise.all([
      this.db.order.findMany({
        where, include: { customer: true, items: true },
        skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { createdAt: 'desc' as const },
      }),
      this.db.order.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const order = await this.db.order.findFirst({
      where: { id, tenantId },
      include: { customer: true, items: true, revisions: { orderBy: { createdAt: 'desc' as const } } },
    });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  async create(dto: CreateOrderDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const orderNo = await generateNo(this.prisma as any, 'SO', tenantId);
    const items = await this.processItems(tenantId, dto.items);
    const totalAmount = items.reduce((sum, i) => sum + Number(i.price) * i.qty, 0);

    return this.db.order.create({
      data: {
        tenantId, orderNo, customerId: dto.customerId, quotationId: dto.quotationId,
        totalAmount: Math.round(totalAmount * 100) / 100,
        items: {
          create: items.map((item) => ({
            tenantId, productName: item.productName, skuCode: item.skuCode,
            skuAttrs: item.skuAttrs, price: item.price, qty: item.qty, source: item.source,
          })),
        },
      },
      include: { items: true },
    });
  }

  private async processItems(
    tenantId: number,
    items: { skuId: number; qty: number; price: number }[],
  ) {
    return Promise.all(
      items.map(async (item) => {
        const sku = await this.db.sku.findFirst({
          where: { id: item.skuId, tenantId },
          include: { product: true },
        });
        if (!sku) throw new BadRequestException(`SKU ${item.skuId} 不存在`);

        let source: string;
        if (sku.stock >= item.qty) {
          source = 'stock';
          await this.db.sku.update({
            where: { id: sku.id },
            data: { stock: sku.stock - item.qty },
          });
        } else {
          source = 'custom';
        }

        return {
          productName: sku.product.name,
          skuCode: sku.skuCode,
          skuAttrs: sku.attributes as any,
          price: item.price,
          qty: item.qty,
          source,
        };
      }),
    );
  }

  async addItem(orderId: number, dto: AddItemDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const order = await this.findOne(orderId);
    if (order.status === 'completed' || order.status === 'cancelled') {
      throw new BadRequestException('订单已完成或已取消，无法变更');
    }

    const sku = await this.db.sku.findFirst({
      where: { id: dto.skuId, tenantId },
      include: { product: true },
    });
    if (!sku) throw new BadRequestException('SKU 不存在');

    const source = sku.stock >= dto.qty ? 'stock' : 'custom';
    if (source === 'stock') {
      await this.db.sku.update({
        where: { id: sku.id },
        data: { stock: sku.stock - dto.qty },
      });
    }

    const newItem = await this.db.orderItem.create({
      data: {
        tenantId, orderId,
        productName: sku.product.name,
        skuCode: sku.skuCode,
        skuAttrs: sku.attributes as any,
        price: dto.price, qty: dto.qty, source,
      },
    });

    await this.db.orderRevision.create({
      data: {
        tenantId, orderId, type: 'add',
        afterData: { itemId: newItem.id, skuCode: sku.skuCode, qty: dto.qty, price: dto.price },
      },
    });

    await this.recalculateTotal(tenantId, orderId);
    return newItem;
  }

  async updateItem(orderId: number, itemId: number, dto: UpdateItemDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const orderItem = await this.db.orderItem.findFirst({
      where: { id: itemId, orderId, tenantId },
    });
    if (!orderItem) throw new NotFoundException('订单条目不存在');

    const beforeData = { qty: orderItem.qty, price: Number(orderItem.price) };

    await this.db.orderItem.update({
      where: { id: itemId },
      data: {
        ...(dto.qty !== undefined ? { qty: dto.qty } : {}),
        ...(dto.price !== undefined ? { price: dto.price } : {}),
      },
    });

    await this.db.orderRevision.create({
      data: {
        tenantId, orderId, type: 'modify',
        beforeData, afterData: { qty: dto.qty, price: dto.price }, reason: dto.reason,
      },
    });

    await this.recalculateTotal(tenantId, orderId);
  }

  async removeItem(orderId: number, itemId: number, reason?: string) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const orderItem = await this.db.orderItem.findFirst({
      where: { id: itemId, orderId, tenantId },
    });
    if (!orderItem) throw new NotFoundException('订单条目不存在');

    if (orderItem.source === 'stock') {
      const sku = await this.db.sku.findFirst({
        where: { skuCode: orderItem.skuCode, tenantId },
      });
      if (sku) {
        const unreleasedQty = orderItem.qty - orderItem.deliveredQty;
        if (unreleasedQty > 0) {
          await this.db.sku.update({
            where: { id: sku.id },
            data: { stock: sku.stock + unreleasedQty },
          });
        }
      }
    }

    await this.db.orderItem.delete({ where: { id: itemId } });

    await this.db.orderRevision.create({
      data: {
        tenantId, orderId, type: 'remove',
        beforeData: { itemId, skuCode: orderItem.skuCode, qty: orderItem.qty }, reason,
      },
    });

    await this.recalculateTotal(tenantId, orderId);
  }

  private async recalculateTotal(tenantId: number, orderId: number) {
    const items = await this.db.orderItem.findMany({ where: { orderId, tenantId } });
    const total = items.reduce((sum, i) => sum + Number(i.price) * i.qty, 0);
    await this.db.order.update({
      where: { id: orderId },
      data: { totalAmount: Math.round(total * 100) / 100 },
    });
  }

  async updateStatus(id: number, status: string) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.db.order.updateMany({ where: { id, tenantId }, data: { status } as any });
  }
}
