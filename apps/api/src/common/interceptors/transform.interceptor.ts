import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { ErrSuccess } from '../constants/error-codes';

/**
 * 统一成功响应格式
 *
 * 成功响应：
 * {
 *   code: 0,
 *   message: "操作成功",
 *   data: { ... },
 *   requestId: "uuid"
 * }
 *
 * 分页响应：
 * {
 *   code: 0,
 *   message: "操作成功",
 *   data: [...],
 *   meta: { page, pageSize, total, totalPages },
 *   requestId: "uuid"
 * }
 */
export interface SuccessResponse<T> {
  code: number;
  message: string;
  data: T;
  meta?: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  requestId?: string;
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T>> {
    const request = context.switchToHttp().getRequest();
    const requestId = (request as any).requestId;

    return next.handle().pipe(
      map((result) => {
        // 如果 service 已经返回 { data, meta } 的格式，拆开使用
        if (
          result &&
          typeof result === 'object' &&
          'data' in result &&
          'meta' in result
        ) {
          return {
            code: ErrSuccess,
            message: '操作成功',
            data: result.data,
            meta: result.meta,
            requestId,
          };
        }

        return {
          code: ErrSuccess,
          message: '操作成功',
          data: result,
          requestId,
        };
      }),
    );
  }
}
