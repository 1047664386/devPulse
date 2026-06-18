import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { BusinessException } from '../exceptions/business.exception';
import {
  ErrUnknown,
  ErrParamInvalid,
  ErrNotAuthenticated,
  ErrRateLimited,
  ErrDataConflict,
  ErrForbidden,
  ErrDatabaseError,
  ERROR_MESSAGES,
} from '../constants/error-codes';

/**
 * 全局异常过滤器
 *
 * 统一错误响应格式：
 * {
 *   code: 20010,                       ← 业务错误码（数字）
 *   message: "邮箱或密码错误",          ← 对外脱敏消息
 *   requestId: "uuid"                  ← 关联日志的 requestId
 * }
 *
 * 设计原则：
 *   1. HTTP 状态码仅表示传输层语义（200/401/429/500）
 *   2. code 字段表示业务语义（分段编码）
 *   3. message 对外脱敏，不暴露内部细节
 *   4. detail 字段仅记录到内部日志，不返回给前端
 *   5. requestId 关联请求链路，方便排查
 */
@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ExceptionFilter');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const requestId = (request as any)?.requestId || '';

    // 默认值
    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = ErrUnknown;
    let message = ERROR_MESSAGES[ErrUnknown]!;
    let detail = '';

    // ─── 1. BusinessException（自定义业务异常）──────────────────────
    if (exception instanceof BusinessException) {
      httpStatus = exception.getStatus();
      code = exception.code;
      const resp = exception.getResponse();
      if (typeof resp === 'object' && resp !== null) {
        message = (resp as Record<string, any>).message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrUnknown]!;
      } else {
        message = ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrUnknown]!;
      }
      detail = exception.detail || '';
    }
    // ─── 2. NestJS 内置 HttpException ─────────────────────────────
    else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const exResponse = exception.getResponse();

      if (typeof exResponse === 'string') {
        // 简单字符串消息 → 转为通用格式
        code = this.mapHttpStatusToCode(httpStatus);
        message = ERROR_MESSAGES[code] || exResponse;
        detail = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const obj = exResponse as Record<string, any>;

        // class-validator 校验错误：message 是数组
        if (Array.isArray(obj.message)) {
          code = ErrParamInvalid;
          httpStatus = HttpStatus.OK; // 参数校验也统一 200
          const validationDetails = obj.message.map((msg: string) => {
            const parts = msg.split(' ');
            return { field: parts[0] || '', message: msg };
          });
          // 参数校验错误：返回 details 帮助前端定位
          response.status(HttpStatus.OK).json({
            code,
            message: ERROR_MESSAGES[ErrParamInvalid],
            details: validationDetails,
            requestId,
          });
          // 记内部日志
          this.logger.warn(
            `[${requestId}] 参数校验失败 ${request.method} ${request.url}: ${JSON.stringify(validationDetails)}`,
          );
          return;
        }

        // 带 code 字段的对象（如乐观锁 { message, code: 'OPTIMISTIC_LOCK' }）
        code = obj.code && typeof obj.code === 'number'
          ? obj.code
          : this.mapHttpStatusToCode(httpStatus);
        message = ERROR_MESSAGES[code] || obj.message || ERROR_MESSAGES[ErrUnknown]!;
        detail = obj.message || '';
      }
    }
    // ─── 3. Prisma 数据库错误 ──────────────────────────────────────
    else if (this.isPrismaError(exception)) {
      httpStatus = HttpStatus.OK; // 业务相关的数据错误统一 200
      const prismaCode = (exception as any).code;

      if (prismaCode === 'P2002') {
        // 唯一约束冲突
        code = ErrDataConflict;
        const target = ((exception as any).meta?.target as string[])?.join(', ') || '';
        detail = `唯一约束冲突: ${target}`;
      } else if (prismaCode === 'P2025') {
        // 记录不存在
        code = ErrUnknown; // 具体模块的 NotFound 应该由 service 层抛 BusinessException
        detail = `记录不存在: ${prismaCode}`;
      } else {
        code = ErrDatabaseError;
        detail = `Prisma 错误: ${prismaCode}`;
      }
      message = ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrUnknown]!;
    }
    // ─── 4. 未知异常（兜底）───────────────────────────────────────
    else {
      code = ErrUnknown;
      httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
      message = ERROR_MESSAGES[ErrUnknown]!;
      // 记录完整的错误堆栈（仅内部日志）
      detail = exception instanceof Error
        ? `${exception.message}\n${exception.stack}`
        : String(exception);
    }

    // ─── 记内部日志（含完整详情）────────────────────────────────────
    const logLevel = httpStatus >= 500 ? 'error' : 'warn';
    this.logger[logLevel](
      `[${requestId}] ${request.method} ${request.url} ` +
      `→ code=${code} httpStatus=${httpStatus} ` +
      `${detail ? `detail="${detail}"` : ''}`,
    );

    // ─── 返回脱敏响应给前端 ────────────────────────────────────────
    response.status(httpStatus).json({
      code,
      message,
      requestId,
    });
  }

  /**
   * 将 NestJS HttpException 的状态码映射到业务错误码
   * 用于处理那些还没改造为 BusinessException 的旧代码
   */
  private mapHttpStatusToCode(httpStatus: number): number {
    switch (httpStatus) {
      case 400: return ErrParamInvalid;
      case 401: return ErrNotAuthenticated;
      case 403: return ErrForbidden;
      case 404: return ErrUnknown;          // 具体模块的 NotFound 由 service 抛 BusinessException
      case 409: return ErrDataConflict;
      case 429: return ErrRateLimited;
      default:  return ErrUnknown;
    }
  }

  /**
   * 鸭子类型检测 Prisma 错误
   * Prisma v7 不能 instanceof 检测，只能通过 code 字段判断
   */
  private isPrismaError(exception: unknown): boolean {
    return (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as any).code === 'string' &&
      (exception as any).code?.startsWith('P')
    );
  }
}
