import { PrismaClient } from '@prisma/client';

const prefixMap: Record<string, { model: string; field: string }> = {
  BJ: { model: 'quotation', field: 'quotationNo' },
  SO: { model: 'order', field: 'orderNo' },
  PO: { model: 'purchaseOrder', field: 'purchaseNo' },
  IN: { model: 'inboundOrder', field: 'inboundNo' },
  DO: { model: 'deliveryOrder', field: 'deliveryNo' },
};

export async function generateNo(
  prisma: PrismaClient,
  prefix: string,
  tenantId: number,
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefixWithDate = `${prefix}-${dateStr}-`;

  const config = prefixMap[prefix];
  if (!config) throw new Error(`Unknown prefix: ${prefix}`);

  const model = (prisma as any)[config.model];
  const records = await model.findMany({
    where: {
      tenantId,
      [config.field]: { startsWith: prefixWithDate },
    },
    orderBy: { [config.field]: 'desc' },
    take: 1,
  });

  let seq = 1;
  if (records.length > 0) {
    const lastNo: string = records[0][config.field];
    const lastSeq = parseInt(lastNo.split('-').pop() || '0', 10);
    seq = lastSeq + 1;
  }

  return `${prefixWithDate}${String(seq).padStart(3, '0')}`;
}
