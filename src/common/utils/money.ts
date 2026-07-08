import Decimal from 'decimal.js';

/**
 * 金额乘数量：price × qty，返回圆（保留 2 位小数）
 */
export function mul(price: number | string | Decimal, qty: number): number {
  return new Decimal(price).times(qty).toDecimalPlaces(2).toNumber();
}

/**
 * 金额累加：sum([a, b, c])，返回圆
 */
export function sum(values: number[]): number {
  return values
    .reduce((acc, v) => acc.plus(new Decimal(v)), new Decimal(0))
    .toDecimalPlaces(2)
    .toNumber();
}

/**
 * 除法：a / b，返回圆
 */
export function div(a: number, b: number): number {
  if (b === 0) return 0;
  return new Decimal(a).div(b).toDecimalPlaces(2).toNumber();
}

/**
 * 加法：a + b
 */
export function add(a: number, b: number): number {
  return new Decimal(a).plus(b).toDecimalPlaces(2).toNumber();
}

/**
 * 减法：a - b
 */
export function sub(a: number, b: number): number {
  return new Decimal(a).minus(b).toDecimalPlaces(2).toNumber();
}

/**
 * 四舍五入到 2 位小数
 */
export function rnd(value: number | string | Decimal): number {
  return new Decimal(value).toDecimalPlaces(2).toNumber();
}
