export enum ErrorCode {
  SUCCESS = 0,

  // 通用
  VALIDATION_ERROR = 1001,
  UNAUTHORIZED = 1002,
  NOT_FOUND = 1003,
  FORBIDDEN = 1004,

  // 业务
  BUSINESS_ERROR = 2001,
  STOCK_INSUFFICIENT = 2002,
  ORDER_STATUS_INVALID = 2003,
  QUOTATION_STATUS_INVALID = 2004,
  AMOUNT_EXCEED = 2005,
  DUPLICATE_DATA = 2006,

  UNKNOWN_ERROR = 9999,
}

export const ErrorMessage: Record<number, string> = {
  [ErrorCode.SUCCESS]: 'success',
  [ErrorCode.VALIDATION_ERROR]: '参数校验失败',
  [ErrorCode.UNAUTHORIZED]: '未授权',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.FORBIDDEN]: '无权限',
  [ErrorCode.BUSINESS_ERROR]: '业务规则限制',
  [ErrorCode.STOCK_INSUFFICIENT]: '库存不足',
  [ErrorCode.ORDER_STATUS_INVALID]: '订单状态不允许此操作',
  [ErrorCode.QUOTATION_STATUS_INVALID]: '报价单状态不允许此操作',
  [ErrorCode.AMOUNT_EXCEED]: '金额超出限制',
  [ErrorCode.DUPLICATE_DATA]: '数据重复',
  [ErrorCode.UNKNOWN_ERROR]: '服务器内部错误',
};
