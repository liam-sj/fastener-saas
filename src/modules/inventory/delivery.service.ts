import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
import { CreateDeliveryDto } from './dto/create-delivery.dto';
import { ShipDto } from './dto/ship.dto';

@Injectable()
export class DeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: { page?: number; pageSize?: number; orderId?: number }) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, orderId } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Record<string, unknown> = { tenantId };
    if (orderId) where.orderId = orderId;

    const [list, total] = await Promise.all([
      this.prisma.deliveryOrder.findMany({
        where, include: { items: true },
        skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { createdAt: 'desc' as const },
      }),
      this.prisma.deliveryOrder.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const d = await this.prisma.deliveryOrder.findFirst({
      where: { id, tenantId },
      include: { items: true, order: true },
    });
    if (!d) throw new NotFoundException('发货单不存在');
    return d;
  }

  async create(dto: CreateDeliveryDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const deliveryNo = await generateNo(tx as any, 'DO', tenantId);

      // 批量查订单条目，原子校验发货量不超
      const orderItemIds = dto.items.map((i) => i.orderItemId);
      const orderItems = await tx.orderItem.findMany({
        where: { id: { in: orderItemIds }, tenantId },
      });
      const itemMap = new Map(orderItems.map((oi) => [oi.id, oi]));

      for (const item of dto.items) {
        const orderItem = itemMap.get(item.orderItemId);
        if (!orderItem) throw new BadRequestException(`OrderItem ${item.orderItemId} 不存在`);
        if (orderItem.deliveredQty + item.qty > orderItem.qty) {
          throw new BadRequestException(`OrderItem ${item.orderItemId} 发货数量超过订单数量`);
        }
      }

      return tx.deliveryOrder.create({
        data: {
          tenantId, deliveryNo, orderId: dto.orderId,
          items: {
            create: dto.items.map((i) => ({
              tenantId, orderItemId: i.orderItemId, qty: i.qty,
            })),
          },
        },
        include: { items: true },
      });
    });
  }

  async ship(id: number, dto: ShipDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.deliveryOrder.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });
      if (!delivery) throw new NotFoundException('发货单不存在');

      // 批量读取当前 orderItems 状态
      const itemIds = delivery.items.map((i) => i.orderItemId);
      const currentItems = await tx.orderItem.findMany({
        where: { id: { in: itemIds } },
      });
      const itemMap = new Map(currentItems.map((oi) => [oi.id, oi]));

      for (const item of delivery.items) {
        const oi = itemMap.get(item.orderItemId);
        if (!oi) throw new BadRequestException(`OrderItem ${item.orderItemId} 不存在`);

        // 原子校验：deliveredQty + 本次 <= 订单总量，防止并发超发
        const maxAllowed = oi.qty - item.qty;
        const result = await tx.orderItem.updateMany({
          where: {
            id: item.orderItemId,
            deliveredQty: { lte: maxAllowed },
          },
          data: { deliveredQty: { increment: item.qty } },
        });
        if (result.count === 0) {
          throw new BadRequestException(
            `OrderItem ${item.orderItemId} 发货数量超过订单数量或其他发货单已占用`,
          );
        }
      }

      await tx.deliveryOrder.updateMany({
        where: { id, tenantId },
        data: { status: 'shipped', logisticsCompany: dto.logisticsCompany, trackingNo: dto.trackingNo },
      });

      const orderItems = await tx.orderItem.findMany({
        where: { orderId: delivery.orderId, tenantId },
      });
      const allDelivered = orderItems.every((i) => i.deliveredQty >= i.qty);
      await tx.order.updateMany({
        where: { id: delivery.orderId },
        data: { status: allDelivered ? 'delivered' : 'partial_delivered' },
      });
    });
  }

  async sign(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.prisma.deliveryOrder.updateMany({ where: { id, tenantId }, data: { status: 'signed' } });
  }
}
