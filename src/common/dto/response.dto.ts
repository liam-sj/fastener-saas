import { ErrorCode } from '../constants/error-codes';

export class ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;

  static ok<T>(data: T, message = 'success'): ApiResponse<T> {
    return { code: ErrorCode.SUCCESS, message, data };
  }

  static fail(code: number, message: string): ApiResponse<null> {
    return { code, message, data: null };
  }
}
