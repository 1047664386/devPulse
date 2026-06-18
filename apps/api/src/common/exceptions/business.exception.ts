import { HttpException } from '@nestjs/common';
import { ERROR_MESSAGES, ERROR_HTTP_STATUS, ErrUnknown } from '../constants/error-codes';

/**
 * 业务异常类
 *
 * 用法：
 *   throw new BusinessException(ErrEmailRegistered);          // → HTTP 409 + code: 20020
 *   throw new BusinessException(ErrArticleNotFound);          // → HTTP 404 + code: 40001
 *   throw new BusinessException(ErrArticleNoPerm);            // → HTTP 403 + code: 40002
 *   throw new BusinessException(ErrArticleConflict, {
 *     detail: '乐观锁版本不匹配',                             // detail 只进日志
 *   });
 *   throw new BusinessException(ErrEmailRegistered, {
 *     httpStatus: 422,                                        // 覆盖默认 HTTP 状态码
 *   });
 *
 * 设计原则：
 *   - code：业务错误码（纯数字），响应体中返回
 *   - message：自动从 ERROR_MESSAGES 查表，对外脱敏
 *   - httpStatus：从 ERROR_HTTP_STATUS 映射表自动获取标准 HTTP 状态码
 *                 也可手动覆盖（options.httpStatus）
 *   - detail：可选，仅写入内部日志，不返回给前端
 */
export class BusinessException extends HttpException {
  /** 业务错误码 */
  public readonly code: number;
  /** 内部详细信息（仅日志用，不返回给前端） */
  public readonly detail?: string;

  constructor(
    code: number,
    options?: {
      /** 自定义内部详情，不会返回给前端 */
      detail?: string;
      /** 覆盖默认 HTTP 状态码 */
      httpStatus?: number;
    },
  ) {
    const safeMessage = ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrUnknown];
    // 优先用手动指定的 httpStatus，否则从映射表取默认值
    const httpStatus = options?.httpStatus ?? ERROR_HTTP_STATUS[code] ?? 400;

    super(
      { code, message: safeMessage },
      httpStatus,
    );

    this.code = code;
    this.detail = options?.detail;
  }
}
