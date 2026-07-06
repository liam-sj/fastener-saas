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
    const { page = 1, pageSize = 20, orderId } = query;
    const where: any = { tenantId };
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
    const deliveryNo = await generateNo(this.prisma, 'DO', tenantId);

    for (const item of dto.items) {
      const orderItem = await this.prisma.orderItem.findFirst({
        where: { id: item.orderItemId, tenantId },
      });
      if (!orderItem) throw new BadRequestException(`OrderItem ${item.orderItemId} 不存在`);
      if (orderItem.deliveredQty + item.qty > orderItem.qty) {
        throw new BadRequestException(`OrderItem ${item.orderItemId} 发货数量超过订单数量`);
      }
    }

    return this.prisma.deliveryOrder.create({
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
  }

  async ship(id: number, dto: ShipDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const delivery = await this.prisma.deliveryOrder.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!delivery) throw new NotFoundException('发货单不存在');

    for (const item of delivery.items) {
      await this.prisma.orderItem.update({
        where: { id: item.orderItemId },
        data: { deliveredQty: { increment: item.qty } },
      });
    }

    await this.prisma.deliveryOrder.updateMany({
      where: { id, tenantId },
      data: { status: 'shipped', logisticsCompany: dto.logisticsCompany, trackingNo: dto.trackingNo },
    });

    const orderItems = await this.prisma.orderItem.findMany({
      where: { orderId: delivery.orderId, tenantId },
    });
    const allDelivered = orderItems.every((i) => i.deliveredQty >= i.qty);
    await this.prisma.order.updateMany({
      where: { id: delivery.orderId },
      data: { status: allDelivered ? 'delivered' : 'partial_delivered' },
    });
  }

  async sign(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.prisma.deliveryOrder.updateMany({ where: { id, tenantId }, data: { status: 'signed' } });
  }
}
