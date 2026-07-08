import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { ReconcileDto } from './dto/reconcile.dto';
import { QuerySummaryDto } from './dto/query-summary.dto';
import { mul, sum, sub, rnd, add } from '../../common/utils/money';

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
      const settledAmount = sum(itemSettlements.map((s) => Number(s.amount)));
      const itemTotal = mul(Number(item.price), item.qty);
      return {
        itemId: item.id,
        productName: item.productName,
        skuCode: item.skuCode,
        price: Number(item.price),
        qty: item.qty,
        total: rnd(itemTotal),
        settledAmount: rnd(settledAmount),
        unpaidAmount: sub(itemTotal, settledAmount),
        settlements: itemSettlements,
      };
    });

    const orderTotal = sum(itemsWithSettlement.map((i) => i.total));
    const totalSettled = sum(itemsWithSettlement.map((i) => i.settledAmount));

    return {
      orderId: order.id,
      orderNo: order.orderNo,
      customer: order.customer,
      status: order.status,
      totalAmount: rnd(orderTotal),
      paidAmount: Number(order.paidAmount),
      settledAmount: rnd(totalSettled),
      unpaidAmount: sub(orderTotal, totalSettled),
      items: itemsWithSettlement,
    };
  }

  async getSummary(query: QuerySummaryDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, customerId, status } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

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
      const orderTotal = sum(order.items.map((i) => mul(Number(i.price), i.qty)));
      const totalSettled = sum(order.settlements.map((s) => Number(s.amount)));
      return {
        orderId: order.id,
        orderNo: order.orderNo,
        customer: order.customer,
        status: order.status,
        totalAmount: rnd(orderTotal),
        paidAmount: Number(order.paidAmount),
        settledAmount: rnd(totalSettled),
        unpaidAmount: sub(orderTotal, totalSettled),
      };
    });

    return { list, total, page, pageSize };
  }

  async reconcile(dto: ReconcileDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findFirst({
        where: { id: dto.orderId, tenantId },
        include: { items: true },
      });
      if (!order) throw new NotFoundException('订单不存在');

      const results: any[] = [];
      let totalReconciled = 0;

      for (const item of dto.items) {
        const orderItem = await tx.orderItem.findFirst({
          where: { id: item.orderItemId, orderId: dto.orderId, tenantId },
        });
        if (!orderItem)
          throw new BadRequestException(
            `OrderItem ${item.orderItemId} 不属于该订单`,
          );

        // Check overpayment
        const existingSettlements = await tx.settlement.findMany({
          where: { orderItemId: item.orderItemId, tenantId },
        });
        const alreadySettled = sum(existingSettlements.map((s) => Number(s.amount)));
        const itemTotal = mul(Number(orderItem.price), orderItem.qty);
        if (alreadySettled + item.amount > itemTotal) {
          throw new BadRequestException(
            `OrderItem ${item.orderItemId} 收款金额超过条目总额`,
          );
        }

        await tx.settlement.create({
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
        results.push({ orderItemId: item.orderItemId, amount: item.amount });
      }

      // Update order paidAmount
      const allSettlements = await tx.settlement.findMany({
        where: { orderId: dto.orderId, tenantId },
      });
      const newPaidAmount = sum(allSettlements.map((s) => Number(s.amount)));

      await tx.order.update({
        where: { id: dto.orderId },
        data: { paidAmount: newPaidAmount },
      });

      return { settlements: results, totalReconciled };
    });
  }
}
