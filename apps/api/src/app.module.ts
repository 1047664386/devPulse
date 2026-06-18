// Nest核心模块、中间件管理接口
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
// 环境变量配置模块
import { ConfigModule, ConfigService } from '@nestjs/config';
// 请求限流模块（防刷接口）
import { ThrottlerModule } from '@nestjs/throttler';
// BullMQ Redis消息队列模块，处理异步任务
import { BullModule } from '@nestjs/bullmq';
// 静态资源托管模块，提供文件访问
import { ServeStaticModule } from '@nestjs/serve-static';
// 路径拼接工具
import { join } from 'path';

// 环境变量校验 Schema（启动时校验缺失变量直接阻止启动）
import { validate } from './common/config/env.validation';
// 数据库ORM模块
import { PrismaModule } from './prisma/prisma.module';
// 全局Redis模块（单例连接，REDIS_CLIENT 注入令牌）
import { RedisModule } from './common/redis/redis.module';
// RBAC权限全局模块（守卫、权限校验服务）
import { PermissionModule } from './common/permission/permission.module';
// 业务功能模块
import { AuthModule } from './auth/auth.module';
import { UserModule } from './user/user.module';
import { ProfileModule } from './profile/profile.module';
import { ArticleModule } from './article/article.module';
import { TagModule } from './tag/tag.module';
import { CommentModule } from './comment/comment.module';
import { NotificationModule } from './notification/notification.module';
import { SearchModule } from './search/search.module';
import { AdminModule } from './admin/admin.module';
import { UploadModule } from './upload/upload.module';
import { QueueModule } from './queue/queue.module';
// 全链路RequestId生成中间件
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';

/**
 * 应用根模块 AppModule
 * Nest项目入口根模块，统一导入所有全局配置、第三方插件、业务子模块
 * 实现 NestModule 接口用于注册全局中间件
 *
 * 模块注册顺序约定：
 * 1. 基础设施层：ConfigModule → ThrottlerModule → BullModule → ServeStaticModule
 * 2. 数据层：PrismaModule → RedisModule
 * 3. 安全层：PermissionModule
 * 4. 业务层：AuthModule → UserModule → ...（按业务域拆分，逐步扩展）
 */
@Module({
  imports: [
    // ─── 基础设施层 ──────────────────────────────────────────

    // 全局环境变量配置模块
    // isGlobal: true 全局生效，所有模块无需重复导入即可注入 ConfigService
    // validate: 启动时校验必填环境变量（DATABASE_URL、JWT_SECRET 等），缺失直接阻止启动
    ConfigModule.forRoot({
      isGlobal: true,
      validate,
    }),

    // 接口限流模块：限制单IP一分钟最多60次请求，防恶意刷接口
    // ttl: 60000ms 过期时间，limit: 最大请求次数
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),

    // BullMQ 全局Redis队列配置，通过 ConfigService 注入环境变量
    // 注意：BullMQ 需要独立 Redis 连接，不复用 RedisModule 的共享实例
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get<string>('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get<string>('REDIS_PASSWORD') || undefined,
        },
      }),
    }),

    // 静态文件托管模块，提供上传图片/文件访问能力
    // rootPath：本地uploads文件夹物理路径
    // serveRoot：前端访问路由前缀 /uploads/xxx
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),

    // ─── 数据层 ──────────────────────────────────────────────

    // Prisma数据库全局模块，全局可注入PrismaService操作数据库
    PrismaModule,

    // Redis全局模块，提供 REDIS_CLIENT 注入令牌，统一连接管理
    RedisModule,

    // ─── 安全层 ──────────────────────────────────────────────

    // RBAC全局权限模块，提供权限守卫、权限校验服务，全局生效
    PermissionModule,

    // ─── 业务层 ──────────────────────────────────────────────

    // 登录、注册、Token鉴权模块
    AuthModule,
    // 用户基础信息模块
    UserModule,
    // 用户个人资料模块
    ProfileModule,
    // 文章核心业务模块
    ArticleModule,
    // 文章标签模块
    TagModule,
    // 评论模块
    CommentModule,
    // 站内消息通知模块
    NotificationModule,
    // 全文搜索模块
    SearchModule,
    // 后台管理模块
    AdminModule,
    // 文件上传模块
    UploadModule,
    // 异步任务队列模块
    QueueModule,
  ],
})
export class AppModule implements NestModule {
  /**
   * 全局中间件配置方法
   * @param consumer 中间件管理器
   */
  configure(consumer: MiddlewareConsumer) {
    // 全局挂载RequestId中间件，匹配所有路由 *
    // 每个请求进来自动生成唯一requestId挂载到req对象，用于日志链路追踪
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
