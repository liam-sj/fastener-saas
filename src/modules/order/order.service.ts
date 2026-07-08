import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
import { StockService } from '../inventory/stock.service';
import { mul, sum, sub } from '../../common/utils/money';
import { CreateOrderDto } from './dto/create-order.dto';
import { AddItemDto } from './dto/add-item.dto';
import { UpdateItemDto } from './dto/update-item.dto';
import { OrderStatus } from '@prisma/client';

@Injectable()
export class OrderService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly stockService: StockService,
  ) {}

  async findAll(query: { page?: number; pageSize?: number; status?: string; customerId?: number }) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, status, customerId } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;

    const [list, total] = await Promise.all([
      this.prisma.order.findMany({
        where, include: { customer: true, items: true },
        skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { createdAt: 'desc' as const },
      }),
      this.prisma.order.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
      include: { customer: true, items: true, revisions: { orderBy: { createdAt: 'desc' as const } } },
    });
    if (!order) throw new NotFoundException('订单不存在');
    return order;
  }

  async create(dto: CreateOrderDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const orderNo = await generateNo(tx as any, 'SO', tenantId);
      const items = await this.stockService.batchDeduct(tx, tenantId, dto.items);
      const totalAmount = sum(items.map((i) => mul(i.price, i.qty)));

      return tx.order.create({
        data: {
          tenantId, orderNo, customerId: dto.customerId, quotationId: dto.quotationId,
          totalAmount,
          items: {
            create: items.map((item) => ({
              tenantId, productName: item.productName, skuCode: item.skuCode,
              skuAttrs: item.skuAttrs ?? undefined, price: item.price, qty: item.qty, source: item.source,
              costPrice: item.costPrice,
            })) as any,
          },
        },
        include: { items: true },
      });
    });
  }

  async addItem(orderId: number, dto: AddItemDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: orderId, tenantId },
      });
      if (!order) throw new NotFoundException('订单不存在');
      if (order.status === 'completed' || order.status === 'cancelled') {
        throw new BadRequestException('订单已完成或已取消，无法变更');
      }

      const sku = await tx.sku.findFirst({
        where: { id: dto.skuId, tenantId },
        include: { product: true },
      });
      if (!sku) throw new BadRequestException('SKU 不存在');

      // 原子扣减库存
      const result = await tx.sku.updateMany({
        where: { id: sku.id, stock: { gte: dto.qty } },
        data: { stock: { decrement: dto.qty } },
      });
      const source = result.count > 0 ? 'stock' : 'custom';
      const costPrice = source === 'stock' ? Number(sku.costPrice) : undefined;

      const newItem = await tx.orderItem.create({
        data: {
          tenantId, orderId,
          productName: sku.product.name,
          skuCode: sku.skuCode,
          skuAttrs: sku.attributes ?? undefined,
          price: dto.price, qty: dto.qty, source,
          costPrice,
        } as any,
      });

      await tx.orderRevision.create({
        data: {
          tenantId, orderId, type: 'add',
          afterData: { itemId: newItem.id, skuCode: sku.skuCode, qty: dto.qty, price: dto.price },
        },
      });

      await this.recalculateTotalInTx(tx, tenantId, orderId);
      return newItem;
    });
  }

  async updateItem(orderId: number, itemId: number, dto: UpdateItemDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const orderItem = await tx.orderItem.findFirst({
        where: { id: itemId, orderId, tenantId },
      });
      if (!orderItem) throw new NotFoundException('订单条目不存在');

      const beforeData = { qty: orderItem.qty, price: Number(orderItem.price) };

      await tx.orderItem.update({
        where: { id: itemId },
        data: {
          ...(dto.qty !== undefined ? { qty: dto.qty } : {}),
          ...(dto.price !== undefined ? { price: dto.price } : {}),
        },
      });

      await tx.orderRevision.create({
        data: {
          tenantId, orderId, type: 'modify',
          beforeData, afterData: { qty: dto.qty, price: dto.price }, reason: dto.reason,
        },
      });

      await this.recalculateTotalInTx(tx, tenantId, orderId);
    });
  }

  async removeItem(orderId: number, itemId: number, reason?: string) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const orderItem = await tx.orderItem.findFirst({
        where: { id: itemId, orderId, tenantId },
      });
      if (!orderItem) throw new NotFoundException('订单条目不存在');

      if (orderItem.source === 'stock') {
        const unreleasedQty = orderItem.qty - orderItem.deliveredQty;
        if (unreleasedQty > 0) {
          // 原子还库存
          await tx.sku.updateMany({
            where: { skuCode: orderItem.skuCode, tenantId },
            data: { stock: { increment: unreleasedQty } },
          });
        }
      }

      await tx.orderItem.delete({ where: { id: itemId } });

      await tx.orderRevision.create({
        data: {
          tenantId, orderId, type: 'remove',
          beforeData: { itemId, skuCode: orderItem.skuCode, qty: orderItem.qty }, reason,
        },
      });

      await this.recalculateTotalInTx(tx, tenantId, orderId);
    });
  }

  private async recalculateTotalInTx(tx: any, tenantId: number, orderId: number) {
    const items = await tx.orderItem.findMany({ where: { orderId, tenantId } });
    const total = sum(items.map((i: any) => mul(Number(i.price), i.qty)));
    await tx.order.update({
      where: { id: orderId },
      data: { totalAmount: total },
    });
  }

  private readonly ORDER_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
    pending: ['partial_delivered', 'delivered', 'cancelled'],
    partial_delivered: ['delivered', 'cancelled'],
    delivered: ['completed'],
    completed: [],
    cancelled: [],
  };

  async updateStatus(id: number, status: OrderStatus) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const order = await this.prisma.order.findFirst({
      where: { id, tenantId },
    });
    if (!order) throw new NotFoundException('订单不存在');

    const allowed = this.ORDER_TRANSITIONS[order.status];
    if (!allowed || !allowed.includes(status)) {
      throw new BadRequestException(`订单不能从 ${order.status} 转为 ${status}`);
    }

    await this.prisma.order.updateMany({
      where: { id, tenantId },
      data: { status },
    });
  }

  async getProfit(orderId: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        items: {
          include: { purchaseOrder: { include: { items: true } } },
        },
      },
    });
    if (!order) throw new NotFoundException('订单不存在');

    const itemBreakdown = order.items.map((item) => {
      let costPrice = item.costPrice ? Number(item.costPrice) : null;

      // 定制件回退到采购单条目单价
      if (costPrice === null && item.source === 'custom' && item.purchaseOrder) {
        const poItem = item.purchaseOrder.items.find(
          (poi) => poi.skuCode === item.skuCode,
        );
        if (poItem) costPrice = Number(poItem.unitPrice);
      }

      const revenue = mul(Number(item.price), item.qty);
      const cost = costPrice !== null ? mul(costPrice, item.qty) : 0;
      const profit = sub(revenue, cost);

      return {
        itemId: item.id,
        productName: item.productName,
        skuCode: item.skuCode,
        source: item.source,
        price: Number(item.price),
        qty: item.qty,
        costPrice,
        revenue,
        cost,
        profit,
        deliveredQty: item.deliveredQty,
      };
    });

    const totalRevenue = sum(itemBreakdown.map((i) => i.revenue));
    const totalCost = sum(itemBreakdown.map((i) => i.cost));
    const totalProfit = sub(totalRevenue, totalCost);
    const profitMargin =
      totalRevenue > 0
        ? mul(totalProfit / totalRevenue, 100)
        : 0;

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      status: order.status,
      totalRevenue,
      totalCost,
      totalProfit,
      profitMargin,
      items: itemBreakdown,
      unknownCostCount: itemBreakdown.filter((i) => i.costPrice === null).length,
    };
  }
}
