import { PrismaClient } from '@prisma/client';

/**
 * 生成业务单号：{prefix}-{YYYYMMDD}-{3-digit-seq}
 *
 * 使用独立序列表 Sequence（行级锁）保证并发安全：
 *  - 同一租户 + 同一前缀 + 同一天内，upsert + increment 原子的递增序号
 *  - 不依赖外部锁/Redis，完全由数据库保证唯一性
 */
export async function generateNo(
  prisma: PrismaClient,
  prefix: string,
  tenantId: number,
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');

  const seq = await prisma.$transaction(async (tx) => {
    const row = await (tx as any).sequence.upsert({
      where: {
        tenantId_prefix_dateStr: { tenantId, prefix, dateStr },
      },
      update: { seq: { increment: 1 } },
      create: { tenantId, prefix, dateStr, seq: 1 },
    });
    return row.seq;
  });

  return `${prefix}-${dateStr}-${String(seq).padStart(3, '0')}`;
}
