import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
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
    const { page = 1, pageSize = 20, status, supplierId } = query;
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
    const totalAmount = dto.items.reduce((sum, i) => sum + i.qty * i.unitPrice, 0);

    return this.prisma.purchaseOrder.create({
      data: {
        tenantId, purchaseNo, supplierId: dto.supplierId,
        totalAmount: Math.round(totalAmount * 100) / 100,
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

  async generateFromOrder(orderId: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const customItems = await tx.orderItem.findMany({
        where: { orderId, tenantId, source: 'custom', purchaseOrderId: null },
      });
      if (customItems.length === 0) throw new BadRequestException('没有需要采购的条目');

      const purchaseNo = await generateNo(tx as any, 'PO', tenantId);
      const totalAmount = customItems.reduce((sum, i) => sum + Number(i.price) * i.qty, 0);

      const po = await tx.purchaseOrder.create({
        data: {
          tenantId, purchaseNo, supplierId: 1,
          totalAmount: Math.round(totalAmount * 100) / 100,
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

  async updateStatus(id: number, status: string) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.prisma.purchaseOrder.updateMany({
      where: { id, tenantId },
      data: { status: status as PurchaseOrderStatus },
    });
  }
}
