import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateProductDto } from './dto/product/create-product.dto';
import { UpdateProductDto } from './dto/product/update-product.dto';
import { QueryProductDto } from './dto/product/query-product.dto';

@Injectable()
export class ProductService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: QueryProductDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, pageSize = 20, keyword, categoryId, tag } = query;
    const where: any = { tenantId };

    if (categoryId) where.categoryId = categoryId;
    if (keyword) where.OR = [{ name: { contains: keyword } }, { description: { contains: keyword } }];
    if (tag) where.tags = { has: tag };

    const [list, total] = await Promise.all([
      this.prisma.product.findMany({
        where, include: { category: true, skus: true },
        skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const p = await this.prisma.product.findFirst({
      where: { id, tenantId },
      include: { category: true, skus: true },
    });
    if (!p) throw new NotFoundException('商品不存在');
    return p;
  }

  async create(dto: CreateProductDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.product.create({
      data: { ...dto, images: dto.images || [], tags: dto.tags || [], tenantId },
    });
  }

  async update(id: number, dto: UpdateProductDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.findOne(id);
    return this.prisma.product.updateMany({ where: { id, tenantId }, data: dto });
  }

  async remove(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const skuCount = await this.prisma.sku.count({ where: { productId: id, tenantId } });
    if (skuCount > 0) throw new BadRequestException('商品下存在 SKU，请先删除 SKU');
    await this.prisma.product.deleteMany({ where: { id, tenantId } });
  }
}
