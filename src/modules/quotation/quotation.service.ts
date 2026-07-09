import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
import { StockService } from '../inventory/stock.service';
import { PurchaseRequestService } from '../purchase-request/purchase-request.service';
import { mul, sum, rnd } from '../../common/utils/money';
import { CreateQuotationDto } from './dto/create-quotation.dto';
import { UpdateQuotationDto } from './dto/update-quotation.dto';
import { QueryQuotationDto } from './dto/query-quotation.dto';

@Injectable()
export class QuotationService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
    private readonly stockService: StockService,
    private readonly purchaseRequestService: PurchaseRequestService,
  ) {}

  async findAll(query: QueryQuotationDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, status, customerId, purchaseRequestId, keyword } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (purchaseRequestId) where.purchaseRequestId = purchaseRequestId;
    if (keyword) where.quotationNo = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.quotation.findMany({
        where,
        include: { customer: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { id: 'desc' as const },
      }),
      this.prisma.quotation.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.prisma.quotation.findFirst({
      where: { id, tenantId },
      include: { customer: true, purchaseRequest: true },
    });
    if (!q) throw new NotFoundException('报价单不存在');
    return q;
  }

  /**
   * 创建报价单。
   * 若关联了 purchaseRequestId:
   *  - 自动计算版本号(同订购单下已有最大版本 +1)
   *  - 订购单状态 → quoting
   */
  async create(dto: CreateQuotationDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const quotationNo = await generateNo(this.prisma, 'BJ', tenantId);

    // 计算版本号
    let version = 1;
    if (dto.purchaseRequestId) {
      // 校验订购单存在且属于同一客户
      const pr = await this.prisma.purchaseRequest.findFirst({
        where: { id: dto.purchaseRequestId, tenantId },
      });
      if (!pr) throw new BadRequestException('订购单不存在');
      if (pr.customerId !== dto.customerId) {
        throw new BadRequestException('订购单客户与报价单客户不一致');
      }

      // 查同订购单下已有最大版本号
      const existing = await this.prisma.quotation.findFirst({
        where: { purchaseRequestId: dto.purchaseRequestId, tenantId },
        orderBy: { version: 'desc' as const },
      });
      if (existing) {
        version = existing.version + 1;
        // 将前一版标记为 superseded
        await this.prisma.quotation.updateMany({
          where: { id: existing.id, tenantId },
          data: { status: 'superseded' },
        });
      }
    }

    const itemsWithDetails = await Promise.all(
      dto.items.map(async (item) => {
        const sku = await this.prisma.sku.findFirst({
          where: { id: item.skuId, tenantId },
          include: { product: true },
        });
        if (!sku) throw new BadRequestException(`SKU ${item.skuId} 不存在`);
        return {
          productId: sku.productId,
          skuId: sku.id,
          skuCode: sku.skuCode,
          productName: sku.product.name,
          attrs: sku.attributes,
          qty: item.qty,
          unitPrice: item.unitPrice,
          amount: mul(item.unitPrice, item.qty),
        };
      }),
    );

    const totalAmount = sum(itemsWithDetails.map((i) => i.amount));
    const quotation = await this.prisma.quotation.create({
      data: {
        tenantId,
        quotationNo,
        customerId: dto.customerId,
        purchaseRequestId: dto.purchaseRequestId,
        version,
        items: itemsWithDetails,
        totalAmount,
        validUntil: dto.validUntil ? new Date(dto.validUntil) : null,
      },
      include: { purchaseRequest: true },
    });

    // 若关联了订购单,将订购单状态推进到 quoting
    if (dto.purchaseRequestId) {
      await this.prisma.purchaseRequest.updateMany({
        where: { id: dto.purchaseRequestId, tenantId },
        data: { status: 'quoting' },
      });
    }

    return quotation;
  }

  async update(id: number, dto: UpdateQuotationDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.findOne(id);
    if (q.status !== 'draft') throw new BadRequestException('仅草稿状态可编辑');
    return this.prisma.quotation.updateMany({
      where: { id, tenantId },
      data: dto,
    });
  }

  async send(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.findOne(id);
    if (q.status !== 'draft') throw new BadRequestException('仅草稿状态可发送');
    await this.prisma.quotation.updateMany({
      where: { id, tenantId },
      data: { status: 'sent' },
    });

    // 若关联了订购单,推进到 quoted
    if (q.purchaseRequestId) {
      await this.prisma.purchaseRequest.updateMany({
        where: { id: q.purchaseRequestId, tenantId },
        data: { status: 'quoted' },
      });
    }

    return this.findOne(id);
  }

  /**
   * 客户接受报价 → 自动生成 Order + 联动订购单状态
   */
  async accept(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.findOne(id);
    if (q.status !== 'sent')
      throw new BadRequestException('仅已发送状态可接受');

    await this.prisma.quotation.updateMany({
      where: { id, tenantId },
      data: { status: 'accepted' },
    });

    // 联动订购单状态 → accepted
    if (q.purchaseRequestId) {
      await this.prisma.purchaseRequest.updateMany({
        where: { id: q.purchaseRequestId, tenantId },
        data: { status: 'accepted' },
      });
    }

    const items = q.items as Array<{
      skuId: number;
      qty: number;
      unitPrice: number;
    }>;
    const orderItems = items.map((i) => ({
      skuId: i.skuId,
      qty: i.qty,
      price: i.unitPrice,
    }));
    const order = await this.createOrderFromQuotation(
      tenantId,
      q.customerId,
      id,
      q.purchaseRequestId,
      orderItems,
    );
    return { quotation: await this.findOne(id), order };
  }

  private async createOrderFromQuotation(
    tenantId: number,
    customerId: number,
    quotationId: number,
    purchaseRequestId: number | null,
    items: { skuId: number; qty: number; price: number }[],
  ) {
    return this.prisma.$transaction(async (tx) => {
      const orderNo = await generateNo(tx as any, 'SO', tenantId);
      const processedItems = await this.stockService.batchDeduct(
        tx,
        tenantId,
        items,
      );
      const totalAmount = sum(processedItems.map((i) => mul(i.price, i.qty)));

      return tx.order.create({
        data: {
          tenantId,
          orderNo,
          customerId,
          quotationId,
          purchaseRequestId: purchaseRequestId ?? undefined,
          totalAmount,
          status: 'accepted',
          items: {
            create: processedItems.map((item) => ({
              tenantId,
              productName: item.productName,
              skuCode: item.skuCode,
              skuAttrs: item.skuAttrs ?? undefined,
              price: item.price,
              qty: item.qty,
              source: item.source,
              costPrice: item.costPrice,
            })) as any,
          },
        },
        include: { items: true },
      });
    });
  }

  /**
   * 客户拒绝报价。
   * 报价单标记为 rejected,商户可基于同一订购单创建新版报价。
   */
  async reject(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.findOne(id);
    if (q.status !== 'sent')
      throw new BadRequestException('仅已发送状态可拒绝');
    await this.prisma.quotation.updateMany({
      where: { id, tenantId },
      data: { status: 'rejected' },
    });
  }

  /**
   * 基于被拒绝的报价单创建新版本。
   * 旧版自动 superseded,新版以 draft 状态返回供编辑。
   */
  async createNewVersion(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const old = await this.findOne(id);

    if (!old.purchaseRequestId) {
      throw new BadRequestException('仅关联了订购单的报价单可创建新版本');
    }
    if (old.status !== 'rejected') {
      throw new BadRequestException('仅被拒绝的报价单可创建新版本');
    }

    // 复制旧版条目,创建新版
    const oldItems = old.items as Array<{
      productId: number;
      skuId: number;
      skuCode: string;
      productName: string;
      attrs: any;
      qty: number;
      unitPrice: number;
    }>;

    return this.create({
      customerId: old.customerId,
      purchaseRequestId: old.purchaseRequestId,
      items: oldItems.map((i) => ({
        productId: i.productId,
        skuId: i.skuId,
        unitPrice: i.unitPrice,
        qty: i.qty,
      })),
      validUntil: old.validUntil ? old.validUntil.toISOString() : undefined,
    });
  }

  async remove(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const q = await this.findOne(id);
    if (q.status !== 'draft') throw new BadRequestException('仅草稿状态可删除');
    await this.prisma.quotation.deleteMany({ where: { id, tenantId } });
  }
}
