import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { QueryTenantDto } from './dto/query-tenant.dto';

@Injectable()
export class TenantService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: QueryTenantDto) {
    const { page = 1, pageSize = 20, keyword } = query;
    const where: any = {};
    if (keyword) where.name = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async create(dto: CreateTenantDto) {
    return this.prisma.tenant.create({ data: dto });
  }

  async update(id: number, dto: UpdateTenantDto) {
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    await this.prisma.tenant.delete({ where: { id } });
  }
}
