import {
  Injectable,
  BadRequestException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { generateNo } from '../../common/utils/no-generator';
import { CreateProductionOrderDto } from './dto/create-production-order.dto';
import { UpdateProcessStepDto } from './dto/update-process-step.dto';
import { ProductionOrderStatus, ProcessStepStatus } from '@prisma/client';

@Injectable()
export class ProductionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  // ============================================================
  // 生产工单 CRUD
  // ============================================================

  async findAll(query: {
    page?: number;
    pageSize?: number;
    status?: string;
    orderItemId?: number;
  }) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, status, orderItemId } = query;
    const pageSize = Math.min(query.pageSize ?? 20, 100);

    const where: Record<string, unknown> = { tenantId };
    if (status) where.status = status;
    if (orderItemId) where.orderItemId = orderItemId;

    const [list, total] = await Promise.all([
      this.prisma.productionOrder.findMany({
        where,
        include: {
          orderItem: true,
          processSteps: { orderBy: { sequence: 'asc' as const } },
        },
        skip: (page - 1) * pageSize,
        take: pageSize,
        orderBy: { createdAt: 'desc' as const },
      }),
      this.prisma.productionOrder.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const po = await this.prisma.productionOrder.findFirst({
      where: { id, tenantId },
      include: {
        orderItem: true,
        processSteps: { orderBy: { sequence: 'asc' as const } },
        purchaseOrders: true,
      },
    });
    if (!po) throw new NotFoundException('生产工单不存在');
    return po;
  }

  /**
   * 创建生产工单(1:1 关联定制 OrderItem) + 按工艺链生成工序
   */
  async create(dto: CreateProductionOrderDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      // 1. 校验 OrderItem 存在、是定制件、且未已有生产工单
      const orderItem = await tx.orderItem.findFirst({
        where: { id: dto.orderItemId, tenantId },
      });
      if (!orderItem) throw new NotFoundException('订单条目不存在');
      if (orderItem.source !== 'custom') {
        throw new BadRequestException('仅定制件(source=custom)可创建生产工单');
      }

      const existing = await tx.productionOrder.findUnique({
        where: { orderItemId: dto.orderItemId },
      });
      if (existing) {
        throw new BadRequestException('该订单条目已有生产工单(1:1 关系)');
      }

      // 2. 校验工序链
      this.validateProcessSteps(dto.steps);

      // 3. 创建生产工单 + 工序链
      const productionNo = await generateNo(tx as any, 'MO', tenantId);

      const productionOrder = await tx.productionOrder.create({
        data: {
          tenantId,
          productionNo,
          orderItemId: dto.orderItemId,
          qty: orderItem.qty,
          status: 'planning',
          plannedFinishDate: dto.plannedFinishDate
            ? new Date(dto.plannedFinishDate)
            : null,
          processSteps: {
            create: dto.steps.map((s) => ({
              tenantId,
              sequence: s.sequence,
              stage: s.stage as any,
              stepType: s.stepType as any,
              name: s.name,
              type: s.type as any,
              supplierId: s.supplierId,
              surfaceMethod: s.surfaceMethod,
              status: 'pending',
              plannedQty: s.plannedQty,
              actualQty: 0,
              lossQty: 0,
              remark: s.remark,
            })),
          },
        },
        include: {
          processSteps: { orderBy: { sequence: 'asc' as const } },
        },
      });

      return productionOrder;
    });
  }

  /**
   * 校验工序链合法性:
   * - sequence 从 1 开始连续
   * - 阶段间顺序固定: preparation -> forming -> threading -> post_treatment
   * - 同阶段内可多道,但不能回退到前阶段
   */
  private validateProcessSteps(steps: CreateProductionOrderDto['steps']) {
    if (steps.length === 0) {
      throw new BadRequestException('工序链不能为空');
    }

    const sorted = [...steps].sort((a, b) => a.sequence - b.sequence);

    // sequence 从 1 开始连续
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].sequence !== i + 1) {
        throw new BadRequestException(
          `工序 sequence 必须从 1 开始连续,第 ${i + 1} 道工序 sequence 应为 ${i + 1}`,
        );
      }
    }

    // 阶段间顺序校验
    const stageOrder = [
      'preparation',
      'forming',
      'threading',
      'post_treatment',
    ];
    let lastStageIdx = -1;
    for (const step of sorted) {
      const stageIdx = stageOrder.indexOf(step.stage);
      if (stageIdx < lastStageIdx) {
        throw new BadRequestException(
          `工序阶段顺序错误:${step.name}(${step.stage})不能出现在 ${stageOrder[lastStageIdx]} 之后`,
        );
      }
      lastStageIdx = stageIdx;
    }
  }

  // ============================================================
  // 工序流转
  // ============================================================

  /**
   * 启动生产工单: planning -> in_progress
   * 同时将第一道工序设为 in_progress
   */
  async start(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const po = await this.findOne(id);
    if (po.status !== 'planning') {
      throw new BadRequestException(`工单当前状态 ${po.status} 不可启动`);
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.productionOrder.updateMany({
        where: { id, tenantId },
        data: { status: 'in_progress' },
      });

      // 启动第一道工序
      const firstStep = po.processSteps[0];
      if (firstStep) {
        await tx.processStep.updateMany({
          where: { id: firstStep.id, tenantId },
          data: {
            status: 'in_progress',
            startedAt: new Date(),
          },
        });
      }

      // 联动 Order 状态 -> producing
      await this.syncOrderStatus(tx, tenantId, po.orderItem.orderId);

      return this.findOne(id);
    });
  }

  /**
   * 完成一道工序。
   * - 记录实际产出量和损耗
   * - 自动启动下一道工序
   * - 最后一道工序完成 -> 更新生产工单 completedQty
   */
  async completeStep(
    productionOrderId: number,
    stepId: number,
    dto: UpdateProcessStepDto,
  ) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const step = await tx.processStep.findFirst({
        where: { id: stepId, productionOrderId, tenantId },
      });
      if (!step) throw new NotFoundException('工序不存在');
      if (step.status !== 'in_progress') {
        throw new BadRequestException(`工序当前状态 ${step.status} 不可完成`);
      }

      // 更新工序:记录产出、标记完成
      await tx.processStep.update({
        where: { id: stepId },
        data: {
          status: 'done',
          actualQty: dto.actualQty ?? step.actualQty,
          lossQty: dto.lossQty ?? step.lossQty,
          completedAt: new Date(),
          remark: dto.remark ?? step.remark,
        },
      });

      // 查所有工序,判断是否全部完成
      const allSteps = await tx.processStep.findMany({
        where: { productionOrderId, tenantId },
        orderBy: { sequence: 'asc' as const },
      });

      const allDone = allSteps.every(
        (s: any) => s.status === 'done' || s.status === 'skipped',
      );
      const lastStep = allSteps[allSteps.length - 1];

      if (allDone) {
        // 全部完成 -> 更新生产工单 completedQty = 最后一道工序的实际产出
        const completedQty = lastStep ? lastStep.actualQty : 0;
        await tx.productionOrder.updateMany({
          where: { id: productionOrderId, tenantId },
          data: {
            completedQty,
            status: 'done',
          },
        });

        // 联动 Order 状态
        const prodOrder = await tx.productionOrder.findFirst({
          where: { id: productionOrderId, tenantId },
        });
        if (prodOrder) {
          await this.syncOrderStatus(tx, tenantId, prodOrder.orderItemId);
        }
      } else {
        // 启动下一道 pending 工序
        const nextStep = allSteps.find((s: any) => s.status === 'pending');
        if (nextStep) {
          await tx.processStep.updateMany({
            where: { id: nextStep.id, tenantId },
            data: {
              status: 'in_progress',
              startedAt: new Date(),
            },
          });
        }

        // 部分完成
        const doneCount = allSteps.filter(
          (s: any) => s.status === 'done' || s.status === 'skipped',
        ).length;
        if (doneCount > 0 && !allDone) {
          await tx.productionOrder.updateMany({
            where: { id: productionOrderId, tenantId },
            data: { status: 'partial_done' },
          });
        }
      }

      return this.findOne(productionOrderId);
    });
  }

  /**
   * 跳过一道工序(某些件不需要某道工序)
   */
  async skipStep(productionOrderId: number, stepId: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();

    return this.prisma.$transaction(async (tx) => {
      const step = await tx.processStep.findFirst({
        where: { id: stepId, productionOrderId, tenantId },
      });
      if (!step) throw new NotFoundException('工序不存在');
      if (step.status !== 'pending') {
        throw new BadRequestException(`工序当前状态 ${step.status} 不可跳过`);
      }

      await tx.processStep.updateMany({
        where: { id: stepId, tenantId },
        data: { status: 'skipped' },
      });

      return this.findOne(productionOrderId);
    });
  }

  /**
   * 取消生产工单
   */
  async cancel(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const po = await this.findOne(id);
    if (po.status === 'done') {
      throw new BadRequestException('已完成的工单不可取消');
    }

    await this.prisma.productionOrder.updateMany({
      where: { id, tenantId },
      data: { status: 'cancelled' },
    });
    return this.findOne(id);
  }

  // ============================================================
  // Order 状态联动
  // ============================================================

  /**
   * 同步 Order 状态:
   * - 有工单 in_progress -> Order -> producing
   * - 所有定制件工单 done + 无定制件 -> Order -> ready_to_ship
   */
  private async syncOrderStatus(tx: any, tenantId: number, orderId: number) {
    const order = await tx.order.findFirst({
      where: { id: orderId, tenantId },
      include: { items: true },
    });
    if (!order) return;

    // 查所有定制件的生产工单
    const customItemIds = order.items
      .filter((i: any) => i.source === 'custom')
      .map((i: any) => i.id);

    if (customItemIds.length === 0) {
      // 无定制件 -> ready_to_ship(库存已在下单时扣减)
      await tx.order.updateMany({
        where: { id: orderId, tenantId, status: { in: ['accepted'] } },
        data: { status: 'ready_to_ship' },
      });
      return;
    }

    const productionOrders = await tx.productionOrder.findMany({
      where: { orderItemId: { in: customItemIds }, tenantId },
    });

    const anyInProgress = productionOrders.some(
      (po: any) => po.status === 'in_progress' || po.status === 'partial_done',
    );
    const allDone =
      productionOrders.length === customItemIds.length &&
      productionOrders.every((po: any) => po.status === 'done');

    if (allDone) {
      // 所有定制件完工 -> ready_to_ship
      await tx.order.updateMany({
        where: {
          id: orderId,
          tenantId,
          status: { in: ['accepted', 'sourcing', 'producing'] },
        },
        data: { status: 'ready_to_ship' },
      });
    } else if (anyInProgress) {
      // 有工单在产 -> producing
      await tx.order.updateMany({
        where: {
          id: orderId,
          tenantId,
          status: { in: ['accepted', 'sourcing'] },
        },
        data: { status: 'producing' },
      });
    } else if (productionOrders.length > 0) {
      // 有工单但都还在 planning -> sourcing
      await tx.order.updateMany({
        where: { id: orderId, tenantId, status: { in: ['accepted'] } },
        data: { status: 'sourcing' },
      });
    }
  }
}
