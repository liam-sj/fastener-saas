import { Injectable, ForbiddenException } from '@nestjs/common';
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

  /**
   * 租户 admin 只能看到自己的租户信息。
   * 如需跨租户管理，需平台超管（isSuperAdmin）角色，当前单租户阶段不开放。
   */
  async findCurrent(query: QueryTenantDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, keyword } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: any = { id: tenantId };
    if (keyword) where.name = { contains: keyword };

    const [list, total] = await Promise.all([
      this.prisma.tenant.findMany({
        where,
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.tenant.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const currentTenantId = this.tenantCtx.getTenantIdOrThrow();
    if (id !== currentTenantId)
      throw new ForbiddenException('无权访问其他租户');
    return this.prisma.tenant.findUnique({ where: { id } });
  }

  async create(dto: CreateTenantDto) {
    // 仅允许平台超管创建新租户，当前单租户阶段此接口不对外暴露
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.tenant.create({ data: dto });
  }

  async update(id: number, dto: UpdateTenantDto) {
    const currentTenantId = this.tenantCtx.getTenantIdOrThrow();
    if (id !== currentTenantId)
      throw new ForbiddenException('无权修改其他租户');
    return this.prisma.tenant.update({ where: { id }, data: dto });
  }

  async remove(id: number) {
    const currentTenantId = this.tenantCtx.getTenantIdOrThrow();
    if (id !== currentTenantId)
      throw new ForbiddenException('无权删除其他租户');
    await this.prisma.tenant.delete({ where: { id } });
  }
}
