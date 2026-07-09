import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateCategoryDto } from './dto/category/create-category.dto';
import { UpdateCategoryDto } from './dto/category/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findTree() {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const all = await this.prisma.category.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return this.buildTree(all);
  }

  private buildTree(categories: any[], parentId: number | null = null): any[] {
    return categories
      .filter((c) => c.parentId === parentId)
      .map((c) => ({ ...c, children: this.buildTree(categories, c.id) }));
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const cat = await this.prisma.category.findFirst({
      where: { id, tenantId },
    });
    if (!cat) throw new NotFoundException('分类不存在');
    return cat;
  }

  async create(dto: CreateCategoryDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.category.create({ data: { ...dto, tenantId } });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.findOne(id);
    return this.prisma.category.updateMany({
      where: { id, tenantId },
      data: dto,
    });
  }

  async remove(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const [childCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id, tenantId } }),
      this.prisma.product.count({ where: { categoryId: id, tenantId } }),
    ]);
    if (childCount > 0 || productCount > 0) {
      throw new BadRequestException('分类下有子分类或商品，无法删除');
    }
    await this.prisma.category.deleteMany({ where: { id, tenantId } });
  }
}
