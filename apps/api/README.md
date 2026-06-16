# DevPulse API

NestJS 11 后端，提供 RESTful API、JWT 认证、RBAC 权限、BullMQ 后台任务。

## 技术架构

- **框架**: NestJS 11 (CJS 模式)
- **ORM**: Prisma 7 + `@prisma/adapter-pg` Driver Adapter
- **数据库**: PostgreSQL 16
- **缓存/队列**: Redis 7 + BullMQ 5
- **认证**: Passport + JWT 双令牌 (access 15min / refresh 7d)
- **验证**: class-validator + class-transformer
- **文档**: Swagger (`@nestjs/swagger`)
- **文件**: multer + sharp 图片处理

## 目录结构

```
src/
├── main.ts                          # 入口，全局管道/守卫/Swagger
├── app.module.ts                    # 根模块
├── auth/                            # 认证模块
│   ├── auth.controller.ts           #   注册/登录/刷新/登出
│   ├── auth.service.ts              #   JWT 签发/验证 + Redis 黑名单
│   ├── jwt.strategy.ts              #   Passport JWT 策略
│   └── dto/                         #   LoginDto, RegisterDto, RefreshDto
├── user/                            # 用户模块
│   ├── user.controller.ts           #   资料/文章/关注/粉丝
│   └── user.service.ts
├── profile/                         # 个人中心
│   ├── profile.controller.ts        #   编辑资料/改密码/收藏
│   └── profile.service.ts
├── article/                         # 文章模块
│   ├── article.controller.ts        #   CRUD/点赞/收藏/按slug查询
│   ├── article.service.ts           #   乐观锁 + Redis 浏览量缓冲
│   └── dto/
├── comment/                         # 评论模块
│   ├── comment.controller.ts        #   评论/回复/点赞
│   └── comment.service.ts           #   两级嵌套 + 权限检查
├── tag/                             # 标签模块
│   ├── tag.controller.ts
│   ├── tag.service.ts
│   └── dto/create-tag.dto.ts
├── notification/                    # 通知模块
│   ├── notification.controller.ts   #   列表/已读/未读计数
│   └── notification.service.ts      #   dispatch() → BullMQ
├── search/                          # 搜索模块
│   └── search.service.ts            #   PostgreSQL tsvector + tsquery
├── admin/                           # 管理后台
│   ├── admin.controller.ts          #   用户/文章/标签/角色/权限管理
│   ├── admin.service.ts             #   仪表盘统计 + CRUD
│   └── dto/                         #   UpdateUserRoleDto, BanUserDto,
│                                    #   CreateRoleDto, UpdateRolePermissionsDto
├── upload/                          # 文件上传
│   ├── upload.controller.ts         #   图片上传 + sharp 压缩
│   └── upload.service.ts
├── queue/                           # BullMQ 后台任务
│   ├── notification.processor.ts    #   通知异步创建 Worker
│   ├── view-count.processor.ts      #   阅读量定时刷写 (60s)
│   └── queue.module.ts
├── common/                          # 公共层
│   ├── guards/                      #   JwtAuthGuard, OptionalAuthGuard
│   ├── decorators/                  #   @CurrentUser
│   ├── filters/                     #   AllExceptionsFilter
│   ├── interceptors/                #   TransformInterceptor
│   ├── permission/                  #   PermissionService, PermissionsGuard,
│   │                                #   @RequirePermission
│   └── constants/                   #   permissions.ts (角色/权限定义)
└── prisma/                          # 数据库
    ├── schema.prisma                #   Prisma Schema
    ├── seed.ts                      #   种子数据
    ├── prisma.service.ts            #   连接管理 + 自动引导
    └── migrations/
```

## API 端点

### 认证

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| POST | `/auth/register` | 注册 | - |
| POST | `/auth/login` | 登录 | - |
| POST | `/auth/refresh` | 刷新令牌 | - |
| POST | `/auth/logout` | 登出（黑名单 refresh token） | JWT |
| GET | `/auth/me` | 获取当前用户 | JWT |

### 文章

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/articles` | 文章列表（分页/标签筛选/排序） | 可选 |
| GET | `/articles/:slug` | 文章详情 + 阅读量 +1 | 可选 |
| GET | `/articles/id/:id` | 按 ID 查文章（编辑器用） | JWT |
| POST | `/articles` | 创建文章 | `article:create` |
| PUT | `/articles/:id` | 编辑文章（乐观锁） | `article:update:own/any` |
| DELETE | `/articles/:id` | 软删除 | `article:delete:own/any` |
| POST | `/articles/:id/like` | 点赞/取消 | JWT |
| POST | `/articles/:id/bookmark` | 收藏/取消 | JWT |

### 评论

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/articles/:id/comments` | 评论列表（两级嵌套） | 可选 |
| POST | `/articles/:id/comments` | 发表评论/回复 | `comment:create` |
| DELETE | `/articles/:id/comments/:cid` | 删除评论 | `comment:delete:own/any` |
| POST | `/articles/:id/comments/:cid/like` | 评论点赞 | JWT |

### 用户 & 关注

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/users/:id` | 用户资料 + 统计 | - |
| GET | `/users/:id/articles` | 用户的文章 | - |
| GET | `/users/:id/followers` | 粉丝列表 | 可选 |
| GET | `/users/:id/following` | 关注列表 | 可选 |
| POST | `/users/:id/follow` | 关注/取消 | JWT |

### 个人中心

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| PUT | `/profile` | 编辑资料 | JWT |
| PUT | `/profile/password` | 修改密码 | JWT |
| GET | `/profile/bookmarks` | 收藏列表 | JWT |

### 管理后台

| 方法 | 路径 | 说明 | 权限 |
|------|------|------|------|
| GET | `/admin/dashboard` | 仪表盘统计 | `admin:access` |
| GET | `/admin/users` | 用户列表 | `admin:access` |
| PUT | `/admin/users/:id/roles` | 修改用户角色 | `admin:access` |
| POST | `/admin/users/:id/ban` | 封禁/解封 | `admin:access` |
| GET | `/admin/roles` | 角色列表 | `role:manage` |
| POST | `/admin/roles` | 创建角色 | `role:manage` |
| DELETE | `/admin/roles/:id` | 删除角色 | `role:manage` |
| GET | `/admin/permissions` | 权限列表 | `permission:manage` |
| GET | `/admin/roles/permissions` | 角色-权限矩阵 | `permission:manage` |
| PUT | `/admin/roles/:id/permissions` | 更新角色权限 | `permission:manage` |
| GET | `/admin/articles` | 文章列表 | `admin:access` |
| DELETE | `/admin/articles/:id` | 硬删除文章 | `admin:access` |
| GET | `/admin/tags` | 标签列表 | `admin:access` |
| DELETE | `/admin/tags/:id` | 删除标签 | `admin:access` |

### 其他

| 方法 | 路径 | 说明 | 认证 |
|------|------|------|------|
| GET | `/tags` | 标签列表 | - |
| GET | `/tags/:slug` | 标签详情 | - |
| POST | `/tags` | 创建标签 | `tag:manage` |
| GET | `/search` | 全文搜索 | 可选 |
| GET | `/search/suggest` | 搜索建议 | 可选 |
| GET | `/notifications` | 通知列表 | JWT |
| PUT | `/notifications/:id/read` | 标记已读 | JWT |
| PUT | `/notifications/read-all` | 全部已读 | JWT |
| GET | `/notifications/unread-count` | 未读计数 | JWT |
| POST | `/upload/image` | 上传图片 | JWT |

## 脚本

```bash
pnpm dev              # watch 模式启动
pnpm build            # 构建
pnpm start            # 启动构建产物
pnpm start:debug      # 调试模式
pnpm db:migrate       # Prisma 迁移
pnpm db:seed          # 填充种子数据
pnpm db:studio        # Prisma Studio
pnpm db:generate      # 重新生成 Prisma Client
pnpm test             # 单元测试
pnpm test:e2e         # 端到端测试
```

## RBAC 权限系统

### 系统角色

| 角色 | 权限数 | 说明 |
|------|--------|------|
| ADMIN | 14 | 全部权限，权限矩阵只读 |
| AUTHOR | 5 | 发文/编辑/删除自己的文章 + 评论 |
| READER | 2 | 仅评论创建和删除自己的评论 |

支持运行时动态创建自定义角色，通过管理后台分配权限。

### 权限列表

`article:create` `article:update:own` `article:update:any` `article:delete:own` `article:delete:any` `comment:create` `comment:delete:own` `comment:delete:any` `tag:manage` `user:manage` `role:manage` `permission:manage` `admin:access` `article:publish`

### 权限缓存

按 userId 缓存聚合权限（60s TTL），角色/权限变更时主动 `invalidateCache()`。

## 通知管道

5 种通知通过 BullMQ 异步创建：

| 类型 | 触发场景 | 投递方 |
|------|---------|--------|
| ARTICLE_LIKED | 文章被点赞 | ArticleService |
| COMMENT_RECEIVED | 文章收到评论 | CommentService |
| COMMENT_REPLIED | 评论被回复 | CommentService |
| COMMENT_LIKED | 评论被赞 | CommentService |
| USER_FOLLOWED | 被关注 | UserService |

流程：业务 Service 调用 `NotificationService.dispatch()` → BullMQ 队列 → `NotificationProcessor` 写入数据库。

## 阅读量缓冲

文章访问时 Redis INCR `view_buffer:{articleId}`，`ViewCountProcessor` 每 60 秒批量刷写到 PostgreSQL，减少数据库写入压力。

## 并发控制

| 模式 | 应用场景 |
|------|---------|
| 悲观锁 (SELECT FOR UPDATE) | 标签 articleCount、点赞/关注 toggle |
| 乐观锁 (version 字段) | 文章编辑防冲突 |
| 原子操作 (SQL INCR) | 评论数、点赞数 |
| Redis 缓冲 + 定时刷写 | 阅读量 |

## 环境变量

参考项目根目录 `.env.example`。
