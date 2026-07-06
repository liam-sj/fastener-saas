import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
import { CreateInboundDto } from './dto/create-inbound.dto';

@Injectable()
export class InboundService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  private get db(): any { return this.prisma; }

  async findAll(query: { page?: number; pageSize?: number }) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, pageSize = 20 } = query;
    const where = { tenantId };
    const [list, total] = await Promise.all([
      this.db.inboundOrder.findMany({
        where, include: { purchaseOrder: true },
        skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { id: 'desc' as const },
      }),
      this.db.inboundOrder.count({ where }),
    ]);
    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const io = await this.db.inboundOrder.findFirst({ where: { id, tenantId } });
    if (!io) throw new NotFoundException('入库单不存在');
    return io;
  }

  async create(dto: CreateInboundDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const userId = this.tenantCtx.getUserId() || 1;
    const inboundNo = await generateNo(this.prisma as any, 'IN', tenantId);

    return this.db.inboundOrder.create({
      data: { tenantId, inboundNo, purchaseOrderId: dto.purchaseOrderId, items: dto.items, operatorId: userId },
    });
  }

  async confirm(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const inbound = await this.db.inboundOrder.findFirst({
      where: { id, tenantId },
      include: { purchaseOrder: { include: { items: true } } },
    });
    if (!inbound) throw new NotFoundException('入库单不存在');
    if (inbound.status !== 'pending') throw new BadRequestException('仅待确认状态可入库');

    const items = inbound.items as Array<{ purchaseItemId: number; qty: number }>;

    for (const item of items) {
      const poItem = await this.db.purchaseOrderItem.findFirst({
        where: { id: item.purchaseItemId, tenantId },
      });
      if (poItem) {
        await this.db.purchaseOrderItem.update({
          where: { id: poItem.id },
          data: { receivedQty: poItem.receivedQty + item.qty },
        });
        await this.db.sku.updateMany({
          where: { skuCode: poItem.skuCode, tenantId },
          data: { stock: { increment: item.qty } },
        });
      }
    }

    await this.db.inboundOrder.updateMany({ where: { id, tenantId }, data: { status: 'confirmed' } });

    const allPoItems = await this.db.purchaseOrderItem.findMany({
      where: { purchaseOrderId: inbound.purchaseOrderId!, tenantId },
    });
    const allReceived = allPoItems.every((i: any) => i.receivedQty >= i.qty);
    await this.db.purchaseOrder.updateMany({
      where: { id: inbound.purchaseOrderId! },
      data: { status: allReceived ? 'received' : 'partial_received' },
    });
  }
}
