import { Global, Inject, Module, OnModuleDestroy } from '@nestjs/common';
// 环境变量配置服务，读取Redis连接配置
import { ConfigService } from '@nestjs/config';
// ioredis Redis客户端类型
import Redis from 'ioredis';

/**
 * Redis 依赖注入标识常量
 * 作为自定义Token，用于在各类服务中注入Redis客户端实例
 * 使用示例：
 *   constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}
 */
export const REDIS_CLIENT = 'REDIS_CLIENT';

/**
 * 全局Redis连接模块
 * 功能说明：
 * 1. @Global() 全局模块，项目所有模块无需手动import即可直接注入Redis客户端
 * 2. 通过工厂函数动态读取.env配置，创建单例Redis连接实例
 * 3. 实现 OnModuleDestroy 生命周期钩子，服务优雅关闭时主动断开Redis连接，释放连接资源
 * 4. 统一管理Redis连接参数、重连策略、超时配置，集中维护
 *
 * 设计优势：
 * 1. 全局单例复用连接，避免多模块重复创建连接导致Redis连接数爆满
 * 2. 依赖注入模式，单元测试可轻松通过 overrideProvider 替换为Mock Redis
 * 3. 统一生命周期管理，程序退出自动释放连接，防止连接泄漏
 * 4. 配置集中在一处修改，无需每个业务服务重复写Redis初始化逻辑
 */
@Global()
@Module({
  providers: [
    {
      // 注入标识，与REDIS_CLIENT常量对应
      provide: REDIS_CLIENT,
      // 工厂函数依赖ConfigService读取环境变量
      inject: [ConfigService],
      // 动态创建Redis客户端实例
      useFactory: (config: ConfigService) => {
        return new Redis({
          // Redis服务地址，默认localhost
          host: config.get<string>('REDIS_HOST', 'localhost'),
          // Redis端口，默认6379
          port: config.get<number>('REDIS_PORT', 6379),
          // Redis密码，无密码则传undefined
          password: config.get<string>('REDIS_PASSWORD') || undefined,
          /**
           * 断线重连策略
           * times：当前重连次数
           * 返回值：下一次重连等待毫秒数，最多等待5秒
           */
          retryStrategy(times) {
            return Math.min(times * 200, 5000);
          },
          // 连接超时时间10秒
          connectTimeout: 10_000,
          // 每个请求最大重试次数20次
          maxRetriesPerRequest: 20,
        });
      },
    },
  ],
  // 对外导出Redis客户端注入标识，全局可注入使用
  exports: [REDIS_CLIENT],
})
export class RedisModule implements OnModuleDestroy {
  // 注入全局Redis单例客户端
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  /**
   * Nest应用销毁生命周期钩子
   * 服务停止、进程退出时触发，主动断开Redis连接，释放连接池资源
   */
  onModuleDestroy() {
    this.redis.disconnect();
  }
}