import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
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

  async findAll(query: { page?: number; pageSize?: number; status?: string; supplierId?: number }) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, status, supplierId } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (supplierId) where.supplierId = supplierId;

    const [list, total] = await Promise.all([
      this.prisma.purchaseOrder.findMany({
        where, include: { supplier: true, items: true },
        skip: (page - 1) * pageSize, take: pageSize,
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
      include: { supplier: true, items: true },
    });
    if (!po) throw new NotFoundException('采购单不存在');
    return po;
  }

  async create(dto: CreatePurchaseDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const purchaseNo = await generateNo(this.prisma, 'PO', tenantId);
    const totalAmount = sum(dto.items.map((i) => mul(i.unitPrice, i.qty)));

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId, purchaseNo, supplierId: dto.supplierId,
        totalAmount,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        items: {
          create: dto.items.map((i) => ({
            tenantId, productName: i.productName, skuCode: i.skuCode,
            skuAttrs: {}, qty: i.qty, unitPrice: i.unitPrice,
          })),
        },
      },
      include: { items: true },
    });
  }

  async generateFromOrder(orderId: number, supplierId: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const customItems = await tx.orderItem.findMany({
        where: { orderId, tenantId, source: 'custom', purchaseOrderId: null },
      });
      if (customItems.length === 0) throw new BadRequestException('没有需要采购的条目');

      // Verify supplier exists
      const supplier = await tx.supplier.findFirst({
        where: { id: supplierId, tenantId },
      });
      if (!supplier) throw new BadRequestException('供应商不存在');

      const purchaseNo = await generateNo(tx as any, 'PO', tenantId);
      const totalAmount = sum(customItems.map((i) => mul(i.price, i.qty)));

      const po = await tx.purchaseOrder.create({
        data: {
          tenantId, purchaseNo, supplierId,
          totalAmount,
          items: {
            create: customItems.map((i) => ({
              tenantId, productName: i.productName, skuCode: i.skuCode,
              skuAttrs: i.skuAttrs || {}, qty: i.qty, unitPrice: i.price,
            })),
          },
        },
        include: { items: true },
      });

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

  private readonly PURCHASE_TRANSITIONS: Record<PurchaseOrderStatus, PurchaseOrderStatus[]> = {
    pending: ['confirmed', 'cancelled'],
    confirmed: ['partial_received', 'received', 'cancelled'],
    partial_received: ['received', 'cancelled'],
    received: [],
    cancelled: [],
  } as Record<PurchaseOrderStatus, PurchaseOrderStatus[]>;

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
