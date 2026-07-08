import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QueryQuotationDto } from './dto/query-quotation.dto';

@Injectable()
export class QuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: QueryQuotationDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, pageSize = 20, status, customerId, keyword } = query;
    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (keyword) where.quotationNo = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where, include: { customer: true },
        skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { id: 'desc' as const },
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.prisma.quotation.findFirst({
      where: { id, tenantId }, include: { customer: true },
    });
    if (!q) throw new NotFoundException('报价单不存在');
    return q;
  }

  async create(dto: CreateQuotationDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const quotationNo = await generateNo(this.prisma, 'BJ', tenantId);

    const itemsWithDetails = await Promise.all(
      dto.items.map(async (item) => {
        const sku = await this.prisma.sku.findFirst({
          where: { id: item.skuId, tenantId }, include: { product: true },
        });
        if (!sku) throw new BadRequestException(`SKU ${item.skuId} 不存在`);
        return {
          productId: sku.productId, skuId: sku.id, skuCode: sku.skuCode,
          productName: sku.product.name, attrs: sku.attributes,
          qty: item.qty, unitPrice: item.unitPrice,
          amount: Math.round(item.qty * item.unitPrice * 100) / 100,
        };
      }),
    );

    const totalAmount = itemsWithDetails.reduce((sum, i) => sum + i.amount, 0);
    return this.prisma.quotation.create({
      data: {
        tenantId, quotationNo, customerId: dto.customerId,
        items: itemsWithDetails,
        totalAmount: Math.round(totalAmount * 100) / 100,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      },
    });
  }

  async update(id: number, dto: UpdateQuotationDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.findOne(id);
    if (q.status !== 'draft') throw new BadRequestException('仅草稿状态可编辑');
    return this.prisma.quotation.updateMany({ where: { id, tenantId }, data: dto });
  }

  async send(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.findOne(id);
    if (q.status !== 'draft') throw new BadRequestException('仅草稿状态可发送');
    await this.prisma.quotation.updateMany({ where: { id, tenantId }, data: { status: 'sent' } });
    return this.findOne(id);
  }

  async accept(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.findOne(id);
    if (q.status !== 'sent') throw new BadRequestException('仅已发送状态可接受');

    await this.prisma.quotation.updateMany({ where: { id, tenantId }, data: { status: 'accepted' } });

    const items = q.items as Array<{ skuId: number; qty: number; unitPrice: number }>;
    const orderItems = items.map((i) => ({ skuId: i.skuId, qty: i.qty, price: i.unitPrice }));
    const order = await this.createOrderFromQuotation(tenantId, q.customerId, id, orderItems);
    return { quotation: await this.findOne(id), order };
  }

  private async createOrderFromQuotation(
    tenantId: number, customerId: number, quotationId: number,
    items: { skuId: number; qty: number; price: number }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const orderNo = await generateNo(tx as any, 'SO', tenantId);
      const processedItems = await this.processOrderItemsInTx(tx, tenantId, items);
      const totalAmount = processedItems.reduce((sum, i) => sum + Number(i.price) * i.qty, 0);

      return tx.order.create({
        data: {
          tenantId, orderNo, customerId, quotationId,
          totalAmount: Math.round(totalAmount * 100) / 100,
          items: {
            create: processedItems.map((item) => ({
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

  private async processOrderItemsInTx(
    tx: any, tenantId: number,
    items: { skuId: number; qty: number; price: number }[],
  ) {
    return Promise.all(items.map(async (item) => {
      const sku = await tx.sku.findFirst({
        where: { id: item.skuId, tenantId }, include: { product: true },
      });
      if (!sku) throw new BadRequestException(`SKU ${item.skuId} 不存在`);

      // 原子扣减库存
      const result = await tx.sku.updateMany({
        where: { id: sku.id, stock: { gte: item.qty } },
        data: { stock: { decrement: item.qty } },
      });

      const source = result.count > 0 ? 'stock' : 'custom';
      return {
        productName: sku.product.name, skuCode: sku.skuCode,
        skuAttrs: sku.attributes, price: item.price, qty: item.qty,
        source,
        costPrice: source === 'stock' ? Number(sku.costPrice) : undefined,
      };
    }));
  }

  async reject(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.findOne(id);
    if (q.status !== 'sent') throw new BadRequestException('仅已发送状态可拒绝');
    await this.prisma.quotation.updateMany({ where: { id, tenantId }, data: { status: 'rejected' } });
  }

  async remove(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.findOne(id);
    if (q.status !== 'draft') throw new BadRequestException('仅草稿状态可删除');
    await this.prisma.quotation.deleteMany({ where: { id, tenantId } });
  }
}
