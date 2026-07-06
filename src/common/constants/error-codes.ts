export enum ErrorCode {
  SUCCESS = 0,
  VALIDATION_ERROR = 1001,
  UNAUTHORIZED = 1002,
  NOT_FOUND = 1003,
  BUSINESS_ERROR = 2001,
  UNKNOWN_ERROR = 9999,
}

export const ErrorMessage: Record<number, string> = {
  [ErrorCode.SUCCESS]: 'success',
  [ErrorCode.VALIDATION_ERROR]: '参数校验失败',
  [ErrorCode.UNAUTHORIZED]: '未授权',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.BUSINESS_ERROR]: '业务规则限制',
  [ErrorCode.UNKNOWN_ERROR]: '服务器内部错误',
};
