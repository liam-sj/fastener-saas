import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

export interface ProcessedOrderItem {
  productName: string;
  skuCode: string;
  skuAttrs: any;
  price: number;
  qty: number;
  source: string;
  costPrice?: number;
}

@Injectable()
export class StockService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * 批量查询 SKU 并原子扣减库存。
   * 在事务内调用，参数 tx 为 Prisma 事务客户端。
   * 返回加工后的订单条目数据（含 source / costPrice）。
   */
  async batchDeduct(
    tx: any,
    tenantId: number,
    items: { skuId: number; qty: number; price: number }[],
  ): Promise<ProcessedOrderItem[]> {
    // 批量预查所有 SKU，避免 N+1
    const skuIds = items.map((i) => i.skuId);
    const skus: any[] = await tx.sku.findMany({
      where: { id: { in: skuIds }, tenantId },
      include: { product: true },
    });
    const skuMap = new Map<number, any>(skus.map((s: any) => [s.id, s]));

    const results: ProcessedOrderItem[] = [];
    for (const item of items) {
      const sku = skuMap.get(item.skuId);
      if (!sku) throw new BadRequestException(`SKU ${item.skuId} 不存在`);

      // 原子扣减库存：stock >= qty 才扣
      const result = await tx.sku.updateMany({
        where: { id: sku.id, stock: { gte: item.qty } },
        data: { stock: { decrement: item.qty } },
      });

      const source: string = result.count > 0 ? 'stock' : 'custom';

      results.push({
        productName: sku.product.name,
        skuCode: sku.skuCode,
        skuAttrs: sku.attributes,
        price: item.price,
        qty: item.qty,
        source,
        costPrice: source === 'stock' ? Number(sku.costPrice) : undefined,
      });
    }
    return results;
  }
}
