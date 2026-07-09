import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../constants/error-codes';
import { ApiResponse } from '../dto/response.dto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    // 非 HTTP 上下文（WebSocket/gRPC/定时任务）不处理
    if (host.getType() !== 'http') {
      if (exception instanceof Error) {
        this.logger.error(
          `[${host.getType()}] ${exception.message}`,
          exception.stack,
        );
      }
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let code = ErrorCode.UNKNOWN_ERROR;
    let message = '服务器内部错误';
    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message || message;
      if (Array.isArray(message)) message = message.join('; ');

      if (httpStatus === HttpStatus.BAD_REQUEST)
        code = ErrorCode.VALIDATION_ERROR;
      else if (httpStatus === HttpStatus.UNAUTHORIZED)
        code = ErrorCode.UNAUTHORIZED;
      else if (httpStatus === HttpStatus.NOT_FOUND) code = ErrorCode.NOT_FOUND;
      else code = ErrorCode.BUSINESS_ERROR;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        httpStatus = HttpStatus.BAD_REQUEST;
        code = ErrorCode.BUSINESS_ERROR;
        message = '数据重复，请检查唯一字段';
      } else if (exception.code === 'P2025') {
        httpStatus = HttpStatus.NOT_FOUND;
        code = ErrorCode.NOT_FOUND;
        message = '记录不存在';
      } else {
        httpStatus = HttpStatus.BAD_REQUEST;
        code = ErrorCode.BUSINESS_ERROR;
        message = '数据操作失败';
        this.logger.error(
          `Prisma error [${exception.code}]: ${exception.message}`,
          exception.stack,
        );
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(httpStatus).json(ApiResponse.fail(code, message));
  }
}
