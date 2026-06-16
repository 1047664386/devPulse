// 引入Nest内置HTTP异常基类、标准HTTP状态码枚举
import { HttpException, HttpStatus } from '@nestjs/common';
// 全局错误码常量、错误提示文案映射表、兜底未知错误码
import { ERROR_MESSAGES, ErrUnknown } from '../constants/error-codes';

/**
 * 自定义业务异常类 BusinessException
 * 继承 Nest 原生 HttpException，作为项目所有业务逻辑报错统一抛出载体
 * 适配国内接口规范：业务错误统一数字code、对外脱敏提示、内部日志存储详情、默认HTTP 200
 *
 * 一、使用场景
 * Service/Controller 业务逻辑校验失败时主动抛出，例如：
 * 1. 注册时邮箱已存在
 * 2. 查询文章不存在
 * 3. 操作权限不足
 * 4. 库存不足、乐观锁冲突等数据库业务问题
 *
 * 二、三种标准用法示例
 * 1. 最简调用（仅传业务码，默认HTTP 200，无内部详情）
 *    throw new BusinessException(ErrEmailRegistered);
 *
 * 2. 自定义HTTP状态码（如404资源不存在、401未登录）
 *    throw new BusinessException(ErrArticleNotFound, { httpStatus: HttpStatus.NOT_FOUND });
 *
 * 3. 附加内部详情（仅打印日志，前端看不到，用于线上排查）
 *    throw new BusinessException(ErrArticleConflict, { detail: '乐观锁版本不匹配，当前数据已被他人修改' });
 *
 * 三、字段设计规范（分层隔离，兼顾安全与排查）
 * 1. code：数字业务错误码，对外返回前端，用于前端分支判断弹窗、页面跳转
 * 2. message：自动从 ERROR_MESSAGES 查表获取统一脱敏文案，前端展示，不暴露数据库/堆栈细节
 * 3. detail：内部补充详情，仅存入异常对象、打印服务日志，**不会返回给前端**，保护系统敏感信息
 * 4. httpStatus：HTTP传输层状态码，默认200（国内主流规范：业务报错报文正常传输，统一200），特殊场景可手动指定401/404/429等
 *
 * 四、配合全局异常过滤器 AllExceptionFilter 完整工作流
 * 1. 业务层 throw new BusinessException(xxx)
 * 2. @Catch() 全局过滤器捕获该异常
 * 3. 过滤器读取 code、对外message、内部detail
 * 4. detail 打印日志留存，脱敏 message + code + requestId 返回前端
 */
export class BusinessException extends HttpException {
  /**
   * 业务数字错误码，全局唯一，前端识别业务错误类型核心标识
   */
  public readonly code: number;

  /**
   * 内部详细错误描述，仅记录服务端日志，不对外返回前端
   * 用于线上排查问题：数据库字段、冲突原因、版本号、SQL提示等敏感信息
   */
  public readonly detail?: string;

  /**
   * 构造函数：初始化业务异常
   * @param code 预定义数字业务错误码（必填）
   * @param options 可选配置对象
   * @param options.detail 内部排查详情，不返回前端
   * @param options.httpStatus HTTP响应状态码，不传默认 HttpStatus.OK(200)
   */
  constructor(
    code: number,
    options?: {
      /** 自定义内部详情，仅日志可见，前端响应不输出 */
      detail?: string;
      /** 自定义HTTP状态码，默认200，特殊鉴权/资源不存在场景可改为401/404/429 */
      httpStatus?: number;
    },
  ) {
    // 根据传入业务码读取预设对外提示文案，无匹配则兜底未知错误文案
    const safeMessage = ERROR_MESSAGES[code] || ERROR_MESSAGES[ErrUnknown];
    // 读取自定义http状态，未传则默认200
    const httpStatus = options?.httpStatus ?? HttpStatus.OK;

    // 调用父类 HttpException 构造器
    // 传入完整错误载体对象：包含业务码、对外提示、内部详情
    super(
      { code, message: safeMessage, detail: options?.detail },
      httpStatus,
    );

    // 将业务码、内部详情挂载到实例属性，方便全局过滤器读取解析
    this.code = code;
    this.detail = options?.detail;
  }
}