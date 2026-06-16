// 引入Nest拦截器基础依赖、执行上下文、请求处理器
import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
// RxJS 响应流对象，控制器返回结果会被包装为Observable流
import { Observable } from 'rxjs';
// rxjs映射操作符，对流内数据做格式转换
import { map } from 'rxjs/operators';
// 全局常量：成功业务码（统一约定 0）
import { ErrSuccess } from '../constants/error-codes';

/**
 * 全局统一成功响应转换拦截器
 * 适配国内接口规范：所有正常业务返回统一结构，固定code=0、携带requestId追踪ID
 *
 * 标准成功返回格式（单条数据/新增/编辑/详情）：
 * {
 *   code: 0,                  // 成功固定业务码，全局统一约定
 *   message: "操作成功",       // 通用成功提示文案
 *   data: { ...业务数据 },     // 接口核心返回内容
 *   requestId: "uuid字符串"    // 全链路追踪ID，线上排查日志使用
 * }
 *
 * 分页列表专用返回格式（Service层返回 {data[], meta分页信息}）：
 * {
 *   code: 0,
 *   message: "操作成功",
 *   data: [...列表数据],
 *   meta: { page, pageSize, total, totalPages }, // 分页元数据
 *   requestId: "uuid字符串"
 * }
 *
 * 配套逻辑：
 * 1. 异常走 AllExceptionFilter 过滤器返回 {code, message, requestId}
 * 2. 正常请求经过本拦截器统一包装标准成功结构
 * 3. 前端只需要判断 code === 0 代表请求业务成功
 */
export interface SuccessResponse<T> {
  // 成功业务码，固定为ErrSuccess(0)
  code: number;
  // 成功提示文案，统一为“操作成功”
  message: string;
  // 核心业务数据，泛型适配任意返回类型
  data: T;
  // 分页元数据，仅分页接口存在，非分页接口不返回该字段
  meta?: {
    page: number;       // 当前页码
    pageSize: number;   // 每页条数
    total: number;      // 数据总条数
    totalPages: number; // 总页数
  };
  // 请求唯一追踪ID，和异常返回结构保持一致，用于日志关联
  requestId?: string;
}

/**
 * 响应拦截器类，实现Nest标准NestInterceptor拦截器接口
 * @template T 控制器原始返回数据类型
 */
@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, SuccessResponse<T>>
{
  /**
   * 拦截器核心执行方法，所有成功接口都会进入该方法
   * @param context 请求执行上下文，可获取Request、路由、控制器信息
   * @param next 下游处理器，代表控制器执行后的返回数据流
   * @returns 转换格式后的标准化响应流
   */
  intercept(
    context: ExecutionContext,
    next: CallHandler,
  ): Observable<SuccessResponse<T>> {
    // 切换至HTTP上下文，取出原始请求对象
    const request = context.switchToHttp().getRequest();
    // 从请求挂载属性获取全链路追踪ID，用于返回体统一携带
    const requestId = (request as any).requestId;

    // 监听控制器返回的原始结果流，使用map转换统一格式
    return next.handle().pipe(
      map((result) => {
        // 判断分支：Service层已封装分页格式 {data, meta}，直接拆解复用
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

        // 普通接口（详情、新增、修改、无分页列表），直接把原始结果塞入data
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