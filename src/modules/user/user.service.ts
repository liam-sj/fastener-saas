import { Injectable, BadRequestException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUserDto } from './dto/query-user.dto';

@Injectable()
export class UserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: QueryUserDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, keyword, role } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);
    const where: any = { tenantId };
    if (keyword) where.username = { contains: keyword };
    if (role) where.role = role;

    const [list, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: { id: true, username: true, role: true, tenantId: true, createdAt: true },
        skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { createdAt: 'desc' as const },
      }),
      this.prisma.user.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.user.findFirst({
      where: { id, tenantId },
      select: { id: true, username: true, role: true, tenantId: true, createdAt: true },
    });
  }

  async create(dto: CreateUserDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const hashedPassword = await bcrypt.hash(dto.password, 10);
    return this.prisma.user.create({
      data: {
        tenantId, username: dto.username, password: hashedPassword,
        role: dto.role as any,
      },
      select: { id: true, username: true, role: true, tenantId: true, createdAt: true },
    });
  }

  async update(id: number, dto: UpdateUserDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const userId = this.tenantCtx.getUserId();

    // 不能降级自己的管理员角色
    if (dto.role && dto.role !== 'admin' && id === userId) {
      throw new BadRequestException('不能降级自己的管理员角色');
    }

    // 若降级他人导致租户无 admin，拒绝
    if (dto.role && dto.role !== 'admin') {
      const target = await this.prisma.user.findFirst({ where: { id, tenantId } });
      if (target?.role === 'admin') {
        const adminCount = await this.prisma.user.count({ where: { tenantId, role: 'admin' } });
        if (adminCount <= 1) throw new BadRequestException('租户至少需保留一个管理员');
      }
    }

    const data: any = { ...dto };
    if (dto.password) {
      data.password = await bcrypt.hash(dto.password, 10);
    }
    await this.prisma.user.updateMany({ where: { id, tenantId }, data });
  }

  async remove(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.prisma.user.deleteMany({ where: { id, tenantId } });
  }
}
