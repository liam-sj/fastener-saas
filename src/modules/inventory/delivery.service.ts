import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
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
        where,
        include: { items: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
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

  /**
   * 创建发货单。校验可发货量:
   *  - 现货件: qty - deliveredQty
   *  - 定制件: ProductionOrder.completedQty - 已发量
   * 订单必须处于 ready_to_ship / partial_delivered 状态。
   */
  async create(dto: CreateDeliveryDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: dto.orderId, tenantId },
      });
      if (!order) throw new NotFoundException('订单不存在');
      if (!['ready_to_ship', 'partial_delivered'].includes(order.status)) {
        throw new BadRequestException(
          `订单当前状态 ${order.status} 不可发货,需先进入 ready_to_ship`,
        );
      }

      const deliveryNo = await generateNo(tx as any, 'DO', tenantId);
      const ids = dto.items.map((i) => i.orderItemId);
      const orderItems = await tx.orderItem.findMany({
        where: { id: { in: ids }, tenantId },
      });
      const itemMap = new Map(orderItems.map((oi) => [oi.id, oi]));

      const customIds = orderItems
        .filter((oi) => oi.source === 'custom')
        .map((oi) => oi.id);
      const prodMap = new Map<number, any>();
      if (customIds.length > 0) {
        const pos = await tx.productionOrder.findMany({
          where: { orderItemId: { in: customIds }, tenantId },
        });
        for (const po of pos) prodMap.set(po.orderItemId, po);
      }

      const delAgg = await tx.deliveryItem.groupBy({
        by: ['orderItemId'],
        where: { orderItemId: { in: ids }, tenantId },
        _sum: { qty: true },
      });
      const delMap = new Map(
        delAgg.map((d) => [d.orderItemId, d._sum.qty ?? 0]),
      );

      for (const item of dto.items) {
        const oi = itemMap.get(item.orderItemId);
        if (!oi)
          throw new BadRequestException(`OrderItem ${item.orderItemId} 不存在`);
        const already = delMap.get(item.orderItemId) ?? 0;

        if (oi.source === 'stock') {
          const shippable = oi.qty - already;
          if (item.qty > shippable) {
            throw new BadRequestException(
              `OrderItem ${item.orderItemId}(现货)发货量${item.qty}超出可发量${shippable}`,
            );
          }
        } else {
          const po = prodMap.get(item.orderItemId);
          if (!po)
            throw new BadRequestException(
              `OrderItem ${item.orderItemId}(定制件)未创建生产工单,不可发货`,
            );
          const shippable = po.completedQty - already;
          if (item.qty > shippable) {
            throw new BadRequestException(
              `OrderItem ${item.orderItemId}(定制件)发货量${item.qty}超出可发量${shippable}(完工${po.completedQty}-已发${already})`,
            );
          }
        }
      }

      return tx.deliveryOrder.create({
        data: {
          tenantId,
          deliveryNo,
          orderId: dto.orderId,
          items: {
            create: dto.items.map((i) => ({
              tenantId,
              orderItemId: i.orderItemId,
              qty: i.qty,
            })),
          },
        },
        include: { items: true },
      });
    });
  }

  /**
   * 发货: 并发防超发(原子条件更新), 联动 Order 状态
   */
  async ship(id: number, dto: ShipDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const delivery = await tx.deliveryOrder.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });
      if (!delivery) throw new NotFoundException('发货单不存在');
      if (delivery.status !== 'pending') {
        throw new BadRequestException(
          `发货单当前状态 ${delivery.status} 不可发货`,
        );
      }

      const itemIds = delivery.items.map((i) => i.orderItemId);
      const currentItems = await tx.orderItem.findMany({
        where: { id: { in: itemIds }, tenantId },
      });
      const itemMap = new Map(currentItems.map((oi) => [oi.id, oi]));

      const customIds = currentItems
        .filter((oi) => oi.source === 'custom')
        .map((oi) => oi.id);
      const prodMap = new Map<number, any>();
      if (customIds.length > 0) {
        const pos = await tx.productionOrder.findMany({
          where: { orderItemId: { in: customIds }, tenantId },
        });
        for (const po of pos) prodMap.set(po.orderItemId, po);
      }

      for (const item of delivery.items) {
        const oi = itemMap.get(item.orderItemId);
        if (!oi)
          throw new BadRequestException(`OrderItem ${item.orderItemId} 不存在`);

        let maxAllowed: number;
        if (oi.source === 'stock') {
          maxAllowed = oi.qty - item.qty;
        } else {
          const po = prodMap.get(item.orderItemId);
          if (!po)
            throw new BadRequestException(
              `OrderItem ${item.orderItemId}(定制件)未创建生产工单,不可发货`,
            );
          maxAllowed = po.completedQty - item.qty;
        }

        const result = await tx.orderItem.updateMany({
          where: {
            id: item.orderItemId,
            tenantId,
            deliveredQty: { lte: maxAllowed },
          },
          data: { deliveredQty: { increment: item.qty } },
        });
        if (result.count === 0) {
          throw new BadRequestException(
            `OrderItem ${item.orderItemId} 发货数量超过可发量或已被其他发货单占用`,
          );
        }
      }

      await tx.deliveryOrder.updateMany({
        where: { id, tenantId },
        data: {
          status: 'shipped',
          logisticsCompany: dto.logisticsCompany,
          trackingNo: dto.trackingNo,
        },
      });

      // 联动 Order 状态: 全部发完 -> delivered, 部分发 -> partial_delivered
      const orderItems = await tx.orderItem.findMany({
        where: { orderId: delivery.orderId, tenantId },
      });
      const allDelivered = orderItems.every((i) => i.deliveredQty >= i.qty);
      await tx.order.updateMany({
        where: { id: delivery.orderId, tenantId },
        data: { status: allDelivered ? 'delivered' : 'partial_delivered' },
      });
    });
  }

  async sign(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const delivery = await this.prisma.deliveryOrder.findFirst({
      where: { id, tenantId },
    });
    if (!delivery) throw new NotFoundException('发货单不存在');
    if (delivery.status !== 'shipped') {
      throw new BadRequestException('仅已发货状态可签收');
    }
    await this.prisma.deliveryOrder.updateMany({
      where: { id, tenantId },
      data: { status: 'signed' },
    });
  }
}
