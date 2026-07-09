import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: QueryCustomerDto) {
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
      this.prisma.customer.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.customer.findFirst({ where: { id, tenantId } });
  }

  async create(dto: CreateCustomerDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.customer.create({ data: { ...dto, tenantId } });
  }

  async update(id: number, dto: UpdateCustomerDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.findOne(id);
    return this.prisma.customer.updateMany({
      where: { id, tenantId },
      data: dto,
    });
  }

  async remove(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.prisma.customer.deleteMany({ where: { id, tenantId } });
  }
}
