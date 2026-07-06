import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { ReconcileDto } from './dto/reconcile.dto';
import { QuerySummaryDto } from './dto/query-summary.dto';

@Injectable()
export class SettlementService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findByOrder(orderId: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    const order = await this.prisma.order.findFirst({
      where: { id: orderId, tenantId },
      include: {
        customer: true,
        items: true,
        settlements: true,
      },
    });
    if (!order) throw new NotFoundException('订单不存在');

    const itemsWithSettlement = order.items.map((item) => {
      const itemSettlements = order.settlements.filter(
        (s) => s.orderItemId === item.id,
      );
      const settledAmount = itemSettlements.reduce(
        (sum, s) => sum + Number(s.amount),
        0,
      );
      const itemTotal = Number(item.price) * item.qty;
      return {
        itemId: item.id,
        productName: item.productName,
        skuCode: item.skuCode,
        price: Number(item.price),
        qty: item.qty,
        total: Math.round(itemTotal * 100) / 100,
        settledAmount: Math.round(settledAmount * 100) / 100,
        unpaidAmount: Math.round((itemTotal - settledAmount) * 100) / 100,
        settlements: itemSettlements,
      };
    });

    const orderTotal = itemsWithSettlement.reduce((sum, i) => sum + i.total, 0);
    const totalSettled = itemsWithSettlement.reduce(
      (sum, i) => sum + i.settledAmount,
      0,
    );

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      customer: order.customer,
      status: order.status,
      totalAmount: Math.round(orderTotal * 100) / 100,
      paidAmount: Number(order.paidAmount),
      settledAmount: Math.round(totalSettled * 100) / 100,
      unpaidAmount: Math.round((orderTotal - totalSettled) * 100) / 100,
      items: itemsWithSettlement,
    };
  }

  async getSummary(query: QuerySummaryDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, pageSize = 20, customerId, status } = query;

    // Aggregate by order
    const where: any = { tenantId };
    if (customerId) where.customerId = customerId;
    if (status) where.status = status;

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        include: {
          customer: true,
          items: true,
          settlements: true,
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.order.count({ where }),
    ]);

    const list = orders.map((order) => {
      const orderTotal = order.items.reduce(
        (sum, i) => sum + Number(i.price) * i.qty,
        0,
      );
      const totalSettled = order.settlements.reduce(
        (sum, s) => sum + Number(s.amount),
        0,
      );
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        customer: order.customer,
        status: order.status,
        totalAmount: Math.round(orderTotal * 100) / 100,
        paidAmount: Number(order.paidAmount),
        settledAmount: Math.round(totalSettled * 100) / 100,
        unpaidAmount: Math.round((orderTotal - totalSettled) * 100) / 100,
      };
    });

    return { list, total, page, pageSize };
  }

  async reconcile(dto: ReconcileDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    const order = await this.prisma.order.findFirst({
      where: { id: dto.orderId, tenantId },
      include: { items: true },
    });
    if (!order) throw new NotFoundException('订单不存在');

    const results: any[] = [];
    let totalReconciled = 0;

    for (const item of dto.items) {
      const orderItem = await this.prisma.orderItem.findFirst({
        where: { id: item.orderItemId, orderId: dto.orderId, tenantId },
      });
      if (!orderItem)
        throw new BadRequestException(
          `OrderItem ${item.orderItemId} 不属于该订单`,
        );

      // Check overpayment
      const existingSettlements = await this.prisma.settlement.findMany({
        where: { orderItemId: item.orderItemId, tenantId },
      });
      const alreadySettled = existingSettlements.reduce(
        (sum, s) => sum + Number(s.amount),
        0,
      );
      const itemTotal = Number(orderItem.price) * orderItem.qty;
      if (alreadySettled + item.amount > itemTotal) {
        throw new BadRequestException(
          `OrderItem ${item.orderItemId} 收款金额超过条目总额`,
        );
      }

      const settlement = await this.prisma.settlement.create({
        data: {
          tenantId,
          orderId: dto.orderId,
          orderItemId: item.orderItemId,
          amount: item.amount,
          paidAt: dto.paidAt ? new Date(dto.paidAt) : new Date(),
          status: 'paid',
        },
      });

      totalReconciled += item.amount;
      results.push(settlement);
    }

    // Update order paidAmount
    const allSettlements = await this.prisma.settlement.findMany({
      where: { orderId: dto.orderId, tenantId },
    });
    const newPaidAmount = allSettlements.reduce(
      (sum, s) => sum + Number(s.amount),
      0,
    );

    await this.prisma.order.update({
      where: { id: dto.orderId },
      data: { paidAmount: Math.round(newPaidAmount * 100) / 100 },
    });

    return { settlements: results, totalReconciled };
  }
}
