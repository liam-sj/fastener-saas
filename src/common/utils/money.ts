import Decimal from 'decimal.js';

/**
 * 金额运算工具 — 全程 decimal.js，只在最外层 toNumber() 返回。
 *
 * 入参建议：字符串 > Prisma Decimal 对象 > number。
 * 关键规则：不要先 Number(decimal) 再传给这些函数——
 *           Number() 会丢精度，直接传原始 Decimal 对象或 .toString()。
 */

/**
 * 金额乘数量：price × qty，返回圆（保留 2 位小数）
 */
export function mul(price: string | number | Decimal, qty: number): number {
  return new Decimal(price).times(qty).toDecimalPlaces(2).toNumber();
}

/**
 * 金额累加：sum([a, b, c])，返回圆
 */
export function sum(values: (string | number | Decimal)[]): number {
  let total = new Decimal(0);
  for (const v of values) {
    total = total.plus(new Decimal(String(v)));
  }
  return total.toDecimalPlaces(2).toNumber();
}

/**
 * 除法：a / b，返回圆
 */
export function div(a: string | number | Decimal, b: number): number {
  if (b === 0) return 0;
  return new Decimal(a).div(b).toDecimalPlaces(2).toNumber();
}

/**
 * 加法：a + b
 */
export function add(
  a: string | number | Decimal,
  b: string | number | Decimal,
): number {
  return new Decimal(a).plus(b).toDecimalPlaces(2).toNumber();
}

/**
 * 减法：a - b
 */
export function sub(
  a: string | number | Decimal,
  b: string | number | Decimal,
): number {
  return new Decimal(a).minus(b).toDecimalPlaces(2).toNumber();
}

/**
 * 四舍五入到 2 位小数
 */
export function rnd(value: string | number | Decimal): number {
  return new Decimal(value).toDecimalPlaces(2).toNumber();
}
