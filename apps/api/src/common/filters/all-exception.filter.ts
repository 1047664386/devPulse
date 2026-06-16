import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
// Express 请求、响应对象类型
import { Response, Request } from 'express';
// 自定义业务异常类，业务逻辑主动抛出
import { BusinessException } from '../exceptions/business.exception';
// 预定义数字业务错误码常量
import {
  ErrUnknown,
  ErrParamInvalid,
  ErrNotAuthenticated,
  ErrRateLimited,
  ErrDataConflict,
  ErrDatabaseError,
  ERROR_MESSAGES,
} from '../constants/error-codes';

/**
 * 全局统一异常过滤器（国内通用规范：区分HTTP状态码 + 数字业务码 + 全链路requestId）
 * 统一对外返回格式：
 * {
 *   code: 20010,                       // 数字分段业务错误码，区分业务场景
 *   message: "邮箱或密码错误",          // 对外展示脱敏友好提示，不暴露内部技术细节
 *   requestId: "uuid"                  // 请求唯一追踪ID，用于后台日志定位完整报错
 * }
 *
 * 设计规范说明：
 * 1. HTTP 状态码仅负责传输/协议层语义：200/401/429/500，网关、监控识别异常
 * 2. code 纯数字分段编码，唯一标识业务错误类型，前端分支判断弹窗逻辑
 * 3. message 对外脱敏，数据库堆栈、字段名、SQL 不返回前端
 * 4. 完整错误详情detail仅打印内部日志，不暴露给客户端
 * 5. requestId 全链路追踪，线上排查故障核心依据
 */
@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  // 日志工具，统一打印异常日志，区分warn/error日志级别
  private readonly logger = new Logger('ExceptionFilter');

  /**
   * 异常统一捕获入口
   * @param exception 捕获到的任意异常对象
   * @param host 请求通用上下文，兼容HTTP/微服务等场景
   */
  catch(exception: unknown, host: ArgumentsHost) {
    // 切换至HTTP上下文，获取请求、响应实例
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    // 从请求对象取出全链路追踪ID，无则置空
    const requestId = (request as any)?.requestId || '';

    // 初始化默认兜底错误参数：服务未知异常
    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = ErrUnknown;
    let message = ERROR_MESSAGES[ErrUnknown]!;
    let detail = ''; // 内部详细错误信息，仅日志输出，不返回前端

    // ─────────────────────────────────────────────────────────────
    // 分支1：自定义业务异常 BusinessException（业务层主动抛出，优先级最高）
    // ─────────────────────────────────────────────────────────────
    if (exception instanceof BusinessException) {
      httpStatus = exception.getStatus();
      code = exception.code;
      const resp = exception.getResponse();
      // 读取自定义异常内的提示文案，无则读取全局错误文案映射
      if (typeof resp === 'object' && resp !== null) {
        message = (resp as Record<string, any>).message || ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrUnknown]!;
      } else {
        message = ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrUnknown]!;
      }
      // 保存内部详细错误描述，用于日志排查
      detail = exception.detail || '';
    }
    // ─────────────────────────────────────────────────────────────
    // 分支2：Nest内置标准HttpException（DTO校验、框架内置异常）
    // ─────────────────────────────────────────────────────────────
    else if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const exResponse = exception.getResponse();

      // 场景1：异常仅传入简单字符串提示
      if (typeof exResponse === 'string') {
        // 根据HTTP状态码映射对应业务错误码
        code = this.mapHttpStatusToCode(httpStatus);
        message = ERROR_MESSAGES[code] || exResponse;
        detail = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const obj = exResponse as Record<string, any>;

        // 子场景：class-validator DTO参数校验失败，message为数组
        if (Array.isArray(obj.message)) {
          code = ErrParamInvalid;
          // 参数校验类业务错误统一返回HTTP 200，贴合国内前端习惯
          httpStatus = HttpStatus.OK;
          // 格式化每条校验错误，拆分字段+错误提示
          const validationDetails = obj.message.map((msg: string) => {
            const parts = msg.split(' ');
            return { field: parts[0] || '', message: msg };
          });
          // 直接返回带字段明细的校验错误，终止后续逻辑
          response.status(HttpStatus.OK).json({
            code,
            message: ERROR_MESSAGES[ErrParamInvalid],
            details: validationDetails,
            requestId,
          });
          // 打印参数校验警告日志
          this.logger.warn(
            `[${requestId}] 参数校验失败 ${request.method} ${request.url}: ${JSON.stringify(validationDetails)}`,
          );
          return;
        }

        // 子场景：异常对象携带自定义数字业务码
        code = obj.code && typeof obj.code === 'number'
          ? obj.code
          : this.mapHttpStatusToCode(httpStatus);
        message = ERROR_MESSAGES[code] || obj.message || ERROR_MESSAGES[ErrUnknown]!;
        detail = obj.message || '';
      }
    }
    // ─────────────────────────────────────────────────────────────
    // 分支3：Prisma数据库异常（唯一键冲突、数据不存在、数据库报错）
    // ─────────────────────────────────────────────────────────────
    else if (this.isPrismaError(exception)) {
      // 数据库业务类错误统一HTTP 200，归为业务错误
      httpStatus = HttpStatus.OK;
      const prismaCode = (exception as any).code;

      // P2002：唯一约束冲突（邮箱/用户名重复）
      if (prismaCode === 'P2002') {
        code = ErrDataConflict;
        const target = ((exception as any).meta?.target as string[])?.join(', ') || '';
        detail = `唯一约束冲突: ${target}`;
      }
      // P2025：查询指定记录不存在，统一兜底未知错误，业务需手动抛BusinessException细化
      else if (prismaCode === 'P2025') {
        code = ErrUnknown;
        detail = `记录不存在: ${prismaCode}`;
      }
      // 其他数据库异常统一归类数据库错误
      else {
        code = ErrDatabaseError;
        detail = `Prisma 错误: ${prismaCode}`;
      }
      message = ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrUnknown]!;
    }
    // ─────────────────────────────────────────────────────────────
    // 分支4：兜底分支，所有未匹配的系统未知崩溃异常
    // ─────────────────────────────────────────────────────────────
    else {
      code = ErrUnknown;
      httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;
      message = ERROR_MESSAGES[ErrUnknown]!;
      // 捕获完整堆栈信息存入detail，仅日志打印，不返回前端
      detail = exception instanceof Error
        ? `${exception.message}\n${exception.stack}`
        : String(exception);
    }

    // ─────────────────────────────────────────────────────────────
    // 统一打印异常日志，5xx服务错误用error级别，其余业务警告用warn
    // ─────────────────────────────────────────────────────────────
    const logLevel = httpStatus >= 500 ? 'error' : 'warn';
    this.logger[logLevel](
      `[${requestId}] ${request.method} ${request.url} ` +
      `→ code=${code} httpStatus=${httpStatus} ` +
      `${detail ? `detail="${detail}"` : ''}`,
    );

    // ─────────────────────────────────────────────────────────────
    // 对外输出脱敏响应，detail内部详情不返回前端
    // ─────────────────────────────────────────────────────────────
    response.status(httpStatus).json({
      code,
      message,
      requestId,
    });
  }

  /**
   * HTTP状态码映射为数字业务错误码
   * 兼容未改造为BusinessException的旧接口，统一错误码体系
   * @param httpStatus HTTP原始状态码
   * @returns 对应预定义数字业务code
   */
  private mapHttpStatusToCode(httpStatus: number): number {
    switch (httpStatus) {
      case 400: return ErrParamInvalid;
      case 401: return ErrNotAuthenticated;
      case 403: return ErrNotAuthenticated; // 权限不足统一脱敏为登录提示
      case 404: return ErrUnknown;          // 404接口/资源统一兜底，业务不存在需手动抛业务异常
      case 409: return ErrDataConflict;
      case 429: return ErrRateLimited;
      default:  return ErrUnknown;
    }
  }

  /**
   * 类型守卫：判断异常是否为Prisma数据库错误
   * Prisma无法通过instanceof判断，采用鸭子类型检测：存在P开头code字段
   * @param exception 任意异常对象
   * @returns 是否为Prisma错误
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