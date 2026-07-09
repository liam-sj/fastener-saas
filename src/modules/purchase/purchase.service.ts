import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
import { mul, sum, rnd } from '../../common/utils/money';
import { CreatePurchaseDto } from './dto/create-purchase.dto';
import { PurchaseOrderStatus } from '@prisma/client';

@Injectable()
export class PurchaseService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: {
    page?: number;
    pageSize?: number;
    status?: string;
    supplierId?: number;
    purpose?: string;
  }) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, status, supplierId, purpose } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;
    if (purpose) where.purpose = purpose;

    const [list, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where,
        include: { supplier: true, items: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' as const },
      }),
      this.prisma.purchaseOrder.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
      include: {
        supplier: true,
        items: true,
        processStep: true,
        productionOrder: true,
      },
    });
    if (!po) throw new NotFoundException('采购单不存在');
    return po;
  }

  /**
   * 创建采购单。
   * 三种用途:
   *  - material: 给某定制件买原料(关联 processStepId)
   *  - outsource: 外协加工(关联 processStepId)
   *  - finished_goods: 订单直接买成品(关联 orderItemId)
   *
   * 约束: orderItemId 和 processStepId 至少一个非空(按 purpose 决定)
   */
  async create(dto: CreatePurchaseDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    // 校验用途与关联字段一致性
    this.validatePurposeAssociation(dto);

    // 校验供应商存在
    const supplier = await this.prisma.supplier.findFirst({
      where: { id: dto.supplierId, tenantId },
    });
    if (!supplier) throw new BadRequestException('供应商不存在');

    // 校验关联对象存在
    if (dto.orderItemId) {
      const orderItem = await this.prisma.orderItem.findFirst({
        where: { id: dto.orderItemId, tenantId },
      });
      if (!orderItem) throw new BadRequestException('订单条目不存在');
    }
    if (dto.processStepId) {
      const step = await this.prisma.processStep.findFirst({
        where: { id: dto.processStepId, tenantId },
      });
      if (!step) throw new BadRequestException('工序不存在');
    }
    if (dto.productionOrderId) {
      const prodOrder = await this.prisma.productionOrder.findFirst({
        where: { id: dto.productionOrderId, tenantId },
      });
      if (!prodOrder) throw new BadRequestException('生产工单不存在');
    }

    const purchaseNo = await generateNo(this.prisma, 'PO', tenantId);
    const totalAmount = sum(dto.items.map((i) => mul(i.unitPrice, i.qty)));

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId,
        purchaseNo,
        supplierId: dto.supplierId,
        purpose: dto.purpose as any,
        orderItemId: dto.orderItemId,
        processStepId: dto.processStepId,
        productionOrderId: dto.productionOrderId,
        totalAmount,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        items: {
          create: dto.items.map((i) => ({
            tenantId,
            productName: i.productName,
            skuCode: i.skuCode,
            skuAttrs: {},
            qty: i.qty,
            unitPrice: i.unitPrice,
          })),
        },
      },
      include: { items: true },
    });
  }

  /**
   * 校验采购用途与关联字段的一致性
   */
  private validatePurposeAssociation(dto: CreatePurchaseDto) {
    if (dto.purpose === 'finished_goods') {
      if (!dto.orderItemId) {
        throw new BadRequestException(
          '成品采购(purpose=finished_goods)必须关联 orderItemId',
        );
      }
    } else if (dto.purpose === 'material' || dto.purpose === 'outsource') {
      if (!dto.processStepId) {
        throw new BadRequestException(
          `原料采购/外协加工(purpose=${dto.purpose})必须关联 processStepId`,
        );
      }
    }
  }

  /**
   * 从订单生成成品采购单(为所有未采购的定制件)。
   * purpose=finished_goods,直接关联 orderItem。
   */
  async generateFromOrder(orderId: number, supplierId: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const customItems = await tx.orderItem.findMany({
        where: { orderId, tenantId, source: 'custom', purchaseOrderId: null },
      });
      if (customItems.length === 0)
        throw new BadRequestException('没有需要采购的条目');

      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, tenantId },
      });
      if (!supplier) throw new BadRequestException('供应商不存在');

      const purchaseNo = await generateNo(tx as any, 'PO', tenantId);
      const totalAmount = sum(customItems.map((i) => mul(i.price, i.qty)));

      const po = await tx.purchaseOrder.create({
        data: {
          tenantId,
          purchaseNo,
          supplierId,
          purpose: 'finished_goods',
          totalAmount,
          items: {
            create: customItems.map((i) => ({
              tenantId,
              productName: i.productName,
              skuCode: i.skuCode,
              skuAttrs: i.skuAttrs || {},
              qty: i.qty,
              unitPrice: i.price,
            })),
          },
        },
        include: { items: true },
      });

      // 回填 orderItem.purchaseOrderId
      await tx.orderItem.updateMany({
        where: { id: { in: customItems.map((i) => i.id) } },
        data: { purchaseOrderId: po.id },
      });

      return po;
    });
  }

  async confirm(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.findOne(id);
    return this.prisma.purchaseOrder.updateMany({
      where: { id, tenantId, status: 'pending' },
      data: { status: 'confirmed' },
    });
  }

  private readonly PURCHASE_TRANSITIONS: Record<
    PurchaseOrderStatus,
    PurchaseOrderStatus[]
  > = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['partial_received', 'received', 'cancelled'],
    partial_received: ['received', 'cancelled'],
    received: [],
    cancelled: [],
  };

  async updateStatus(id: number, status: PurchaseOrderStatus) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const po = await this.prisma.purchaseOrder.findFirst({
      where: { id, tenantId },
    });
    if (!po) throw new NotFoundException('采购单不存在');

    const allowed = this.PURCHASE_TRANSITIONS[po.status];
    if (!allowed || !allowed.includes(status)) {
      throw new BadRequestException(`采购单不能从 ${po.status} 转为 ${status}`);
    }

    await this.prisma.purchaseOrder.updateMany({
      where: { id, tenantId },
      data: { status },
    });
  }
}
