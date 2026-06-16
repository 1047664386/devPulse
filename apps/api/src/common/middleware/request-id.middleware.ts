import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'crypto';

/**
 * 请求 ID 中间件
 *
 * 为每个请求生成唯一 requestId，写入 request 对象和响应头。
 * 用途：
 *   1. 响应体中返回 requestId，方便前端排查问题时提供给出后端
 *   2. 日志中记录 requestId，通过 requestId 关联整条请求链路
 *   3. 如果前端传了 X-Request-Id，则复用（便于跨服务追踪）
 */
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId =
      (req.headers['x-request-id'] as string) || randomUUID();
    (req as any).requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
