import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateSupplierDto } from './dto/create-supplier.dto';
import { UpdateSupplierDto } from './dto/update-supplier.dto';
import { QuerySupplierDto } from './dto/query-supplier.dto';

@Injectable()
export class SupplierService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: QuerySupplierDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, keyword } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const where: any = { tenantId };
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { contact: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }

    const [list, total] = await Promise.all([
      this.prisma.supplier.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.supplier.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.supplier.findFirst({ where: { id, tenantId } });
  }

  async create(dto: CreateSupplierDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.supplier.create({ data: { ...dto, tenantId } });
  }

  async update(id: number, dto: UpdateSupplierDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.findOne(id);
    return this.prisma.supplier.updateMany({
      where: { id, tenantId },
      data: dto,
    });
  }

  async remove(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.prisma.supplier.deleteMany({ where: { id, tenantId } });
  }
}
