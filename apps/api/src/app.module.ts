// Nest核心模块、中间件管理接口
import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
// 环境变量配置模块
import { ConfigModule } from '@nestjs/config';
// 请求限流模块（防刷接口）
import { ThrottlerModule } from '@nestjs/throttler';
// BullMQ Redis消息队列模块，处理异步任务
import { BullModule } from '@nestjs/bullmq';
// 静态资源托管模块，提供文件访问
import { ServeStaticModule } from '@nestjs/serve-static';
// 路径拼接工具
import { join } from 'path';

// 数据库ORM模块
import { PrismaModule } from './prisma/prisma.module';
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
 */
@Module({
  imports: [
    // 全局环境变量配置模块
    // isGlobal: true 全局生效，所有模块无需重复导入即可读取 env
    ConfigModule.forRoot({ isGlobal: true }),

    // 接口限流模块：限制单IP一分钟最多60次请求，防恶意刷接口
    // ttl: 60000ms 过期时间，limit: 最大请求次数
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),

    // BullMQ 全局Redis队列配置，统一异步任务连接池
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),

    // 静态文件托管模块，提供上传图片/文件访问能力
    // rootPath：本地uploads文件夹物理路径
    // serveRoot：前端访问路由前缀 /uploads/xxx
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),

    // Prisma数据库全局模块，全局可注入PrismaService操作数据库
    PrismaModule,

    // RBAC全局权限模块，提供权限守卫、权限校验服务，全局生效
    PermissionModule,

    // 业务功能子模块（按业务域拆分）
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
    // 后台管理专用模块
    AdminModule,
    // 文件上传模块
    UploadModule,
    // 异步任务队列业务模块（发送通知、延时任务等）
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