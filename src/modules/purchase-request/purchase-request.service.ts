import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
import { CreatePurchaseRequestDto } from './dto/create-purchase-request.dto';
import { QueryPurchaseRequestDto } from './dto/query-purchase-request.dto';
import { MatchSkuDto } from './dto/match-sku.dto';
import { PurchaseRequestStatus } from '@prisma/client';

@Injectable()
export class PurchaseRequestService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: QueryPurchaseRequestDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, status, customerId, keyword } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (customerId) where.customerId = customerId;
    if (keyword) where.requestNo = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.purchaseRequest.findMany({
        where,
        include: { customer: true, items: true },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' as const },
      }),
      this.prisma.purchaseRequest.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const pr = await this.prisma.purchaseRequest.findFirst({
      where: { id, tenantId },
      include: {
        customer: true,
        items: true,
        quotations: { orderBy: { version: 'desc' as const } },
      },
    });
    if (!pr) throw new NotFoundException('订购单不存在');
    return pr;
  }

  async create(dto: CreatePurchaseRequestDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    // 校验客户存在
    const customer = await this.prisma.customer.findFirst({
      where: { id: dto.customerId, tenantId },
    });
    if (!customer) throw new BadRequestException('客户不存在');

    const requestNo = await generateNo(this.prisma, 'PR', tenantId);

    return this.prisma.purchaseRequest.create({
      data: {
        tenantId,
        requestNo,
        customerId: dto.customerId,
        expectedDate: dto.expectedDate ? new Date(dto.expectedDate) : null,
        remark: dto.remark,
        items: {
          create: dto.items.map((item) => ({
            tenantId,
            productName: item.productName,
            specText: item.specText,
            attributes: item.attributes ?? undefined,
            qty: item.qty,
            targetPrice: item.targetPrice,
            skuId: item.skuId,
          })) as any,
        },
      },
      include: { items: true },
    });
  }

  /**
   * 开始报价: 订购单状态 pending → quoting
   */
  async startQuoting(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const pr = await this.findOne(id);
    if (pr.status !== 'pending') {
      throw new BadRequestException('仅 pending 状态可开始报价');
    }

    await this.prisma.purchaseRequest.updateMany({
      where: { id, tenantId },
      data: { status: 'quoted' },
    });
    return this.findOne(id);
  }

  /**
   * 商户对订购单条目匹配 SKU(客户要的东西系统里可能还没有)
   */
  async matchSku(requestId: number, itemId: number, dto: MatchSkuDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    const item = await this.prisma.purchaseRequestItem.findFirst({
      where: { id: itemId, purchaseRequestId: requestId, tenantId },
    });
    if (!item) throw new NotFoundException('订购单条目不存在');

    // 若提供了 skuId,校验 SKU 存在
    if (dto.skuId) {
      const sku = await this.prisma.sku.findFirst({
        where: { id: dto.skuId, tenantId },
      });
      if (!sku) throw new BadRequestException(`SKU ${dto.skuId} 不存在`);
    }

    return this.prisma.purchaseRequestItem.update({
      where: { id: itemId },
      data: {
        skuId: dto.skuId ?? null,
      },
    });
  }

  /**
   * 客户接受: 订购单状态 → accepted
   * (通常由 Quotation.accept 联动调用)
   */
  async accept(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const pr = await this.findOne(id);
    if (pr.status !== 'quoted' && pr.status !== 'pending') {
      throw new BadRequestException(`订购单当前状态 ${pr.status} 不可接受`);
    }

    await this.prisma.purchaseRequest.updateMany({
      where: { id, tenantId },
      data: { status: 'accepted' },
    });
    return this.findOne(id);
  }

  /**
   * 客户拒绝: 订购单状态 → rejected
   */
  async reject(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const pr = await this.findOne(id);
    if (pr.status === 'accepted' || pr.status === 'cancelled') {
      throw new BadRequestException(`订购单当前状态 ${pr.status} 不可拒绝`);
    }

    await this.prisma.purchaseRequest.updateMany({
      where: { id, tenantId },
      data: { status: 'rejected' },
    });
  }

  /**
   * 取消订购单
   */
  async cancel(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const pr = await this.findOne(id);
    if (pr.status === 'accepted') {
      throw new BadRequestException('已接受的订购单不可取消');
    }

    await this.prisma.purchaseRequest.updateMany({
      where: { id, tenantId },
      data: { status: 'cancelled' },
    });
    return this.findOne(id);
  }

  /**
   * 删除订购单(仅 pending 状态)
   */
  async remove(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const pr = await this.findOne(id);
    if (pr.status !== 'pending') {
      throw new BadRequestException('仅 pending 状态可删除');
    }
    await this.prisma.purchaseRequest.deleteMany({ where: { id, tenantId } });
  }
}
