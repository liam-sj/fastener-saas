import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateSkuDto } from './dto/sku/create-sku.dto';
import { UpdateSkuDto } from './dto/sku/update-sku.dto';
import { getCategoryAbbreviation } from './common/constants/category-abbreviations';

@Injectable()
export class SkuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  private async generateSkuCode(
    productId: number,
    tenantId: number,
    attributes: Record<string, string>,
  ): Promise<string> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('商品不存在');

    const abbrev = getCategoryAbbreviation(product.category.name);
    const spec = attributes['规格'] || '';
    const length = attributes['长度'] || '';
    const material = attributes['材质'] || '';
    const surface = attributes['表面处理'] || '';
    const parts = [abbrev];
    if (spec) parts.push(length ? `${spec}x${length}` : spec);
    if (material) parts.push(material);
    if (surface) parts.push(surface);
    return parts.join('-');
  }

  async findByProduct(productId: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.sku.findMany({
      where: { productId, tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(productId: number, dto: CreateSkuDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const attributes = dto.attributes;
    const skuCode = await this.generateSkuCode(productId, tenantId, attributes);

    const existing = await this.prisma.sku.findFirst({
      where: { productId, skuCode, tenantId },
    });
    if (existing) throw new ConflictException('SKU 编码已存在');

    return this.prisma.sku.create({
      data: {
        productId,
        tenantId,
        skuCode,
        attributes: dto.attributes,
        price: dto.price,
        stock: dto.stock ?? 0,
      },
    });
  }

  async update(productId: number, skuId: number, dto: UpdateSkuDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const sku = await this.prisma.sku.findFirst({
      where: { id: skuId, productId, tenantId },
    });
    if (!sku) throw new NotFoundException('SKU 不存在');
    return this.prisma.sku.updateMany({
      where: { id: skuId, tenantId },
      data: dto,
    });
  }

  async remove(productId: number, skuId: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.prisma.sku.deleteMany({
      where: { id: skuId, productId, tenantId },
    });
  }
}
