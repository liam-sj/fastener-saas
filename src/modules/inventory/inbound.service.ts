import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
import { CreateInboundDto } from './dto/create-inbound.dto';

@Injectable()
export class InboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: { page?: number; pageSize?: number }) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, pageSize = 20 } = query;
    const where = { tenantId };
    const [list, total] = await Promise.all([
      this.prisma.inboundOrder.findMany({
        where,
        include: { purchaseOrder: true, items: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' as const },
      }),
      this.prisma.inboundOrder.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const io = await this.prisma.inboundOrder.findFirst({
      where: { id, tenantId },
      include: { items: true },
    });
    if (!io) throw new NotFoundException('入库单不存在');
    return io;
  }

  async create(dto: CreateInboundDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const userId = this.tenantCtx.getUserId() || 1;
    const inboundNo = await generateNo(this.prisma, 'IN', tenantId);

    return this.prisma.inboundOrder.create({
      data: {
        tenantId,
        inboundNo,
        purchaseOrderId: dto.purchaseOrderId,
        operatorId: userId,
        items: {
          create: dto.items.map((item) => ({
            tenantId,
            purchaseOrderItemId: item.purchaseOrderItemId,
            skuCode: item.skuCode,
            productName: item.productName,
            skuAttrs: item.skuAttrs,
            qty: item.qty,
            unitCost: item.unitCost,
          })),
        },
      },
      include: { items: true },
    });
  }

  async confirm(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const inbound = await tx.inboundOrder.findFirst({
        where: { id, tenantId },
        include: { items: true },
      });
      if (!inbound) throw new NotFoundException('入库单不存在');
      if (inbound.status !== 'pending') throw new BadRequestException('仅待确认状态可入库');

      // 批量预查所有 SKU，避免 N+1
      const skuCodes = inbound.items.map((i) => i.skuCode);
      const skus = await tx.sku.findMany({
        where: { tenantId, skuCode: { in: skuCodes } },
      });
      const skuMap = new Map(skus.map((s) => [s.skuCode, s]));

      for (const item of inbound.items) {
        // 1. 原子更新采购单条目的已收数量
        if (item.purchaseOrderItemId) {
          await tx.purchaseOrderItem.updateMany({
            where: { id: item.purchaseOrderItemId, tenantId },
            data: { receivedQty: { increment: item.qty } },
          });
        }

        // 2. 加权平均更新 SKU 成本价和库存
        const sku = skuMap.get(item.skuCode);
        if (sku) {
          const oldStock = sku.stock;
          const oldCostPrice = Number(sku.costPrice);
          const unitCost = Number(item.unitCost);
          const newStock = oldStock + item.qty;
          const newTotalValue = oldStock * oldCostPrice + item.qty * unitCost;
          const newCostPrice =
            newStock > 0 ? Math.round((newTotalValue / newStock) * 100) / 100 : 0;

          await tx.sku.updateMany({
            where: { id: sku.id },
            data: { stock: { increment: item.qty }, costPrice: newCostPrice },
          });
        }

        // 3. 回填定制件 OrderItem 的成本
        if (inbound.purchaseOrderId) {
          await tx.orderItem.updateMany({
            where: {
              tenantId,
              purchaseOrderId: inbound.purchaseOrderId,
              skuCode: item.skuCode,
              source: 'custom',
              costPrice: null,
            },
            data: { costPrice: item.unitCost },
          });
        }
      }

      // 4. 入库单状态改为已确认
      await tx.inboundOrder.updateMany({
        where: { id, tenantId },
        data: { status: 'confirmed' },
      });

      // 5. 同步采购单状态
      if (inbound.purchaseOrderId) {
        const allPoItems = await tx.purchaseOrderItem.findMany({
          where: { purchaseOrderId: inbound.purchaseOrderId, tenantId },
        });
        const allReceived = allPoItems.every((i) => i.receivedQty >= i.qty);
        await tx.purchaseOrder.updateMany({
          where: { id: inbound.purchaseOrderId },
          data: { status: allReceived ? 'received' : 'partial_received' },
        });
      }
    });
  }
}
