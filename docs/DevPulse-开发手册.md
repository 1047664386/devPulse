# DevPulse — 开发者社区平台

**版本：** v6.4（新增前端框架搭建与开发步骤）  
**技术栈：** React 19 + NestJS 11 + Prisma 7 + PostgreSQL 16 + Redis 7  
**Monorepo：** pnpm workspace  
**学习侧重：** 后端架构 + 数据库设计 + 并发控制 + 后台任务 + RBAC 权限设计 + 容器化生产部署

---

## 目录

- [一、项目概述与系统边界](#一项目概述与系统边界)
- [二、技术架构与选型决策](#二技术架构与选型决策)
- [三、系统初始化（完整步骤）](#三系统初始化完整步骤)
- [四、功能模块详细设计（PRD）](#四功能模块详细设计prd)
- [五、RBAC 权限系统设计](#五rbac-权限系统设计)
- [六、并发控制模式](#六并发控制模式)
- [七、后台任务系统（BullMQ）](#七后台任务系统bullmq)
- [八、API 规范](#八api-规范)
- [九、项目目录结构](#九项目目录结构)
- [十、开发路线图](#十开发路线图)
- [十一、Docker 生产化配置](#十一docker-生产化配置)
- [十二、快速命令参考](#十二快速命令参考)
- [十三、项目复刻关键代码](#十三项目复刻关键代码)
- [十四、前端框架搭建与开发步骤](#十四前端框架搭建与开发步骤)

---

## 一、项目概述与系统边界

### 1.1 项目目标

DevPulse 是一个面向开发者的内容社区平台，用户可以发布技术文章、参与讨论、关注作者、收藏内容、接收通知。平台包含完整的用户系统、内容管理、互动系统和管理后台。

### 1.2 系统边界（Scope）

**在范围内的（In Scope）：**

- 用户认证（注册/登录/JWT 双令牌/多设备登录与会话管理/角色权限）
- 用户个人中心（资料编辑/头像上传/密码修改）
- 文章系统（CRUD/slug URL/富文本编辑/草稿-发布流程/阅读量统计）
- 标签系统（多对多关联/标签 CRUD/热门标签）
- 互动系统（评论/嵌套回复/点赞/收藏，全部 toggle 模式）
- 关注系统（关注/取消/粉丝列表/Feed 动态流）
- 通知中心（6 种通知类型/已读未读/BullMQ 异步创建）
- 全文搜索（PostgreSQL 内置 tsvector + tsquery）
- 管理后台（用户管理/文章管理/标签管理/权限管理/仪表盘统计）
- RBAC 权限系统（角色-权限解耦/动态权限分配/权限管理页面/管理员初始化）
- 后台任务队列（BullMQ + Redis，通知/邮件/阅读量刷写/搜索索引）
- Docker 容器化开发环境（PostgreSQL + Redis + 自定义网络 + 密码认证）
- Docker 生产化配置（dev/prod 分离、端口隔离、Redis 密码、环境变量外置）

**不在范围内的（Out of Scope）：**

- OAuth 第三方登录（Google/GitHub）——可后续扩展
- WebSocket 实时推送——当前用轮询（polling），后续可升级为 WebSocket
- 移动端 App
- 国际化（i18n）
- 支付/会员系统
- 文件存储到云 OSS——当前用本地 uploads/ 目录
- CI/CD 流水线——可后续添加 GitHub Actions
- 生产级部署（K8s/负载均衡）——已完成 Docker Compose 生产基线，不涉及 K8s/CI-CD

### 1.3 并发与后台任务学习重点

本项目刻意设计了多个并发控制场景，覆盖后端开发中最常见的模式：

| 模式 | 项目中的应用场景 |
|------|-----------------|
| 悲观锁（SELECT FOR UPDATE） | 标签 articleCount 更新、点赞/关注 toggle |
| 乐观锁（version 字段） | 文章编辑冲突检测 |
| 原子操作（SQL 递增/递减） | 阅读量、评论数、点赞数更新 |
| 缓冲写入（Redis 缓冲 + 定时刷写） | 阅读量统计 |
| 唯一约束兜底 | 注册邮箱唯一、点赞/收藏/关注去重 |
| 分布式锁（Redis SET NX） | BullMQ 定时任务防重入 |

---

## 二、技术架构与选型决策

### 2.1 技术栈总览

**后端（学习重点）：**

| 层面 | 选型 | 版本 | 学习重点 |
|------|------|------|----------|
| 框架 | NestJS | 11.x | 模块化架构、依赖注入、Guard/Pipe/Interceptor |
| ORM | Prisma | 7.x | 关联查询、事务、raw SQL、migration |
| 数据库 | PostgreSQL | 16 | 事务、锁、全文搜索、JSONB |
| 缓存/队列 | Redis + BullMQ | 7.x / 5.x | 异步任务、分布式锁、计数器 |
| 认证 | Passport + JWT | - | 双令牌、多设备登录、刷新令牌轮转、会话管理、角色守卫 |
| 文件处理 | Multer + Sharp | - | 图片裁剪、压缩、格式转换 |
| 校验 | class-validator | - | DTO 嵌套校验、自定义装饰器 |
| 文档 | Swagger | - | 自动生成 API 文档 |
| 日志 | Winston | - | 结构化日志、日志分级 |

**前端（快速搭建）：**

| 层面 | 选型 | 版本 |
|------|------|------|
| 框架 | React | 19.x |
| 构建 | Vite | 8.x |
| 样式 | Tailwind CSS | 4.x |
| 路由 | React Router | 7.x |
| 数据请求 | TanStack Query | 5.x |
| 状态管理 | Zustand | 5.x |
| 富文本 | Tiptap | 3.x |
| 表单 | React Hook Form + Zod | - |

**Prisma v7 + NestJS 兼容方案（关键决策）：**

Prisma v7 默认生成 ESM 格式的客户端，但 NestJS 11 编译输出为 CJS。解决方案是使用 Prisma 官方支持的 `moduleFormat = "cjs"` 配置项，让生成的 TypeScript 文件在 tsc 编译后输出 CJS 格式，零侵入 NestJS 的整套配置。这是当前社区的标准做法。

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"          // 核心开关
}
```

同时 Prisma v7 要求使用 Driver Adapter 模式连接数据库（不再直接读取 DATABASE_URL），需要安装 `@prisma/adapter-pg`。

### 2.2 架构概览

```
┌─────────────────────────────────────────────────────┐
│                    Frontend (React)                  │
│   Vite dev server :5173 → proxy /api → :3000        │
└────────────────────────┬────────────────────────────┘
                         │ HTTP (axios)
┌────────────────────────▼────────────────────────────┐
│                  Backend (NestJS :3000)              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐            │
│  │Controller│→│ Service  │→│ Prisma   │→ PostgreSQL │
│  └──────────┘ └──────────┘ └──────────┘            │
│       ↓              ↓                              │
│  ┌──────────┐  ┌─────────────┐                      │
│  │Guards/   │  │ BullMQ Queue│→ Redis               │
│  │Pipes     │  │ Worker      │                      │
│  └──────────┘  └─────────────┘                      │
└─────────────────────────────────────────────────────┘
                         │
         ┌───────────────┼───────────────┐
         ▼               ▼               ▼
    PostgreSQL:5432  Redis:6379   uploads/ (本地文件)
```

---

## 三、系统初始化（完整步骤）

> 以下是从零搭建项目的完整命令记录。每一步都在实际环境中验证通过。
> 前置条件：Node.js >= 20、pnpm >= 9、Docker Desktop、Git。

### Step 1：创建项目根目录 + pnpm workspace

```bash
mkdir devpulse && cd devpulse
git init

# pnpm-workspace.yaml
cat > pnpm-workspace.yaml << 'EOF'
packages:
  - 'apps/*'
EOF

# 根 package.json（monorepo 编排脚本）
cat > package.json << 'EOF'
{
  "name": "devpulse",
  "private": true,
  "scripts": {
    "dev:api": "pnpm --filter api dev",
    "dev:web": "pnpm --filter web dev",
    "build:api": "pnpm --filter api build",
    "build:web": "pnpm --filter web build",
    "db:migrate": "pnpm --filter api db:migrate",
    "db:seed": "pnpm --filter api db:seed",
    "db:studio": "pnpm --filter api db:studio",
    "docker:up": "docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d",
    "docker:down": "docker compose down"
  }
}
EOF

mkdir -p apps
```

> **为什么用 pnpm workspace 而不是 Turborepo？** 学习项目用纯 workspace 就够了，不需要 Turborepo 的缓存和增量构建。如果后续项目变多，可以随时加 Turborepo，它是 pnpm workspace 之上的增强层。

### Step 2：Docker Compose — PostgreSQL + Redis（dev/prod 分离）

项目采用 **base + override** 模式：`docker-compose.yml` 是生产基线（数据库端口不暴露到宿主机），`docker-compose.dev.yml` 覆盖开发所需的端口映射。

```yaml
# docker-compose.yml（生产基线 — 数据库端口不暴露）
services:
  postgres:
    image: postgres:16-alpine
    container_name: devpulse-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-devpulse}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}       # No fallback — must be injected
      POSTGRES_DB: ${POSTGRES_DB:-devpulse}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - devpulse-net
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-devpulse}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: devpulse-redis
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]
    volumes:
      - redis_data:/data
    networks:
      - devpulse-net
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 512M
    healthcheck:
      test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:

networks:
  devpulse-net:
    driver: bridge
```

```yaml
# docker-compose.dev.yml（开发覆盖 — 暴露端口给本地工具）
services:
  postgres:
    ports:
      - "${POSTGRES_PORT:-5432}:5432"

  redis:
    ports:
      - "${REDIS_PORT:-6379}:6379"
```

```bash
# 开发环境启动（带端口映射，pgAdmin/RedisInsight 可连）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 生产环境启动（数据库端口不暴露，仅内网通信）
docker compose up -d

docker compose ps   # 确认两个容器都是 healthy
```

> **设计决策：**
> - 生产环境不映射 5432/6379 端口到宿主机，数据库只通过 `devpulse-net` 内网桥与 API 容器通信，防止公网端口扫描爆破。
> - `POSTGRES_USER` / `POSTGRES_DB` 使用 `${VAR:-default}` 语法提供兜底默认值，漏配 `.env` 不会崩溃；**密码变量禁止写默认值**，缺失时直接启动失败，强制外部注入。
> - `deploy.resources.limits` 限制容器最大资源占用（PG: 1CPU/1GB, Redis: 0.5CPU/512MB），防止单容器吃满服务器资源影响其他服务共存。
> - `POSTGRES_PORT` / `REDIS_PORT` 只在端口冲突时才需要在 `.env` 中覆盖。

### Step 3：环境变量

项目有两个 `.env` 文件各司其职：

- **根目录 `.env`** — Docker Compose 读取，存放数据库和 Redis 凭证
- **`apps/api/.env`** — NestJS 读取，存放应用配置（JWT、上传、邮件等）

```bash
cp .env.example apps/api/.env
```

`.env.example` 内容：

```env
# Database (docker-compose and app share these values)
POSTGRES_USER=devpulse
POSTGRES_PASSWORD=devpulse123
POSTGRES_DB=devpulse
# POSTGRES_PORT=5432          # Uncomment if port conflicts
DATABASE_URL=postgresql://devpulse:devpulse123@localhost:5432/devpulse

# Redis (shared by docker-compose and NestJS)
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=devpulse_redis   # Use a strong password in production!

# JWT
JWT_SECRET=change-me-to-a-random-secret-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_SECRET=change-me-refresh-secret-in-production
JWT_REFRESH_EXPIRES_IN=7d

# App
API_PORT=3000
API_PREFIX=api/v1
FRONTEND_URL=http://localhost:5173

# Upload
UPLOAD_DIR=./uploads
MAX_FILE_SIZE=2097152

# Admin bootstrap
ADMIN_EMAIL=admin@devpulse.com
ADMIN_PASSWORD=Admin123!

# Email (optional, dev only)
SMTP_HOST=localhost
SMTP_PORT=1025
```

> **安全提示：** `.env` 已在 `.gitignore` 中，不会提交到仓库。生产环境应通过平台密钥管理器或系统环境变量注入，不要放置明文 `.env` 文件。

### Step 4：用 NestJS CLI 生成后端（最佳实践）

```bash
cd apps

# nest new 会自动生成完整的 tsconfig、eslint、jest、nest-cli 配置
# --skip-git 因为根目录已有 git
# --package-manager pnpm 指定包管理器
npx @nestjs/cli new api --package-manager pnpm --skip-git --strict
```

> **为什么用 `nest new` 而不是手动写 package.json？** NestJS CLI 生成的脚手架经过官方测试，tsconfig 的 `emitDecoratorMetadata`、`experimentalDecorators` 等关键配置、jest 配置、eslint 规则都是最优实践，手动写容易遗漏或写错。

CLI 生成后，安装项目需要的额外依赖：

```bash
cd api

# 生产依赖
pnpm add @nestjs/config @nestjs/jwt @nestjs/passport @nestjs/swagger \
  @nestjs/throttler @nestjs/bullmq \
  passport passport-jwt passport-local bcrypt \
  class-validator class-transformer \
  prisma @prisma/client @prisma/adapter-pg pg \
  bullmq ioredis \
  multer sharp winston nest-winston

# 开发依赖
pnpm add -D @types/passport-jwt @types/passport-local @types/bcrypt \
  @types/multer @types/pg dotenv tsx
```

### Step 5：配置 Prisma v7（关键步骤）

Prisma v7 的初始化跟 v6 有显著区别，这里逐步说明。

**5.1 初始化 Prisma**

```bash
npx prisma init --datasource-provider postgresql
```

这会生成两个文件：
- `prisma/schema.prisma` — 数据模型定义
- `prisma.config.ts` — Prisma 配置文件（v7 新增，v6 没有）

**5.2 配置 prisma.config.ts**

Prisma v7 不再允许在 schema 的 `datasource` 块中写 `url = env("DATABASE_URL")`，必须移到这个配置文件：

```typescript
// prisma.config.ts（init 自动生成，无需修改）
import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: { path: "prisma/migrations" },
  datasource: { url: process.env["DATABASE_URL"] },
});
```

**5.3 配置 schema.prisma 的 generator**

这是让 Prisma v7 和 NestJS 共存的关键配置：

```prisma
generator client {
  provider     = "prisma-client"          // v7 新生成器（不是 prisma-client-js）
  output       = "../src/generated/prisma" // 生成到 src 目录下，方便 import
  moduleFormat = "cjs"                     // 核心：输出 CJS 兼容 NestJS
}

datasource db {
  provider = "postgresql"
  // 注意：v7 不在这里写 url，url 在 prisma.config.ts 中
}
```

> **为什么 `moduleFormat = "cjs"` 是最佳实践？**
> - NestJS 整套配置（tsconfig、jest、编译）都基于 CJS，不需要改任何东西
> - 这是 Prisma 官方原生支持的配置项，不是 hack
> - 类型推导、migration、studio、driver adapter 全部正常兼容
> - NestJS 官方示例和社区教程统一用这套方案

**5.4 添加数据模型**

将完整的数据模型写入 `prisma/schema.prisma`（见下方"数据模型"章节）。

**5.5 执行迁移 + 生成客户端**

```bash
npx prisma migrate dev --name init     # 创建数据库表
npx prisma generate                     # 生成 Prisma Client 到 src/generated/prisma/
```

### Step 6：编写 PrismaService + PrismaModule

Prisma v7 要求通过 Driver Adapter 连接数据库，并在 `onModuleInit` 中执行管理员初始化和权限种子：

```typescript
// src/prisma/prisma.service.ts（完整实现）
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
import { PrismaClient } from '../generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import {
  ALL_PERMISSIONS, ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS, SYSTEM_ROLES,
} from '../common/constants/permissions';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const connectionString = process.env.DATABASE_URL!;
    const adapter = new PrismaPg({ connectionString });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Database connected');
    await this.seedRolesAndPermissionsIfEmpty();
    await this.bootstrapAdminIfNoneExists();
  }

  async onModuleDestroy() { await this.$disconnect(); }

  // ─── 幂等 seed：角色 + 权限 + 映射 ───
  private async seedRolesAndPermissionsIfEmpty(): Promise<void> {
    try {
      const roleCount = await this.role.count();
      const permCount = await this.permission.count();
      if (roleCount > 0 && permCount > 0) {
        this.logger.log(`Roles (${roleCount}) and permissions (${permCount}) already seeded`);
        return;
      }
      // 1. Upsert 系统角色（ADMIN/AUTHOR/READER）
      for (const [, config] of Object.entries(SYSTEM_ROLES)) {
        await this.role.upsert({
          where: { name: config.name },
          update: { description: config.description, isSystem: config.isSystem },
          create: { name: config.name, description: config.description, isSystem: config.isSystem },
        });
      }
      // 2. Upsert 14 个权限记录
      for (const perm of ALL_PERMISSIONS) {
        const [resource, ...actionParts] = perm.split(':');
        const action = actionParts.join(':');
        await this.permission.upsert({
          where: { resource_action: { resource, action } },
          update: { description: PERMISSION_DESCRIPTIONS[perm] ?? null },
          create: { resource, action, description: PERMISSION_DESCRIPTIONS[perm] ?? null },
        });
      }
      // 3. 分配默认角色→权限映射
      const allRoles = await this.role.findMany();
      const allPerms = await this.permission.findMany();
      const permMap = new Map(allPerms.map((p) => [`${p.resource}:${p.action}`, p.id]));
      for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
        const role = allRoles.find((r) => r.name === roleName);
        if (!role) continue;
        const permIds = perms.map((p) => permMap.get(p)).filter(Boolean) as string[];
        if (permIds.length > 0) {
          await this.rolePermission.deleteMany({ where: { roleId: role.id } });
          await this.rolePermission.createMany({
            data: permIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
          });
        }
      }
      this.logger.log('Roles and permissions seeded successfully');
    } catch (error) {
      this.logger.warn(`Role/Permission seeding skipped: ${(error as Error).message}`);
    }
  }

  // ─── 生产环境 ADMIN 自动创建 ───
  private async bootstrapAdminIfNoneExists(): Promise<void> {
    try {
      const adminRole = await this.role.findUnique({ where: { name: 'ADMIN' } });
      if (!adminRole) return;
      const adminUserRoleCount = await this.userRole.count({ where: { roleId: adminRole.id } });
      if (adminUserRoleCount > 0) return;  // 已有 ADMIN，跳过

      const email = process.env.ADMIN_EMAIL;
      const password = process.env.ADMIN_PASSWORD;
      if (!email || !password) {
        this.logger.warn('No admin found and ADMIN_EMAIL/ADMIN_PASSWORD not set. Run `pnpm seed`.');
        return;
      }

      const existingUser = await this.user.findUnique({ where: { email } });
      if (existingUser) {
        // 用户已存在但无 ADMIN 角色 → 自动提升
        const hasAdminRole = await this.userRole.findUnique({
          where: { userId_roleId: { userId: existingUser.id, roleId: adminRole.id } },
        });
        if (!hasAdminRole) {
          await this.userRole.create({ data: { userId: existingUser.id, roleId: adminRole.id } });
          this.logger.log(`Promoted existing user ${email} to ADMIN`);
        }
        return;
      }

      // 创建全新 ADMIN 账户
      const passwordHash = await bcrypt.hash(password, 12);
      const user = await this.user.create({
        data: {
          email, username: email.split('@')[0],
          passwordHash, displayName: 'Administrator', bio: 'System administrator',
        },
      });
      await this.userRole.create({ data: { userId: user.id, roleId: adminRole.id } });
      this.logger.log(`Initial admin account created: ${email}`);
    } catch (error) {
      this.logger.warn(`Admin bootstrap failed: ${(error as Error).message}`);
    }
  }
}
```

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

> `@Global()` 让 PrismaService 在所有模块中可直接注入，无需每个模块都 import PrismaModule。`seedRolesAndPermissionsIfEmpty()` 和 `bootstrapAdminIfNoneExists()` 均为幂等操作，重复启动安全无副作用。`permissions.ts` 中定义的 `SYSTEM_ROLES`、`ALL_PERMISSIONS`、`ROLE_PERMISSIONS`、`PERMISSION_DESCRIPTIONS` 四个常量完整代码见[第十三章](#十三项目复刻关键代码)。

### Step 7：配置 NestJS 入口

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { AllExceptionFilter } from './common/filters/all-exception.filter';
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Global prefix
  app.setGlobalPrefix('api/v1');

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );

  // Global exception filter → unified { error: { code, message } }
  app.useGlobalFilters(new AllExceptionFilter());

  // Global interceptor → wrap responses in { data, meta? }
  app.useGlobalInterceptors(new TransformInterceptor());

  // CORS
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
  });

  // Swagger API docs
  const config = new DocumentBuilder()
    .setTitle('DevPulse API')
    .setDescription('Developer community platform API')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api/docs', app, document);

  const port = process.env.API_PORT || 3000;
  await app.listen(port);
  console.log(`API running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}
bootstrap();
```

> **关键：** `AllExceptionFilter` 和 `TransformInterceptor` 是全局注册的核心基础设施，分别统一错误格式和响应包装。完整实现代码见[第十三章](#十三项目复刻关键代码)。

```typescript
// src/app.module.ts（完整版本 — 14 个 imports）
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import { BullModule } from '@nestjs/bullmq';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { PrismaModule } from './prisma/prisma.module';
import { PermissionModule } from './common/permission/permission.module';
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

@Module({
  imports: [
    // Environment variables
    ConfigModule.forRoot({ isGlobal: true }),
    // Rate limiting: 60 requests per minute
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }]),
    // BullMQ (Redis job queue)
    BullModule.forRoot({
      connection: {
        host: process.env.REDIS_HOST || 'localhost',
        port: parseInt(process.env.REDIS_PORT || '6379'),
        password: process.env.REDIS_PASSWORD || undefined,
      },
    }),
    // Serve uploaded files statically
    ServeStaticModule.forRoot({
      rootPath: join(process.cwd(), 'uploads'),
      serveRoot: '/uploads',
    }),
    // Prisma (global, available everywhere via @Global())
    PrismaModule,
    // RBAC permissions (global, provides PermissionsGuard + PermissionService)
    PermissionModule,
    // Feature modules (按开发顺序逐个添加)
    AuthModule,
    UserModule,
    ProfileModule,
    ArticleModule,
    TagModule,
    CommentModule,
    NotificationModule,
    SearchModule,
    AdminModule,
    UploadModule,
    QueueModule,
  ],
})
export class AppModule {}
```

> **模块开发顺序建议：** 先搭基础设施层（PrismaModule → PermissionModule → AuthModule），再按业务依赖关系逐个添加：UserModule → ProfileModule → ArticleModule → TagModule → CommentModule → NotificationModule → SearchModule → AdminModule → UploadModule → QueueModule。每个模块添加后都应验证编译通过。

### Step 8：验证后端启动

```bash
pnpm dev   # 或 nest start --watch
# 应看到：
#   API: http://localhost:3000
#   Swagger: http://localhost:3000/api/docs

curl http://localhost:3000/api/v1   # 应返回 "Hello World!"
```

### Step 9：种子数据

```bash
npx tsx prisma/seed.ts
# 应看到：
#   🌱 Seeding database...
#   Admin created: admin@devpulse.com
#   Author created: author@devpulse.com
#   ...
#   ✅ Seeding complete!
```

测试账号：
- `admin@devpulse.com / Admin123!`（管理员）
- `author@devpulse.com / Author123!`（作者）
- `dbexpert@devpulse.com / Author123!`（作者 — 数据库专家）
- `reader@devpulse.com / Reader123!`（读者）

### Step 10：用 Vite CLI 生成前端

```bash
cd ..   # 回到 apps/ 目录

pnpm create vite web -- --template react-ts
cd web
pnpm install

# 安装项目依赖
pnpm add react react-dom react-router-dom \
  @tanstack/react-query zustand axios \
  @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-placeholder \
  react-hook-form @hookform/resolvers zod \
  tailwindcss @tailwindcss/vite lucide-react clsx tailwind-merge

pnpm add -D @types/react @types/react-dom @vitejs/plugin-react
```

配置 Vite（API 代理 + Tailwind + 路径别名）：

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
```

配置 TypeScript 路径别名（使 `@/` 映射到 `src/`）：

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "lib": ["ES2023", "DOM", "DOM.Iterable"],
    "types": ["vite/client"],
    "skipLibCheck": true,
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "verbatimModuleSyntax": true,
    "moduleDetection": "force",
    "noEmit": true,
    "paths": { "@/*": ["./src/*"] },
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src"]
}
```

> **`paths` 必须和 `vite.config.ts` 的 `resolve.alias` 一致**，否则 TypeScript 编译通过但 Vite 运行时找不到模块。

全局样式文件 `src/index.css` 包含三部分：`@import "tailwindcss"` 引入 Tailwind 4、`.prose` 文章排版样式（h1-h3/code/pre/blockquote/table/img 等完整排版）、`.tiptap-editor` 富文本编辑器样式。约 287 行，完整代码见[第十三章](#十三项目复刻关键代码)。

### Step 11：验证前端启动

```bash
pnpm dev   # Vite 启动，:5173
# 浏览器打开 http://localhost:5173 应看到 DevPulse 页面
```

### Step 12：.gitignore

```
node_modules/
dist/
build/
.env
.env.local
.env.*.local
.DS_Store
uploads/
*.log
coverage/
src/generated/
```

> `src/generated/` 加入 gitignore，因为它是 `prisma generate` 的输出产物，不需要提交。

### 验证清单

```bash
# 1. Docker 容器运行中（开发模式）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose ps   # 两个容器 healthy，5432/6379 端口已映射

# 2. 后端启动
cd apps/api && pnpm dev
# → http://localhost:3000/api/docs 看到 Swagger 文档

# 3. 前端启动
cd apps/web && pnpm dev
# → http://localhost:5173 看到 DevPulse 页面

# 4. 数据库有种子数据
npx prisma studio
# → http://localhost:5555 可以浏览所有表
```

全部通过后，初始化阶段完成。

---

## 四、功能模块详细设计（PRD）

### 模块 1：用户认证与授权（第 1 周）

#### 1.1 注册 `POST /auth/register`

**用户故事：** 作为新用户，我想通过邮箱注册账号。

**请求：**
```json
{ "email": "dev@example.com", "username": "cooldev", "password": "MyStr0ng!Pass", "displayName": "Cool Dev" }
```

**成功响应（201）：**
```json
{ "data": { "id": "uuid", "email": "dev@example.com", "username": "cooldev", "role": "READER", "accessToken": "eyJ...", "refreshToken": "eyJ..." } }
```

**验收标准：**
- 邮箱格式合法且唯一，重复返回 409
- 用户名 3-20 位字母数字下划线，唯一，重复返回 409
- 密码 >= 8 位，含大小写 + 数字，bcrypt（cost=12）哈希存储
- 注册成功自动登录，返回双令牌
- 默认角色 READER
- 注册成功后通过 BullMQ 异步发送欢迎邮件

**并发场景：** 两个请求同时用相同邮箱注册 → 数据库唯一约束兜底，捕获 Prisma `P2002` 错误返回 409。

#### 1.2 登录 `POST /auth/login`

**验收标准：**
- 邮箱不存在 → 401"邮箱或密码错误"（不暴露具体哪个错）
- 密码错误 → 401 同上
- 被封禁用户 → 403
- accessToken 有效期 15 分钟，refreshToken 有效期 7 天
- **多设备登录**：每次登录生成唯一 `deviceId`（UUID），refreshToken 哈希 + 设备元数据存入 Redis HASH `rt:{userId}:{deviceId}`，同时加入设备索引集合 `rt:{userId}:_devices`
- 支持可选 `deviceName` 请求体字段（如 "Chrome on macOS"），不传则从 User-Agent 自动解析平台
- 单用户最多 10 个并发设备，超出时自动淘汰最早登录的设备

**Redis 数据结构（多设备会话）：**
```
# 设备会话（HASH + TTL 7d）
rt:{userId}:{deviceId}  →  {
  tokenHash:    "bcrypt(refreshToken)",
  deviceName:   "Chrome on macOS",
  platform:     "macOS",
  ip:           "127.0.0.1",
  loginAt:      "2026-01-01T00:00:00.000Z",
  lastActiveAt: "2026-01-01T10:00:00.000Z"
}

# 设备索引（SET，用于遍历和批量失效）
rt:{userId}:_devices  →  { deviceId1, deviceId2, ... }
```

#### 1.3 令牌刷新 `POST /auth/refresh`

**验收标准：**
- 验证 refreshToken 签名 + 有效期，从 JWT payload 提取 `deviceId`
- 在 Redis 查找 `rt:{userId}:{deviceId}` 中的 `tokenHash`，比对 bcrypt 哈希
- 验证通过后颁发新双令牌（令牌轮转），**新 token 使用新的 deviceId**，旧设备会话被删除
- Token 重用检测：如果 `tokenHash` 不匹配（旧 token 被重用），仅撤销该设备会话，不影响其他设备
- 会话不存在（已过期/已撤销）→ `ErrTokenRevoked`（401）

#### 1.4 注销 `POST /auth/logout`（需认证）

**验收标准：**
- 请求体传 `refreshToken` → 服务端解码出 `deviceId`，仅注销该设备会话（从 Redis 删除 `rt:{userId}:{deviceId}` + 从 `_devices` 集合移除）
- 不传 `refreshToken` → 保守策略：注销当前用户所有设备（批量删除所有 `rt:{userId}:*` 键 + `_devices` 集合）
- 前端只需把本地存储的 refreshToken 传给后端，不需要自己管理 deviceId

**全部下线 `POST /auth/logout-all`（需认证）：**

显式撤销用户所有设备会话，**同时递增 `tokenVersion`** 使所有已签发的 AccessToken 立即失效。调用场景：
- 用户在安全中心点击"退出所有设备"
- **修改密码后自动触发**（ProfileService.updatePassword 完成后调用 AuthService.logoutAll，递增 tokenVersion + 撤销所有会话）
- 管理员封禁账号时调用

#### 1.5 会话管理（多设备）

**获取活跃会话列表 `GET /auth/sessions`（需认证）：**

返回当前用户所有活跃设备的信息，按 `lastActiveAt` 降序排列：
```json
[
  {
    "deviceId": "uuid-1",
    "deviceName": "Chrome on macOS",
    "platform": "macOS",
    "ip": "192.168.1.100",
    "loginAt": "2026-01-01T00:00:00.000Z",
    "lastActiveAt": "2026-01-01T10:00:00.000Z"
  }
]
```

**注销指定设备 `DELETE /auth/sessions/:deviceId`（需认证）：**

撤销指定设备的会话。如果 `deviceId` 不存在 → `ErrSessionNotFound`（404）。

**设备数量上限：** 单用户最多同时 10 个活跃设备（`MAX_DEVICES = 10`）。新设备登录时，如果达到上限，自动淘汰 `loginAt` 最早的设备。

#### 1.6 角色与权限（RBAC）

项目采用角色-权限解耦的 RBAC 设计。角色（Role）作为用户分类标识保留在 User 模型上（READER/AUTHOR/ADMIN 枚举），权限（Permission）独立存储在 `permissions` 表中，角色与权限通过 `role_permissions` 多对多关联表动态分配。

| 角色 | 默认权限数 | 说明 |
|------|-----------|------|
| READER | 5 | 发布文章、编辑/删除自己的文章、发表/删除自己的评论 |
| AUTHOR | 5 | 与 READER 相同（权限由关联表控制，而非硬编码） |
| ADMIN | 14 | 全部权限（守卫层自动绕过） |

**关键设计决策：**
- ADMIN 在 PermissionsGuard 中作为超级用户直接绕过，无需逐条查询权限
- 权限分 `:own` 和 `:any` 两种粒度（如 `article:update:own` vs `article:update:any`）
- 守卫层做能力检查（"该角色能否做此类操作"），Service 层做最终归属验证（"该用户是否拥有此资源"）
- 管理员可通过前端权限管理页面动态调整各角色的权限分配

NestJS 实现：`@RequirePermission('article:create')` 装饰器 + `PermissionsGuard` 守卫（替代了早期的 `@Roles` + `RolesGuard`）。详见[第五章 RBAC 权限系统设计](#五rbac-权限系统设计)。

#### 数据模型

```prisma
model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  username     String   @unique
  passwordHash String   @map("password_hash")
  displayName  String   @map("display_name")
  avatar       String?
  bio          String?  @db.Text
  role         Role     @default(READER)
  isBanned     Boolean  @default(false) @map("is_banned")
  bannedAt     DateTime? @map("banned_at")
  banReason    String?  @map("ban_reason")
  tokenVersion Int      @default(0) @map("token_version") // 令牌版本号，安全事件时递增使所有已签发 AccessToken 立即失效
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")
  // 关联关系见完整 schema
  @@map("users")
}
```

#### RBAC 权限数据模型

> **重要：** 以下是完整的 `prisma/schema.prisma` 文件内容（v6.2 最终版），包含全部 13 个 model、2 个 enum 和所有索引/约束。复刻时直接复制此文件即可。

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}

datasource db {
  provider = "postgresql"
}

// ==================== User ====================

model User {
  id           String   @id @default(uuid()) @db.Uuid
  email        String   @unique
  username     String   @unique
  passwordHash String   @map("password_hash")
  displayName  String   @map("display_name")
  avatar       String?
  bio          String?  @db.Text
  isBanned     Boolean  @default(false) @map("is_banned")
  bannedAt     DateTime? @map("banned_at")
  banReason    String?  @map("ban_reason")
  tokenVersion Int      @default(0) @map("token_version") // 令牌版本号，安全事件时递增使所有已签发 AccessToken 立即失效
  createdAt    DateTime @default(now()) @map("created_at")
  updatedAt    DateTime @updatedAt @map("updated_at")

  roles                UserRole[]
  articles             Article[]
  comments             Comment[]
  likes                Like[]
  bookmarks            Bookmark[]
  commentLikes         CommentLike[]
  followers            Follow[]         @relation("Following")
  following            Follow[]         @relation("Followers")
  receivedNotifications Notification[]  @relation("NotificationRecipient")
  triggeredNotifications Notification[]  @relation("NotificationActor")

  @@map("users")
}

// ==================== Article ====================

model Article {
  id            String        @id @default(uuid()) @db.Uuid
  title         String
  slug          String        @unique
  content       String        @db.Text
  summary       String?       @db.Text
  coverImage    String?       @map("cover_image")
  status        ArticleStatus @default(DRAFT)
  viewCount     Int           @default(0) @map("view_count")
  likeCount     Int           @default(0) @map("like_count")
  commentCount  Int           @default(0) @map("comment_count")
  readTimeMinutes Int         @default(1) @map("read_time_minutes")
  version       Int           @default(1)
  searchVector  Unsupported("tsvector")? @map("search_vector")

  authorId String @map("author_id") @db.Uuid
  author   User   @relation(fields: [authorId], references: [id], onDelete: Cascade)

  tags      Tag[]
  comments  Comment[]
  likes     Like[]
  bookmarks Bookmark[]

  publishedAt DateTime? @map("published_at")
  deletedAt   DateTime? @map("deleted_at")
  createdAt   DateTime  @default(now()) @map("created_at")
  updatedAt   DateTime  @updatedAt @map("updated_at")

  @@index([status, publishedAt(sort: Desc)])
  @@index([authorId])
  @@index([slug])
  @@map("articles")
}

enum ArticleStatus {
  DRAFT
  PUBLISHED
  ARCHIVED
}

// ==================== Tag ====================

model Tag {
  id           String   @id @default(uuid()) @db.Uuid
  name         String   @unique
  slug         String   @unique
  description  String?  @db.Text
  color        String?
  articleCount Int      @default(0) @map("article_count")

  articles Article[]
  createdAt DateTime @default(now()) @map("created_at")

  @@map("tags")
}

// ==================== Comment ====================

model Comment {
  id        String  @id @default(uuid()) @db.Uuid
  content   String  @db.Text
  articleId String  @map("article_id") @db.Uuid
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  authorId  String  @map("author_id") @db.Uuid
  author    User    @relation(fields: [authorId], references: [id], onDelete: Cascade)
  parentId  String? @map("parent_id") @db.Uuid
  parent    Comment? @relation("CommentReplies", fields: [parentId], references: [id], onDelete: Cascade)
  replies   Comment[] @relation("CommentReplies")

  likes     CommentLike[]
  createdAt DateTime @default(now()) @map("created_at")
  updatedAt DateTime @updatedAt @map("updated_at")

  @@index([articleId, parentId])
  @@map("comments")
}

// ==================== Like ====================

model Like {
  id        String  @id @default(uuid()) @db.Uuid
  userId    String  @map("user_id") @db.Uuid
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  articleId String  @map("article_id") @db.Uuid
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([userId, articleId])
  @@map("likes")
}

model CommentLike {
  id        String  @id @default(uuid()) @db.Uuid
  userId    String  @map("user_id") @db.Uuid
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  commentId String  @map("comment_id") @db.Uuid
  comment   Comment @relation(fields: [commentId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([userId, commentId])
  @@map("comment_likes")
}

// ==================== Bookmark ====================

model Bookmark {
  id        String  @id @default(uuid()) @db.Uuid
  userId    String  @map("user_id") @db.Uuid
  user      User    @relation(fields: [userId], references: [id], onDelete: Cascade)
  articleId String  @map("article_id") @db.Uuid
  article   Article @relation(fields: [articleId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now()) @map("created_at")

  @@unique([userId, articleId])
  @@map("bookmarks")
}

// ==================== Follow ====================

model Follow {
  id          String  @id @default(uuid()) @db.Uuid
  followerId  String  @map("follower_id") @db.Uuid
  follower    User    @relation("Following", fields: [followerId], references: [id], onDelete: Cascade)
  followingId String  @map("following_id") @db.Uuid
  following   User    @relation("Followers", fields: [followingId], references: [id], onDelete: Cascade)
  createdAt   DateTime @default(now()) @map("created_at")

  @@unique([followerId, followingId])
  @@index([followerId])
  @@index([followingId])
  @@map("follows")
}

// ==================== Role & Permission (RBAC) ====================

model Role {
  id          String   @id @default(uuid()) @db.Uuid
  name        String   @unique
  description String?  @db.Text
  isSystem    Boolean  @default(false) @map("is_system")

  users       UserRole[]
  permissions RolePermission[]

  createdAt   DateTime @default(now()) @map("created_at")

  @@map("roles")
}

model UserRole {
  id     String @id @default(uuid()) @db.Uuid
  userId String @map("user_id") @db.Uuid
  roleId String @map("role_id") @db.Uuid

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")

  @@unique([userId, roleId])
  @@map("user_roles")
}

model Permission {
  id          String   @id @default(uuid()) @db.Uuid
  resource    String
  action      String
  description String?  @db.Text

  roles RolePermission[]

  @@unique([resource, action])
  @@map("permissions")
}

model RolePermission {
  id           String   @id @default(uuid()) @db.Uuid
  roleId       String   @map("role_id") @db.Uuid
  permissionId String   @map("permission_id") @db.Uuid

  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)

  createdAt DateTime @default(now()) @map("created_at")

  @@unique([roleId, permissionId])
  @@map("role_permissions")
}

// ==================== Notification ====================

model Notification {
  id          String             @id @default(uuid()) @db.Uuid
  type        NotificationType
  recipientId String             @map("recipient_id") @db.Uuid
  recipient   User               @relation("NotificationRecipient", fields: [recipientId], references: [id], onDelete: Cascade)
  actorId     String             @map("actor_id") @db.Uuid
  actor       User               @relation("NotificationActor", fields: [actorId], references: [id], onDelete: Cascade)
  articleId   String?            @map("article_id") @db.Uuid
  commentId   String?            @map("comment_id") @db.Uuid
  content     String
  isRead      Boolean            @default(false) @map("is_read")
  createdAt   DateTime           @default(now()) @map("created_at")

  @@index([recipientId, isRead, createdAt(sort: Desc)])
  @@map("notifications")
}

enum NotificationType {
  ARTICLE_LIKED
  COMMENT_RECEIVED
  COMMENT_REPLIED
  COMMENT_LIKED
  USER_FOLLOWED
  ARTICLE_PUBLISHED
}
```

> **设计说明：** 角色不再使用 Prisma `enum`，而是存储在 `roles` 表中（支持运行时动态创建自定义角色）。用户通过 `user_roles` 多对多关联表可拥有多个角色，角色通过 `role_permissions` 多对多关联表拥有多个权限。`Role.isSystem` 标记系统内置角色（READER/AUTHOR/ADMIN），自定义角色的 `isSystem = false`，系统角色不可删除。完整的权限常量定义和 seed 逻辑见[第十三章 项目复刻关键代码](#十三项目复刻关键代码)。

---

### 模块 2：用户个人中心（第 1-2 周）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/users/:id` | GET | 用户公开信息 + 统计数据 |
| `/users/me` | PATCH | 修改资料（昵称/头像/简介） |
| `/users/me/password` | PATCH | 修改密码（需验证旧密码，成功后自动调用 AuthService.logoutAll 撤销所有会话并递增 tokenVersion） |
| `/users/me/avatar` | POST | 上传头像（multipart/form-data） |

**统计查询（用 raw SQL 一条完成，避免 N+1）：**

```sql
SELECT
  (SELECT COUNT(*) FROM articles WHERE author_id = $1 AND status = 'PUBLISHED') AS "articleCount",
  (SELECT COALESCE(SUM(like_count), 0) FROM articles WHERE author_id = $1 AND status = 'PUBLISHED') AS "totalLikes",
  (SELECT COUNT(*) FROM follows WHERE following_id = $1) AS "followerCount",
  (SELECT COUNT(*) FROM follows WHERE follower_id = $1) AS "followingCount"
```

**头像上传：** Multer 限制 2MB + jpg/png/webp → Sharp 裁剪正方形 → 生成 200x200 + 50x50 → 转 webp。

---

### 模块 3：文章系统（第 2-3 周）

#### 核心接口

| 接口 | 方法 | 说明 |
|------|------|------|
| `/articles` | POST | 创建文章（AUTHOR 角色） |
| `/articles` | GET | 文章列表（分页/标签筛选/排序） |
| `/articles/:slug` | GET | 文章详情（含当前用户点赞/收藏状态） |
| `/articles/:id` | PATCH | 编辑文章（仅作者本人） |
| `/articles/:id` | DELETE | 删除文章（软删除，作者或管理员） |
| `/articles/:id/publish` | PATCH | 发布/取消发布 |

#### 并发场景 A：slug 冲突

两个用户同时用相同标题创建文章 → 数据库唯一约束兜底，捕获 `P2002` 后自动追加随机后缀重试（最多 3 次）。

#### 并发场景 B：阅读量更新（Redis 缓冲 + 定时刷写）

```
1. 用户访问文章 → Redis: SISMEMBER view:{articleId}:{date} {userId/IP}
2. 不存在 → SADD + INCR view_buffer:{articleId}
3. BullMQ 定时任务（每 60s）：
   - 遍历 view_buffer:* 的 key
   - UPDATE articles SET view_count = view_count + {buffer_count}
   - 清除 buffer
```

好处：数据库写入从"每次访问"降为"每分钟一次"，且同 IP 去重。

#### 并发场景 C：文章编辑冲突（乐观锁）

```prisma
model Article {
  version  Int  @default(1)  // 乐观锁版本号
}
```

编辑时 SQL：`UPDATE articles SET content = $1, version = version + 1 WHERE id = $2 AND version = $3`。如果 affected rows = 0 → 返回 409 Conflict。

---

### 模块 4：标签系统（第 3-4 周）

| 接口 | 方法 | 说明 |
|------|------|------|
| `/tags` | GET | 标签列表（带文章数） |
| `/tags/:slug/articles` | GET | 标签下的文章 |
| `/tags` | POST | 创建标签（ADMIN） |

**并发场景：标签 articleCount 更新（悲观锁）**

多篇文章同时关联同一标签时，使用事务 + `SELECT FOR UPDATE`：

```typescript
await prisma.$transaction(async (tx) => {
  await tx.$executeRaw`SELECT * FROM tags WHERE id = ${tagId} FOR UPDATE`;
  await tx.$executeRaw`UPDATE tags SET article_count = article_count + 1 WHERE id = ${tagId}`;
});
```

---

### 模块 5：互动系统（第 4-5 周）

#### 评论

| 接口 | 方法 | 说明 |
|------|------|------|
| `/articles/:id/comments` | POST | 发表评论 |
| `/articles/:id/comments` | GET | 评论列表（嵌套展示） |
| `/comments/:id` | PATCH | 编辑评论 |
| `/comments/:id` | DELETE | 删除评论 |

最多两级嵌套（顶级评论 + 回复）。回复的 parentId 自动指向顶级评论。

#### 点赞/收藏（toggle + 事务锁）

```typescript
// POST /articles/:id/like — toggle 模式
await prisma.$transaction(async (tx) => {
  const existing = await tx.like.findUnique({
    where: { userId_articleId: { userId, articleId } }
  });
  if (existing) {
    await tx.like.delete({ where: { id: existing.id } });
    await tx.$executeRaw`UPDATE articles SET like_count = like_count - 1 WHERE id = ${articleId}`;
    return { liked: false };
  } else {
    await tx.like.create({ data: { userId, articleId } });
    await tx.$executeRaw`UPDATE articles SET like_count = like_count + 1 WHERE id = ${articleId}`;
    // BullMQ: 添加通知任务
    return { liked: true };
  }
});
```

---

### 模块 6：关注 + 通知（第 5-6 周）

**关注：** `POST /users/:id/follow`（toggle），不能关注自己。

**Feed 流：** `GET /users/me/feed`，只返回关注用户的已发布文章。

**通知类型：** ARTICLE_LIKED、COMMENT_RECEIVED、COMMENT_REPLIED、COMMENT_LIKED、USER_FOLLOWED、ARTICLE_PUBLISHED。

5 种通知类型已在业务代码中接入 BullMQ：ARTICLE_LIKED（文章点赞）、COMMENT_RECEIVED（收到评论）、COMMENT_REPLIED（评论被回复）、COMMENT_LIKED（评论被赞）、USER_FOLLOWED（被关注）。ARTICLE_PUBLISHED 暂未接入（需通知所有关注者，暂列为后续优化）。

---

### 模块 7：搜索 + 管理后台（第 6-8 周）

**全文搜索：** 使用 PostgreSQL 内置 `tsvector` + `plainto_tsquery`，在 Prisma 中通过 `$queryRaw` 实现：

```sql
-- 发布时更新搜索向量
UPDATE articles SET search_vector =
  setweight(to_tsvector('english', title), 'A') ||
  setweight(to_tsvector('english', COALESCE(summary, '')), 'B') ||
  setweight(to_tsvector('english', COALESCE(content, '')), 'C')
WHERE id = $1;

-- 搜索
SELECT a.*, ts_rank(a.search_vector, query) AS rank,
       ts_headline('english', a.title, query) AS title_highlight
FROM articles a, plainto_tsquery('english', $1) query
WHERE a.search_vector @@ query AND a.status = 'PUBLISHED'
ORDER BY rank DESC LIMIT $2 OFFSET $3;
```

**管理后台 API：**
- `GET/PATCH /admin/users` — 用户管理（角色修改/封禁）
- `GET/DELETE /admin/articles` — 文章管理
- `GET/DELETE /admin/tags` — 标签管理
- `GET /admin/dashboard` — 仪表盘统计（用户数/文章数/增长趋势/热门标签）
- `GET /admin/permissions` — 获取所有权限列表
- `GET /admin/roles` — 获取所有角色列表（含用户计数）
- `POST /admin/roles` — 创建自定义角色
- `DELETE /admin/roles/:id` — 删除自定义角色（系统角色不可删除）
- `GET /admin/roles/permissions` — 获取所有角色及其权限分配
- `PUT /admin/roles/:roleId/permissions` — 更新指定角色的权限分配

**安全规则：**
- 不能修改自己的角色
- 不能降级最后一个 ADMIN（必须先提升另一个用户为 ADMIN）
- 只有拥有 `permission:manage` 权限的角色才能操作权限管理端点

**管理员初始化（双保险）：**
- 开发环境：`npx tsx prisma/seed.ts` 创建预设管理员和完整种子数据
- 生产环境：PrismaService.onModuleInit 启动时自动检测，若无 ADMIN 账户且存在 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 环境变量，则自动创建初始管理员
- 权限种子：启动时检测 permissions 表是否为空，为空则自动 upsert 14 个默认权限并分配角色映射

---

## 五、RBAC 权限系统设计

> 本章节详细记录从硬编码角色守卫到完整 RBAC 权限系统的演进过程和实现细节。

### 5.1 设计动机

早期实现使用 `@Roles('AUTHOR')` + `RolesGuard` 进行角色检查，采用角色层级（ADMIN > AUTHOR > READER）硬编码逻辑。这种方案存在几个问题：

- **角色与权限耦合**：角色直接决定能做什么操作，无法细粒度调整
- **扩展性差**：新增操作需要修改守卫代码，不能通过配置动态分配
- **权限分配不透明**：无法直观看到每个角色到底拥有哪些权限
- **新注册用户 403**：READER 用户发文报 403，因为旧守卫要求 AUTHOR 角色才能创建文章
- **角色为枚举不可扩展**：旧实现使用 Prisma `enum Role { READER AUTHOR ADMIN }`，无法在运行时添加自定义角色
- **单角色限制**：用户只能拥有一个角色，无法同时赋予 ADMIN + AUTHOR 等多重身份

### 5.2 架构设计

```
┌──────────┐     ┌──────────────┐     ┌────────────┐
│  Request  │────▶│ JwtAuthGuard │────▶│Permissions│
│           │     │ (认证)       │     │  Guard     │
└──────────┘     └──────────────┘     │ (鉴权)     │
                                      └─────┬──────┘
                                            │
                                   ┌────────▼─────────┐
                                   │ PermissionService │
                                   │ (用户维度缓存60s)│
                                   │ 多角色权限聚合   │
                                   └────────┬─────────┘
                                            │
                                   ┌────────▼─────────┐
                                   │  user_roles       │
                                   │  role_permissions │
                                   │  (PostgreSQL)    │
                                   └──────────────────┘
```

**数据模型：**

```
User ──< UserRole >── Role ──< RolePermission >── Permission
         (多对多)            (多对多)
```

- 用户通过 `UserRole` 关联表拥有多个角色
- 角色通过 `RolePermission` 关联表拥有多个权限
- PermissionsGuard 聚合用户所有角色的权限，取并集

**三层检查逻辑：**

1. **ADMIN 超级用户绕过**：`roleNames.includes('ADMIN')` 直接放行，不查数据库
2. **直接权限匹配**：检查用户聚合权限是否包含路由要求的权限
3. **:any → :own 回退**：如果路由要求 `article:update:any`，用户只有 `article:update:own`，则放行（由 Service 层做最终归属验证）

### 5.3 权限清单（14 项）

| 权限标识 | 说明 | READER | AUTHOR | ADMIN |
|---------|------|--------|--------|-------|
| `article:create` | 发布文章 | | ✅ | ✅ |
| `article:update:own` | 编辑自己的文章 | | ✅ | ✅ |
| `article:update:any` | 编辑任意文章 | | | ✅ |
| `article:delete:own` | 删除自己的文章 | | ✅ | ✅ |
| `article:delete:any` | 删除任意文章 | | | ✅ |
| `comment:create` | 发表评论 | ✅ | ✅ | ✅ |
| `comment:delete:own` | 删除自己的评论 | ✅ | ✅ | ✅ |
| `comment:delete:any` | 删除任意评论 | | | ✅ |
| `tag:manage` | 管理标签 | | | ✅ |
| `user:manage` | 管理用户角色 | | | ✅ |
| `user:ban` | 封禁/解封用户 | | | ✅ |
| `role:manage` | 管理角色 | | | ✅ |
| `permission:manage` | 管理权限分配 | | | ✅ |
| `admin:access` | 访问管理后台 | | | ✅ |

> **注意：** READER 仅可评论，AUTHOR 额外拥有文章发布/编辑/删除权限。ADMIN 拥有全部权限。角色通过数据库 `roles` 表管理，支持运行时动态新增自定义角色。

### 5.4 核心实现文件

| 文件 | 职责 |
|------|------|
| `common/constants/permissions.ts` | 权限常量定义、SYSTEM_ROLES 定义、默认角色映射、中文描述 |
| `common/permission/permission.service.ts` | 权限 CRUD、用户维度缓存（60s TTL）、角色 CRUD（createRole/deleteRole）、角色权限分配、seedRolesAndPermissions |
| `common/permission/permissions.guard.ts` | CanActivate 守卫、多角色权限聚合、ADMIN 绕过、:any→:own 回退 |
| `common/permission/require-permission.decorator.ts` | `@RequirePermission()` 元数据装饰器 |
| `common/permission/permission.module.ts` | `@Global()` 全局模块，提供 Guard 和 Service |
| `admin/dto/update-user-role.dto.ts` | `roleIds: string[]` 数组校验 DTO |
| `admin/dto/create-role.dto.ts` | 角色创建 DTO（名称 + 权限列表） |
| `admin/dto/update-role-permissions.dto.ts` | 角色权限更新 DTO（权限 ID 列表） |
| `tag/dto/create-tag.dto.ts` | 标签创建 DTO（名称 + 描述校验） |

### 5.5 控制器集成方式

```typescript
// 文章控制器 — 创建需要 article:create 权限
@Post()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('article:create')
create(@Body() dto, @CurrentUser('id') userId) { ... }

// 管理控制器 — 类级别 admin:access，方法级别细化
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('admin:access')    // 类级别：所有方法都需要
@Controller('admin')
export class AdminController {
  @Get('permissions')
  @RequirePermission('permission:manage')  // 方法级别：覆盖类级别
  getAllPermissions() { ... }
}
```

### 5.6 性能优化：用户维度内存缓存

PermissionService 使用 Map 缓存每个用户的聚合权限（60 秒 TTL），避免每次请求都查数据库。由于用户可拥有多角色，缓存按 userId 而非 roleName 键入：

```typescript
interface CachedUserPermissions {
  permissions: Set<string>;  // 所有角色的权限并集
  roleNames: string[];       // 用户拥有的角色名列表
  cachedAt: number;
}

private cache = new Map<string, CachedUserPermissions>();
private readonly CACHE_TTL = 60_000; // 1 分钟

async getUserPermissions(userId: string): Promise<CachedUserPermissions> {
  const cached = this.cache.get(userId);
  if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
    return cached;
  }
  return this.loadUserPermissions(userId); // 从 DB 加载并缓存
}
```

管理员修改权限或角色后调用 `invalidateCache()` 清除所有缓存（因角色变更可能影响多个用户）。

### 5.7 管理员初始化策略

采用双保险方案，覆盖开发和生产环境：

| 场景 | 触发方式 | 实现位置 |
|------|---------|---------|
| 开发环境 | `npx tsx prisma/seed.ts` | `prisma/seed.ts` |
| 生产环境首次部署 | 设置 `ADMIN_EMAIL` + `ADMIN_PASSWORD` 环境变量后启动 | `PrismaService.onModuleInit` |
| 权限表为空 | 任何启动场景自动检测 | `PrismaService.seedRolesAndPermissionsIfEmpty()` |

**安全约束：**
- 不能修改自己的角色（防止管理员误操作失去权限）
- 不能降级最后一个 ADMIN（必须先提升另一个用户为 ADMIN）
- ADMIN_EMAIL 对应的用户如果已存在但无 ADMIN 角色，自动创建 UserRole 提升为 ADMIN
- 角色存储在 `roles` 表中，支持运行时动态创建/删除自定义角色（系统角色不可删除）

### 5.8 前端权限管理页面

路由：`/admin/permissions`

功能：以矩阵形式展示所有角色（含动态创建的自定义角色）对 14 个权限的分配状态，支持勾选/取消勾选后保存。按资源类型（文章/评论/标签/用户/角色/权限/管理后台）分组显示，修改未保存时高亮提示并提供重置按钮。ADMIN 角色的权限以只读样式展示（默认拥有全部权限）。

用户管理页面 (`/admin/users`) 支持多角色分配：以角色标签（tag）的形式展示每个用户的角色，点击标签切换角色，支持同时赋予多个角色。

角色管理页面 (`/admin/roles`) 支持自定义角色的创建和删除：系统角色（READER/AUTHOR/ADMIN）以卡片形式展示，不可删除；自定义角色以表格形式展示，支持删除（有用户时会弹出警告确认）。新创建的角色默认无权限，需在"权限管理"页面手动分配。

### 5.9 v6.0 系统闭环检查

Role 表重构完成后，通过前后端并行审计（8 类检查项）发现 4 个遗留问题，均已修复：

**问题 1：`getMe()` 缺少 roles 关联查询**

`auth.service.ts` 的 `getMe()` 方法在查询用户时未 include `roles` 关联，导致返回的用户对象不包含角色信息。前端 `hasRole()` / `getRoleNames()` 依赖 `user.roles` 数组，缺失将导致角色判断全部失效。

修复：添加 `include: { roles: { include: { role: true } } }`。

**问题 2：`register()` 返回用户缺少 roles**

注册流程在事务中创建用户并分配默认角色（UserRole），但 `tx.user.create()` 的返回值不包含后续创建的 roles 关联。前端收到的注册响应中 `roles` 为空数组，需刷新页面才能获取角色。

修复：在事务内创建 UserRole 后，用 `tx.user.findUnique({ include: { roles: ... } })` 重新查询完整用户返回。

**问题 3：`admin.service.ts` 修改角色后未清除权限缓存**

管理员通过 `updateUserRoles()` 修改用户角色后，`PermissionService` 中按 userId 缓存的旧权限列表未失效。被修改角色的用户在缓存过期前（默认 5 分钟）仍使用旧权限，可能导致越权或权限不足。

修复：`AdminService` 注入 `PermissionService`，在角色更新事务完成后调用 `invalidateCache(userId)` 主动清除该用户的权限缓存。

**问题 4：`AdminLayout.tsx` 缺少前端路由守卫**

管理后台布局组件未检查用户登录状态和 ADMIN 角色，任何已登录用户均可直接访问 `/admin/*` 路由。虽然后端有 `@RequirePermission` 守卫拦截 API 请求，但前端页面无防护，非管理员用户会看到加载失败的空白页面。

修复：`AdminLayout` 中添加双重检查——未登录重定向到 `/login`，非 ADMIN 角色重定向到 `/`。使用 `hasRole(user, 'ADMIN')` 进行角色判断。

**已知遗留项：** 无。`adminApi.createRole()` 和 `adminApi.deleteRole()` 已由角色管理页面 (`/admin/roles`) 消费。

### 5.10 v6.1 全量审计修复记录

v6.0 闭环检查完成后，对全系统进行第二轮深度审计，覆盖异常处理路径、数据一致性、通知链路、后台任务连通性、DTO 校验覆盖率和前端路由守卫。共发现 7 个问题（1 严重 / 3 高 / 2 中 / 1 低），全部在本轮修复闭环。

**问题 1：`PermissionService.deleteRole()` 抛普通 Error 导致 500（严重）**

`deleteRole()` 在检测到"系统角色不可删除"或"角色下仍有用户"时直接 `throw new Error(...)`。NestJS 的默认异常过滤器将未识别的 `Error` 映射为 500 Internal Server Error，前端收到的是通用错误而非语义化的 403/404，无法向用户展示有意义的提示。

修复：将 `throw new Error('系统角色不可删除')` 改为 `throw new ForbiddenException('系统角色不可删除')`，将 `throw new Error('角色下仍有用户')` 改为 `throw new NotFoundException(...)` 或 `ForbiddenException`。NestJS 全局 `AllExceptionFilter` 正确捕获后返回结构化 JSON 错误响应。

**问题 2：`AdminService.deleteArticle()` 硬删除不更新 tag articleCount（高）**

管理员通过后台删除文章时执行的是硬删除（`prisma.article.delete()`），但文章与标签的多对多关联表 `_ArticleToTag` 中的记录虽然被级联删除，`tags` 表中冗余的 `article_count` 字段并未同步递减。长期运行后标签的文章计数会持续偏高，前端"标签下文章数"显示失真。

修复：在删除事务中先查询该文章关联的所有 tag（`article.tags`），然后执行 `DELETE` 文章，最后通过 `UPDATE tags SET article_count = article_count - 1 WHERE id IN (...)` 批量递减相关标签的计数。整个操作包裹在 `prisma.$transaction()` 中保证原子性。

**问题 3：通知管道完全断裂，6 种 NotificationType 从未被触发（高）**

`NotificationService` 中定义了 `createNotification()` 方法，但该方法从未被任何业务 Service 调用。点赞、评论、回复、关注、发文等事件发生后均不产生通知记录，通知中心始终为空，`NotificationProcessor`（BullMQ Worker）虽然注册了队列但永远收不到任务。

修复：`NotificationService` 注入 BullMQ `notification` 队列，新增 `dispatch(type, recipientId, actorId, resourceId)` 方法，将通知创建任务通过 `queue.add()` 异步投递。`ArticleService`（点赞/发文）、`CommentService`（评论/回复/点赞）、`UserService`（关注）在对应事件发生后调用 `dispatch()`。`NotificationProcessor` 消费任务并写入数据库，通知链路全链路打通。

**问题 4：ViewCountProcessor 是死代码，Redis 缓冲无写入方（高）**

`ViewCountProcessor` 每 60 秒扫描 `view_buffer:*` 的 Redis key 并将缓冲计数刷写到数据库，但 `ArticleService.findBySlug()` 在用户访问文章时只做了 `SISMEMBER` 去重检查，从未执行 `INCR view_buffer:{articleId}`。结果 `view_buffer:*` key 永远不存在，阅读量始终为零，Processor 空转。

修复：`ArticleService.findBySlug()` 在去重检查通过后，增加 `redis.incr(\`view_buffer:${articleId}\`)` 写入 Redis 缓冲计数。`ViewCountProcessor` 每 60 秒遍历所有 `view_buffer:*` key，读取计数值，通过 `UPDATE articles SET view_count = view_count + {buffer} WHERE id = {articleId}` 刷写到数据库，然后 `DEL` 清除缓冲 key。阅读量统计链路全链路打通。

**问题 5：Admin Controller 3 个路由无 DTO 验证（中）**

`AdminController` 中的 `createRole()`、`updateRolePermissions()` 和 `createTag()` 三个端点直接接收 `@Body()` 而不经过 class-validator DTO 验证。非法输入（空 name、越界值、错误类型）直接到达 Service 层，可能产生 Prisma 运行时异常或写入脏数据。

修复：新增 `CreateRoleDto`（name 必填 1-50 字符、description 可选）、`UpdateRolePermissionsDto`（permissionIds 必填 UUID 数组）、`CreateTagDto`（name 必填 1-30 字符、slug 必填且符合 slug 格式）。三个端点方法签名改为 `@Body() dto: XxxDto`，配合全局 `ValidationPipe` 自动校验，非法请求在 Controller 入口即被拦截返回 400。

**问题 6：AuthLayout 未重定向已登录用户（中）**

`AuthLayout`（登录/注册页面的布局组件）不检查当前用户是否已登录。已登录用户手动访问 `/login` 或 `/register` 时看到登录表单，体验不佳且可能误操作重复注册。

修复：`AuthLayout` 组件中读取 `authStore` 的 `isAuthenticated` 状态，若已登录则通过 React Router `<Navigate to="/" replace />` 自动重定向到首页。

**问题 7：缺少 .env.example 模板文件（低）**

项目根目录和 `apps/api/` 目录均无 `.env.example` 模板文件。新开发者 clone 项目后不知道需要配置哪些环境变量，容易遗漏关键配置导致启动失败。

修复：在项目根目录创建 `.env.example`，覆盖全部环境变量：`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `DATABASE_URL` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `JWT_SECRET` / `JWT_EXPIRES_IN` / `JWT_REFRESH_SECRET` / `JWT_REFRESH_EXPIRES_IN` / `API_PORT` / `API_PREFIX` / `FRONTEND_URL` / `UPLOAD_DIR` / `MAX_FILE_SIZE` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `SMTP_HOST` / `SMTP_PORT`。每个变量附带注释说明用途和安全要求。

**已知遗留项：** 无。

---

## 六、并发控制模式

### 6.1 悲观锁（SELECT FOR UPDATE）

锁住行，其他事务等待。用于高频并发写同一行的场景。

**本项目应用：** 标签 articleCount 更新、点赞/关注 toggle 操作。

### 6.2 乐观锁（version 字段）

不锁行，冲突时返回 409。用于低频写、冲突概率小的场景。

**本项目应用：** 文章编辑（两个设备同时编辑同一篇文章）。

### 6.3 原子操作（SQL 递增/递减）

`SET count = count + 1`，避免读-改-写竞争。

**本项目应用：** 评论数、点赞数的实时更新。

### 6.4 缓冲写入（Redis 缓冲 + 定时刷写）

高频写先缓存，定时批量写入。

**本项目应用：** 阅读量统计（Redis SET 去重 + INCR 计数 → 每分钟批量 UPDATE）。

### 6.5 唯一约束兜底

数据库层面的最终一致性保障。

**本项目应用：** 注册邮箱唯一、点赞/收藏/关注的 `(userId, targetId)` 唯一。

---

## 七、后台任务系统（BullMQ）

### 7.1 队列定义

| 队列 | 用途 | 触发时机 | 并发数 |
|------|------|----------|--------|
| `notification` | 创建通知 | 点赞/评论/关注（已在 ArticleService/CommentService/UserService 中接入） | 5 |
| `email` | 发送邮件 | 注册/密码重置 | 3 |
| `view-count` | 阅读量刷写 | Repeat 每 60s | 1 |
| `search-index` | 更新 searchVector | 文章创建/更新 | 2 |

### 7.2 NestJS 集成模式

```typescript
// Producer — 在 Service 中添加任务
@Injectable()
export class ArticleService {
  constructor(@InjectQueue('notification') private queue: Queue) {}

  async likeArticle(articleId: string, userId: string) {
    // 主事务完成后，异步添加通知任务
    await this.queue.add('article-liked', { articleId, actorId: userId }, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
    });
  }
}

// Worker — 消费任务
@Processor('notification')
export class NotificationProcessor extends WorkerHost {
  async process(job: Job) {
    switch (job.name) {
      case 'article-liked': return this.handleArticleLiked(job.data);
      // ...
    }
  }
}
```

### 7.3 定时任务（Repeatable Jobs）

```typescript
// 阅读量定时刷写
await viewCountQueue.add('flush', {}, { repeat: { every: 60_000 } });
```

---

## 八、API 规范

### 8.1 设计原则

国内大厂（阿里/美团/字节）的通用实践：

1. **HTTP 状态码只表示传输层结果**——200（成功）、401（未认证，用于触发前端刷新令牌）、500（系统崩溃），不做业务细分
2. **业务语义由 `code` 字段承载**——数字编码，分段划分，前端按 code 判断逻辑分支
3. **成功统一 `code: 0`**——不使用 `1`、`true`、`"ok"` 等混乱约定
4. **错误信息对外脱敏**——前端展示友好中文提示，内部日志通过 `requestId` 关联完整 detail
5. **每个响应携带 `requestId`**——前端报错时把 requestId 反馈给后端，grep 日志即可定位全链路

### 8.2 统一响应格式

```jsonc
// ✅ 成功
{
  "code": 0,
  "message": "操作成功",
  "data": { "id": "uuid", "title": "..." },
  "requestId": "a1b2c3d4-..."
}

// ✅ 分页成功
{
  "code": 0,
  "message": "操作成功",
  "data": [ ... ],
  "meta": { "page": 1, "pageSize": 20, "total": 150, "totalPages": 8 },
  "requestId": "a1b2c3d4-..."
}

// ❌ 业务失败（HTTP 200，code ≠ 0）
{
  "code": 20010,
  "message": "邮箱或密码错误",
  "requestId": "a1b2c3d4-..."
}

// ❌ 参数校验失败（HTTP 200，code = 1001）
{
  "code": 1001,
  "message": "参数校验失败",
  "details": [
    { "field": "email", "message": "email must be an email" }
  ],
  "requestId": "a1b2c3d4-..."
}

// ❌ 系统异常（HTTP 500）
{
  "code": 1,
  "message": "服务异常，请稍后重试",
  "requestId": "a1b2c3d4-..."
}
```

> **关键区别：** 业务错误（如密码错误、资源不存在）HTTP 仍返回 200，前端通过 `code !== 0` 判断失败。只有基础设施级别的错误（未认证 401、系统崩溃 500）才使用 HTTP 状态码。

### 8.3 HTTP 状态码（仅传输层）

| 状态码 | 含义 | 场景 |
|--------|------|------|
| 200 | OK | 所有业务请求（成功和业务失败都返回 200） |
| 401 | Unauthorized | 未携带 Token 或 Token 已过期（触发前端自动刷新） |
| 500 | Internal Server Error | 未捕获异常、系统级故障 |

### 8.4 业务错误码编码规则

```
编码格式：[模块前缀 2 位][序号 3 位]

0          — 成功
1          — 未知错误（兜底）
1001~1099  — 通用（参数校验、限流、系统繁忙）
20001~20099 — 认证与令牌（Auth）
30001~30099 — 用户与资料（User/Profile）
40001~40099 — 文章（Article）
50001~50099 — 评论（Comment）
60001~60099 — 标签（Tag）
70001~70099 — 通知（Notification）
80001~80099 — 上传 / 文件（Upload）
81001~81099 — 搜索（Search）
90001~90099 — 管理后台（Admin）
99001~99099 — 系统内部（DB/Redis）
```

### 8.5 完整错误码表

#### 通用 / 系统级（1001~1099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 0 | `ErrSuccess` | 操作成功 | 成功 |
| 1 | `ErrUnknown` | 服务异常，请稍后重试 | 未知错误兜底 |
| 1001 | `ErrParamInvalid` | 参数校验失败 | DTO 校验不通过，附带 details |
| 1002 | `ErrParamMissing` | 缺少必要参数 | 必填参数缺失 |
| 1003 | `ErrMethodNotAllowed` | 请求方法不允许 | HTTP Method 不匹配 |
| 1004 | `ErrRateLimited` | 请求过于频繁，请稍后再试 | Throttler 限流 |
| 1005 | `ErrSystemBusy` | 系统繁忙，请稍后重试 | 服务降级 |
| 1006 | `ErrServiceUnavailable` | 服务暂不可用 | 依赖服务不可用 |
| 1010 | `ErrDataConflict` | 数据冲突 | 唯一约束冲突兜底 |

#### 认证与令牌（20001~20099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 20001 | `ErrNotAuthenticated` | 请先登录 | 未登录或令牌已过期（tokenVersion 不匹配时也返回此错误码） |
| 20010 | `ErrEmailOrPwdWrong` | 邮箱或密码错误 | 登录失败（不暴露哪个错） |
| 20011 | `ErrAccountBanned` | 账号已被封禁 | 被封禁用户尝试登录 |
| 20012 | `ErrTokenExpired` | 登录已过期，请重新登录 | accessToken 过期 |
| 20013 | `ErrTokenInvalid` | 登录状态无效 | Token 签名无效 |
| 20014 | `ErrTokenRevoked` | 登录已被撤销 | refreshToken 已从 Redis 删除 |
| 20015 | `ErrTokenReuse` | 检测到账号在其他设备登录 | Token 重用检测，仅撤销该设备会话 |
| 20020 | `ErrEmailRegistered` | 该邮箱已被注册 | 注册时邮箱重复 |
| 20021 | `ErrUsernameTaken` | 该用户名已被占用 | 注册时用户名重复 |
| 20030 | `ErrDeviceLimit` | 登录设备数量已达上限，请注销其他设备后重试 | 超过 MAX_DEVICES 限制 |
| 20031 | `ErrSessionNotFound` | 设备会话不存在 | 注销不存在的 deviceId |

#### 用户与资料（30001~30099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 30001 | `ErrUserNotFound` | 用户不存在 | 查询的用户 ID 不存在 |
| 30010 | `ErrCannotFollowSelf` | 不能关注自己 | 自己关注自己 |
| 30020 | `ErrPasswordWrong` | 当前密码不正确 | 修改密码时旧密码验证失败 |

#### 文章（40001~40099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 40001 | `ErrArticleNotFound` | 内容不存在 | 文章不存在或已删除 |
| 40002 | `ErrArticleNoPerm` | 没有操作权限 | 非作者/非管理员操作文章 |
| 40003 | `ErrArticleConflict` | 内容已被修改，请刷新后重试 | 乐观锁版本冲突 |
| 40004 | `ErrArticleNotPublished` | 内容未发布 | 草稿状态不可执行的操作 |

#### 评论（50001~50099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 50001 | `ErrCommentNotFound` | 评论不存在 | 评论已删除或不存在 |
| 50002 | `ErrCommentNoPerm` | 没有操作权限 | 非评论作者/非文章作者/非管理员 |
| 50003 | `ErrCommentParentWrong` | 回复的评论不存在 | 父评论不属于该文章 |

#### 标签（60001~60099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 60001 | `ErrTagNotFound` | 标签不存在 | 标签不存在 |
| 60002 | `ErrTagDuplicate` | 标签已存在 | 标签名重复 |

#### 通知（70001~70099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 70001 | `ErrNotificationNotFound` | 通知不存在 | 通知不存在 |
| 70002 | `ErrNotificationNoPerm` | 没有操作权限 | 操作他人通知 |

#### 上传 / 文件（80001~80099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 80001 | `ErrFileEmpty` | 请选择文件 | 未上传文件 |
| 80002 | `ErrFileTypeInvalid` | 不支持的文件类型 | MIME 类型不在白名单 |
| 80003 | `ErrFileTooLarge` | 文件超过大小限制 | 超过 MAX_FILE_SIZE |

#### 搜索（81001~81099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 81001 | `ErrSearchQueryEmpty` | 请输入搜索关键词 | 搜索关键词为空 |

#### 管理后台（90001~90099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 90001 | `ErrCannotModifySelf` | 不能修改自己的角色 | 管理员不能改自己角色 |
| 90002 | `ErrCannotBanSelf` | 不能封禁自己 | 管理员不能封禁自己 |
| 90003 | `ErrLastAdmin` | 不能移除最后一个管理员 | 防止系统无管理员 |
| 90004 | `ErrRoleNotFound` | 角色不存在 | 角色 ID 无效 |
| 90005 | `ErrCannotDeleteSysRole` | 不能删除系统内置角色 | 系统角色保护 |

#### 系统内部（99001~99099）

| 错误码 | 常量名 | 对外消息 | 说明 |
|--------|--------|---------|------|
| 99001 | `ErrDatabaseError` | 服务异常，请稍后重试 | 数据库异常（对外脱敏） |
| 99002 | `ErrRedisError` | 服务异常，请稍后重试 | 缓存异常（对外脱敏） |

### 8.6 requestId 机制

每个请求进入时由 `RequestIdMiddleware` 生成 UUID，同时写入响应头 `X-Request-Id`：

```typescript
// request-id.middleware.ts
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId = req.headers['x-request-id'] || randomUUID();
    req.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);
    next();
  }
}
```

**排查流程：**
1. 前端发现异常 → 从响应中取出 `requestId`
2. 告知用户 "请将此 ID 反馈给客服"
3. 后端用 `grep requestId 日志文件` 即可看到完整的内部 detail、堆栈、SQL 等

### 8.7 错误信息脱敏策略

| 层级 | 内容 | 对外暴露 | 内部日志 |
|------|------|---------|---------|
| BusinessException | `throw new BusinessException(ErrEmailRegistered)` | "该邮箱已被注册" | 同左 |
| BusinessException + detail | `throw new BusinessException(ErrArticleConflict, { detail: 'version 3→4' })` | "内容已被修改，请刷新后重试" | detail 写入日志 |
| Prisma P2002 | 唯一约束冲突 | "数据冲突" | 冲突字段名 |
| 未知异常 | `Error: ECONNREFUSED...` | "服务异常，请稍后重试" | 完整堆栈 |

**核心原则：前端永远只看到 `ERROR_MESSAGES` 表中预定义的中文消息，内部细节只进日志。**

### 8.8 Service 层使用示例

```typescript
// ❌ 旧写法 — 英文字符串错误码，信息直接暴露
throw new ConflictException('Email already registered');
throw new NotFoundException(`Article with id "${id}" not found`);

// ✅ 新写法 — 数字错误码 + 自动脱敏
throw new BusinessException(ErrEmailRegistered);
throw new BusinessException(ErrArticleNotFound);

// ✅ 带内部 detail（detail 只进日志，不返回前端）
throw new BusinessException(ErrArticleConflict, {
  detail: `乐观锁冲突: articleId=${id}, expected=${version}, actual=${current.version}`,
});

// ✅ 带自定义 HTTP 状态码（如需要触发前端 401 拦截器）
throw new BusinessException(ErrTokenExpired, { httpStatus: 401 });
```

### 8.9 前端错误处理

```typescript
import api, { getApiError, isErrorCode } from '@/lib/api';
import { ErrEmailRegistered, ErrTokenExpired } from '@/constants/error-codes';

try {
  await api.post('/auth/register', formData);
} catch (e) {
  const err = getApiError(e);
  if (err) {
    // 根据错误码做不同处理
    if (err.code === ErrEmailRegistered) {
      form.setError('email', { message: err.message });
    } else {
      toast.error(err.message);
    }
    // 需要排查时，可打印 requestId
    console.log('requestId:', err.requestId);
  }
}

// 也可以直接判断特定错误码
if (isErrorCode(e, ErrTokenExpired)) {
  // 跳转登录页
}
```

### 8.10 认证

请求头 `Authorization: Bearer <accessToken>`。

### 8.11 限流

默认每分钟 60 次请求，认证接口每分钟 10 次（ThrottlerModule）。

---

## 九、项目目录结构（实际实现）

> 以下目录结构反映的是实际编码完成后的状态。模块直接放在 `src/` 下，而非 `src/modules/` 下——这是 NestJS CLI `nest new` 生成后的默认约定，功能模块按业务领域平铺。

```
devpulse/
├── apps/
│   ├── api/                              # NestJS 后端（✅ 已完成）
│   │   ├── src/
│   │   │   ├── admin/                    # 管理后台（仪表盘/用户/文章/标签/角色/权限管理）
│   │   │   │   ├── dto/
│   │   │   │   │   ├── ban-user.dto.ts
│   │   │   │   │   ├── create-role.dto.ts
│   │   │   │   │   ├── update-role-permissions.dto.ts
│   │   │   │   │   └── update-user-role.dto.ts
│   │   │   │   ├── admin.controller.ts   # @RequirePermission('admin:access') 类级别
│   │   │   │   ├── admin.module.ts
│   │   │   │   └── admin.service.ts      # raw SQL 聚合统计 + 最后 ADMIN 保护
│   │   │   ├── article/                  # 文章系统
│   │   │   │   ├── dto/
│   │   │   │   │   ├── article-list-query.dto.ts
│   │   │   │   │   ├── create-article.dto.ts
│   │   │   │   │   └── update-article.dto.ts
│   │   │   │   ├── article.controller.ts # CRUD + like/bookmark toggle
│   │   │   │   ├── article.module.ts
│   │   │   │   └── article.service.ts    # 乐观锁编辑、原子计数、slug 生成
│   │   │   ├── auth/                     # 认证模块
│   │   │   │   ├── dto/
│   │   │   │   │   ├── login.dto.ts
│   │   │   │   │   ├── refresh.dto.ts
│   │   │   │   │   └── register.dto.ts
│   │   │   │   ├── auth.controller.ts
│   │   │   │   ├── auth.module.ts
│   │   │   │   ├── auth.service.ts       # JWT 双令牌、bcrypt、Redis 刷新令牌
│   │   │   │   └── jwt.strategy.ts       # Passport JWT 策略
│   │   │   ├── comment/                  # 评论系统（两级嵌套）
│   │   │   │   ├── dto/create-comment.dto.ts
│   │   │   │   ├── comment.controller.ts
│   │   │   │   ├── comment.module.ts
│   │   │   │   └── comment.service.ts    # 原子 commentCount、like toggle
│   │   │   ├── common/                   # 公共模块
│   │   │   │   ├── constants/
│   │   │   │   │   ├── error-codes.ts            # 业务错误码常量 + 脱敏消息映射表
│   │   │   │   │   └── permissions.ts            # 14 个权限常量 + 角色映射 + 描述
│   │   │   │   ├── decorators/
│   │   │   │   │   └── current-user.decorator.ts  # @CurrentUser() 参数装饰器
│   │   │   │   ├── exceptions/
│   │   │   │   │   └── business.exception.ts     # BusinessException 业务异常类
│   │   │   │   ├── filters/
│   │   │   │   │   └── all-exception.filter.ts    # 统一错误格式 + 脱敏 + requestId + Prisma 映射
│   │   │   │   ├── guards/
│   │   │   │   │   ├── jwt-auth.guard.ts          # 标准 Passport JWT 守卫
│   │   │   │   │   └── optional-auth.guard.ts     # 允许未认证请求通过
│   │   │   │   ├── interceptors/
│   │   │   │   │   └── transform.interceptor.ts   # 响应包装 { code: 0, data, meta?, requestId }
│   │   │   │   ├── middleware/
│   │   │   │   │   └── request-id.middleware.ts    # 请求 UUID 生成 + 响应头注入
│   │   │   │   └── permission/                    # RBAC 权限模块（@Global()）
│   │   │   │       ├── permission.module.ts       # 全局模块注册
│   │   │   │       ├── permission.service.ts      # 权限缓存 + CRUD + seed
│   │   │   │       ├── permissions.guard.ts       # CanActivate 守卫
│   │   │   │       └── require-permission.decorator.ts  # @RequirePermission()
│   │   │   ├── notification/             # 通知中心
│   │   │   │   ├── notification.controller.ts
│   │   │   │   ├── notification.module.ts
│   │   │   │   └── notification.service.ts  # dispatch() + 列表/已读/全部已读/未读计数
│   │   │   ├── prisma/                   # 数据库连接
│   │   │   │   ├── prisma.module.ts      # @Global() 全局模块
│   │   │   │   └── prisma.service.ts     # Driver Adapter + 权限 seed + ADMIN 初始化
│   │   │   ├── profile/                  # 个人中心
│   │   │   │   ├── dto/
│   │   │   │   │   ├── update-password.dto.ts
│   │   │   │   │   └── update-profile.dto.ts
│   │   │   │   ├── profile.controller.ts # 资料编辑/密码修改/收藏列表
│   │   │   │   ├── profile.module.ts
│   │   │   │   └── profile.service.ts
│   │   │   ├── queue/                    # BullMQ 后台任务
│   │   │   │   ├── notification.processor.ts  # 通知异步创建 Worker
│   │   │   │   ├── view-count.processor.ts    # 阅读量定时刷写 (60s)
│   │   │   │   └── queue.module.ts            # 注册 notification + view-count 队列
│   │   │   ├── search/                   # 全文搜索
│   │   │   │   ├── search.controller.ts  # /search?q=keyword + /search/suggest
│   │   │   │   ├── search.module.ts
│   │   │   │   └── search.service.ts     # tsvector/tsquery + ILIKE 建议
│   │   │   ├── tag/                      # 标签系统
│   │   │   │   ├── dto/
│   │   │   │   │   └── create-tag.dto.ts
│   │   │   │   ├── tag.controller.ts
│   │   │   │   ├── tag.module.ts
│   │   │   │   └── tag.service.ts        # 列表(按 articleCount 排序)/创建(ADMIN)
│   │   │   ├── upload/                   # 文件上传
│   │   │   │   ├── upload.controller.ts  # POST /upload/image
│   │   │   │   ├── upload.module.ts
│   │   │   │   └── upload.service.ts     # Sharp 压缩→webp (1920px, quality 80)
│   │   │   ├── user/                     # 用户公开信息
│   │   │   │   ├── user.controller.ts    # 个人资料/文章列表/关注/粉丝
│   │   │   │   ├── user.module.ts
│   │   │   │   └── user.service.ts       # raw SQL 统计、follow toggle
│   │   │   ├── generated/                # Prisma Client 输出（gitignore）
│   │   │   ├── app.module.ts             # 根模块（14 个 imports）
│   │   │   ├── app.controller.ts
│   │   │   ├── app.service.ts
│   │   │   └── main.ts                   # 入口：全局 Pipe/Filter/Interceptor
│   │   ├── prisma/
│   │   │   ├── schema.prisma             # 完整数据模型
│   │   │   ├── migrations/               # 数据库迁移文件
│   │   │   └── seed.ts                   # 种子数据（权限 + 4 用户 + 6 标签 + 4 文章 + 互动）
│   │   ├── uploads/                      # 上传文件目录（自动创建）
│   │   ├── prisma.config.ts              # Prisma v7 配置
│   │   ├── .env
│   │   ├── nest-cli.json
│   │   ├── tsconfig.json
│   │   └── package.json
│   │
│   └── web/                              # React 前端（✅ 已完成，对接真实 API）
│       ├── src/
│       │   ├── components/               # 通用组件
│       │   │   ├── ArticleCard.tsx
│       │   │   └── ui/                   # Button, Input, Avatar, TagBadge
│       │   ├── features/                 # 按业务划分的功能模块
│       │   │   ├── admin/                # AdminLayout + Dashboard/Users/Articles/Tags/Roles/Permissions
│       │   │   ├── article/              # HomePage + ArticleDetail + Editor + Tags
│       │   │   ├── auth/                 # Login + Register
│       │   │   ├── notification/         # NotificationsPage
│       │   │   ├── search/               # SearchPage
│       │   │   └── user/                 # UserProfile + Settings + Bookmarks
│       │   ├── layouts/                  # MainLayout (Outlet) + AuthLayout
│       │   ├── lib/
│       │   │   ├── api.ts                # axios 实例 + 401 自动刷新拦截器
│       │   │   ├── api-services.ts       # 统一 API 服务层（所有页面的数据请求）
│       │   │   └── utils.ts              # cn() 工具函数
│       │   ├── stores/
│       │   │   └── authStore.ts          # Zustand 认证状态
│       │   ├── types/
│       │   │   └── api.ts                # TypeScript 类型定义
│       │   ├── App.tsx                   # React Router 路由配置（20+ 路由）
│       │   ├── main.tsx
│       │   └── index.css                 # Tailwind + prose 排版 + Tiptap 样式
│       ├── vite.config.ts
│       ├── tsconfig.json
│       └── package.json
│
├── docker-compose.yml                    # PostgreSQL 16 + Redis 7（生产基线，不暴露 DB 端口）
├── docker-compose.dev.yml                # 开发覆盖层（暴露 5432/6379 端口给本地工具）
├── .env                                  # Docker Compose 环境变量（gitignore）
├── .env.example                          # 环境变量模板（含所有配置项）
├── DevPulse-PRD.md                       # 产品需求文档（含页面原型 + 权限矩阵）
├── DevPulse-API接口文档.md                # API 接口参考文档
├── DevPulse-开发手册.md                   # 本文档
├── pnpm-workspace.yaml
└── package.json                          # Monorepo 编排脚本
```

---

## 十、开发路线图

| 阶段 | 内容 | 状态 |
|------|------|------|
| ✅ 环境搭建 | Monorepo + Docker + Prisma v7 + NestJS 11 | 已完成 |
| ✅ 前端页面 | 20+ 页面组件 + 路由 + Tailwind 样式 | 已完成 |
| ✅ 后端公共层 | Guards / Decorators / Filters / Interceptors | 已完成 |
| ✅ 认证模块 | JWT 双令牌 + 多设备登录 + 会话管理 + 注册/登录/刷新/登出 + Passport | 已完成 |
| ✅ 功能模块 | Article/User/Profile/Tag/Comment/Notification/Search/Admin/Upload | 已完成 |
| ✅ 后台任务 | BullMQ 通知队列 + 阅读量定时刷写 | 已完成 |
| ✅ 种子数据 | 权限 + 4 用户 + 6 标签 + 4 文章 + 完整互动数据 | 已完成 |
| ✅ 前后端联调 | 13+ 页面对接真实 API（TanStack Query + api-services.ts） | 已完成 |
| ✅ UI Bug 修复 | 文章点击导航/通知红点/403 权限/双层嵌套/cursor 样式 | 已完成 |
| ✅ RBAC 权限 | 14 权限 + 角色-权限解耦 + PermissionsGuard + 权限管理页面 | 已完成 |
| ✅ 管理员初始化 | Seed 脚本 + PrismaService.onModuleInit 自动引导 | 已完成 |
| ✅ 系统闭环检查 | Controller 守卫/前后端 API/权限定义/死代码 全量审查 | 已完成 |
| ✅ Docker 生产化 | dev/prod 分离 + Redis 密码 + 端口隔离 + 环境变量外置 | 已完成 |
| ✅ Role 表重构 | enum→表 + UserRole 多对多 + 多角色支持 + 动态角色管理 | 已完成 |
| ✅ v6.0 闭环检查 | getMe/register 角色缺失 + 权限缓存失效 + Admin 路由守卫 | 已完成 |
| ✅ v6.1 全量审计 | 通知管道/浏览量缓冲/DTO验证/deleteRole异常/删文计数/AuthLayout | 已完成 |
| ✅ v6.2 复刻文档 | 完整 Schema/全局异常处理/Axios 拦截器/认证流程/权限常量/Seed 设计 | 已完成 |
| ✅ v6.3 错误码体系 | 统一业务错误码/RequestId 链路/响应脱敏/分段编码设计 | 已完成 |
| ✅ v6.4 前端文档 | 前端框架搭建与开发步骤（17 个子章节，覆盖架构/数据请求/表单/路由/页面清单） | 已完成 |
| ⬜ 搜索索引 | 补充 search_vector 迁移/种子数据 | 待开始 |
| ⬜ 部署 | Docker 生产构建 + 服务器部署 | 待开始 |

### 已验证的 API 端点（19 个核心场景全部通过）

1. `POST /api/v1/auth/login` — 登录返回 JWT 双令牌
2. `GET /api/v1/auth/me` — 获取当前用户信息
3. `GET /api/v1/articles` — 文章列表（分页 + 标签筛选）
4. `GET /api/v1/articles/:slug` — 文章详情（含点赞/收藏状态）
5. `POST /api/v1/articles` — 创建文章（READER/AUTHOR 均可，需 `article:create` 权限）
6. `PUT /api/v1/articles/:id` — 编辑文章（`:any`→`:own` 回退 + Service 归属验证）
7. `GET /api/v1/tags` — 标签列表（按 articleCount 排序）
8. `GET /api/v1/users/:id` — 用户资料 + 统计数据
9. `GET /api/v1/articles/:id/comments` — 评论列表（两级嵌套）
10. `GET /api/v1/notifications` — 通知列表 + 未读计数
11. `GET /api/v1/admin/dashboard` — 管理后台仪表盘统计
12. `GET /api/v1/profile/bookmarks` — 用户收藏列表
13. `POST /api/v1/articles/:id/like` — 点赞/取消点赞 toggle
14. `GET /api/v1/admin/permissions` — 获取所有权限列表
15. `GET /api/v1/admin/roles` — 获取所有角色列表（含用户计数）
16. `POST /api/v1/admin/roles` — 创建自定义角色
17. `DELETE /api/v1/admin/roles/:id` — 删除自定义角色
18. `GET /api/v1/admin/roles/permissions` — 获取角色-权限分配（READER:2, AUTHOR:5, ADMIN:14）
19. `PUT /api/v1/admin/roles/:roleId/permissions` — 更新角色权限分配（按 roleId）

### 前后端联调踩坑记录

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| HTTP 方法不匹配（6 处） | 前端 `api.patch()` 但后端用 `@Put()` | 统一为 `api.put()`（profile/article/notification） |
| 编辑器加载文章 404 | 后端无 `GET /articles/id/:id` 路由 | 新增 `findById()` 方法，放在 `:slug` 路由之前 |
| 通知 unreadCount 缺失 | 后端 meta 无此字段 | Service 层 `Promise.all` 新增第三条 count 查询 |
| 文章点击无跳转 | `ArticleCard` 用 `/articles/slug` 但路由是 `/article/:slug` | 修改 3 个文件中的路径 |
| 通知红点始终显示 | MainLayout 硬编码红点 | 改为 `useQuery` 轮询 unreadCount（30s）条件渲染 |
| 403 发文失败 | `@Roles('AUTHOR')` 阻止 READER | 改为 RBAC `@RequirePermission('article:create')` |
| 双层 DevPulse 嵌套 | 登录页内外双层 AuthLayout | 移除内层 AuthLayout 包裹 |
| tab 无 cursor-pointer | 排序按钮缺少样式类 | 添加 `cursor-pointer` class |

**HTTP 方法对照表（前后端一致）：**

| 操作 | HTTP 方法 | 后端装饰器 | 前端 api 调用 |
|------|----------|-----------|-------------|
| 更新资料/密码/文章 | PUT | `@Put()` | `api.put()` |
| 标记通知已读 | PUT | `@Put()` | `api.put()` |
| 修改用户角色 | PUT | `@Put('users/:id/roles')` | `api.put('/admin/users/:id/roles', { roleIds })` |
| 创建角色 | POST | `@Post('roles')` | `api.post('/admin/roles', { name, description })` |
| 封禁用户 | POST | `@Post()` | `api.post()` |
| 点赞/收藏/关注 toggle | POST | `@Post()` | `api.post()` |
| 删除角色/文章/标签 | DELETE | `@Delete()` | `api.delete()` |

**Prisma v7 + NestJS 兼容踩坑记录：**

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `expiresIn` 类型不兼容 | `@nestjs/jwt` 的 `JwtSignOptions` 期望 `StringValue \| number`，`process.env` 返回 `string` | 类型断言 `as any` |
| `@prisma/client/runtime/library` 找不到 | Prisma v7 改变了内部模块路径 | AllExceptionFilter 改用鸭子类型检测 `isPrismaError()` |
| Role 枚举类型不匹配 | Prisma 旧版 `Role` 枚举与 string 不兼容 | 已重构为 `Role` 表 + `UserRole` 关联表，彻底消除枚举 |
| `updateMany` 不支持关联操作 | Prisma 的 `updateMany` 不支持 `tags: { disconnect }` | 改用 raw SQL 操作关联表 |
| `@Processor` 不支持 repeat 选项 | NestJS BullMQ 装饰器限制 | 改用 `@InjectQueue` + `onModuleInit` 添加 repeatable job |
| `sharp` 不可调用 | ESM/CJS 导入方式差异 | `import sharp from 'sharp'`（非 `import * as`） |
| Comment ID 格式错误 | seed 中用字符串作 UUID 列的 ID | 改用标准 UUID 格式常量 |

**系统闭环检查修复记录（v5.0）：**

| 问题 | 风险 | 修复方案 |
|------|------|----------|
| `roles.guard.ts` / `roles.decorator.ts` 残留磁盘 | 死代码，新人可能误引用 | 移至回收站，全项目无引用 |
| `adminApi.createTag` 调用 `POST /admin/tags` | 后端无此路由（404），但无 UI 调用 | 从 `api-services.ts` 移除 |
| `adminApi.ban` 有后端无前端入口 | 封禁功能不完整 | UsersManagePage 添加封禁/解封按钮 + 原因输入 |
| Docker Compose 硬编码密码 | 泄露风险，无法覆盖端口 | `${VAR}` 从 `.env` 读取，`POSTGRES_PORT` 可覆盖 |
| Redis 无密码 | 内网渗透可读写全部数据 | `--requirepass` + NestJS 三处连接加 `password` |
| DB/Redis 端口生产环境暴露 | 公网扫描爆破风险 | 拆分 base + dev override，生产不映射端口 |
| 环境变量无兜底值 | 漏配 `.env` 启动崩溃 | 用户名/库名加 `:-default`，密码保持强制无默认 |
| 容器无资源限制 | 高并发吃满服务器内存 CPU | `deploy.resources.limits` 限额（PG:1G, Redis:512M） |

**系统闭环检查修复记录（v6.0）：**

| 问题 | 风险 | 修复方案 |
|------|------|----------|
| `auth.service.ts` getMe() 缺少 roles include | 前端角色判断全部失效 | 添加 `include: { roles: { include: { role: true } } }` |
| `auth.service.ts` register() 返回用户无 roles | 注册后需刷新才有角色 | 事务内 re-fetch 用户含 roles 关联 |
| `admin.service.ts` 改角色后未清权限缓存 | 被改用户 5 分钟内权限不准 | 注入 PermissionService，调 `invalidateCache(userId)` |
| `AdminLayout.tsx` 无路由守卫 | 非管理员可访问管理页面 | 添加 auth + ADMIN 角色检查，重定向非授权用户 |

**系统闭环检查修复记录（v6.1）：**

| # | 问题 | 严重程度 | 修复方案 |
|---|------|---------|---------|
| 1 | `PermissionService.deleteRole()` 抛普通 Error 导致 500 | 严重 | 改为 NotFoundException / ForbiddenException |
| 2 | `AdminService.deleteArticle()` 硬删除不更新 tag articleCount | 高 | 事务中先查关联 tag，再 DELETE + UPDATE articleCount |
| 3 | 通知管道完全断裂，6 种 NotificationType 从未被触发 | 高 | NotificationService 注入 BullMQ 队列，dispatch() 方法替代 createNotification()；ArticleService/CommentService/UserService 在 like/comment/follow 事件中调用 dispatch() |
| 4 | ViewCountProcessor 是死代码，Redis 缓冲无写入方 | 高 | ArticleService.findBySlug() 改用 Redis INCR 写入 `view_buffer:{articleId}`，由 ViewCountProcessor 每 60s 刷写到 DB |
| 5 | Admin Controller 3 个路由无 DTO 验证 | 中 | 新增 CreateRoleDto / UpdateRolePermissionsDto / CreateTagDto |
| 6 | AuthLayout 未重定向已登录用户 | 中 | 添加 isAuthenticated 检查 + Navigate 重定向 |
| 7 | 缺少 .env.example 模板文件 | 低 | 创建 .env.example 覆盖全部环境变量，含 ADMIN_EMAIL / ADMIN_PASSWORD |

**Role 表重构记录（v6.0）：**

| 变更项 | 旧实现 | 新实现 |
|--------|--------|--------|
| 角色存储 | Prisma `enum Role { READER AUTHOR ADMIN }` | `roles` 表 + `user_roles` 多对多关联表 |
| 用户角色关系 | `User.role` 单字段 | `User.roles UserRole[]` 多对多 |
| 角色数量 | 固定 3 个 | 支持动态创建自定义角色 |
| 权限关联 | `RolePermission.role` (枚举字段) | `RolePermission.roleId` (FK 指向 roles 表) |
| JWT payload | `{ sub, email, role }` | `{ sub, email, tokenVersion }` — 角色从 DB 实时加载，tokenVersion 用于主动吊销 |
| 权限缓存 | 按 role 名缓存 | 按 userId 缓存，聚合多角色权限 |
| 前端角色检查 | `user.role === 'ADMIN'` | `hasRole(user, 'ADMIN')` |
| READER 权限 | 5 项（与 AUTHOR 相同） | 2 项（仅 comment:create + comment:delete:own） |

---

## 十一、Docker 生产化配置

> 本章节记录从"能跑的开发环境"到"可安全部署的生产环境"所做的改造，覆盖安全检查、配置拆分和线上操作规范。

### 11.1 架构拆分：base + override

采用 Docker Compose 官方推荐的多文件覆盖模式，将配置拆分为两个文件：

| 文件 | 用途 | 端口 | Redis 密码 |
|------|------|------|-----------|
| `docker-compose.yml` | 生产基线 | 不暴露 DB/Redis | 强制 requirepass |
| `docker-compose.dev.yml` | 开发覆盖 | 映射 5432/6379 | 继承基线 |

```bash
# 开发
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 生产
docker compose up -d
```

> **为什么不用 `version: '3.8'`？** Docker Compose V2 已废弃 `version` 字段，保留会产生 warning。已移除。

### 11.2 环境变量外置

所有敏感配置通过 `${VAR}` 从 `.env` 文件读取，docker-compose.yml 中无硬编码密码：

| 变量 | 用途 | 默认值 | 兜底策略 |
|------|------|--------|----------|
| `POSTGRES_USER` | PG 用户名 | devpulse | `${VAR:-devpulse}` 有兜底 |
| `POSTGRES_PASSWORD` | PG 密码 | — | **无兜底，强制注入** |
| `POSTGRES_DB` | PG 数据库名 | devpulse | `${VAR:-devpulse}` 有兜底 |
| `POSTGRES_PORT` | PG 宿主机端口（可选覆盖） | 5432 | `${VAR:-5432}` 有兜底 |
| `REDIS_PASSWORD` | Redis 认证密码 | — | **无兜底，强制注入** |
| `REDIS_PORT` | Redis 宿主机端口 | 6379 | `${VAR:-6379}` 有兜底 |

> **密码无默认值的设计意图：** 用户名和库名给兜底默认值是为了本地开发容错（漏配 `.env` 不至于启动崩溃）。密码**绝对不能**给默认明文——如果忘了注入密码，宁可让容器启动失败，也不能用弱默认密码裸奔上线。

`.env` 已在 `.gitignore` 中，不会提交仓库。生产环境通过平台密钥管理器或系统环境变量注入。

### 11.3 Redis 密码认证

Redis 从裸奔改为 `--requirepass` 启动：

```yaml
redis:
  command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]
  healthcheck:
    test: ["CMD", "redis-cli", "-a", "${REDIS_PASSWORD}", "ping"]
```

NestJS 侧三处 Redis 连接统一加上密码参数（`undefined` 时向下兼容无密码环境）：

```typescript
new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || undefined,  // 有密码走认证
});
```

涉及文件：`auth.service.ts`（ioredis 直连）、`app.module.ts`（BullMQ 连接）、`view-count.processor.ts`（ioredis 直连）。

### 11.4 自定义网络 + 端口隔离

```yaml
networks:
  devpulse-net:
    driver: bridge
```

所有容器挂载 `devpulse-net`，容器间通过容器名通信（`postgres:5432`、`redis:6379`）。生产环境不映射 DB/Redis 端口到宿主机，防止公网扫描爆破。

### 11.5 容器资源限额

通过 `deploy.resources.limits` 限制每个容器的最大资源占用，防止单容器吃满服务器影响其他服务共存：

| 容器 | CPU 上限 | 内存上限 |
|------|---------|---------|
| PostgreSQL | 1.0 核 | 1 GB |
| Redis | 0.5 核 | 512 MB |

```yaml
deploy:
  resources:
    limits:
      cpus: '1.0'
      memory: 1G
```

> 限额是**上限**而非预留，容器实际按需使用。生产环境可根据服务器配置适当调大。

### 11.6 线上安全检查清单

| 检查项 | 状态 | 说明 |
|--------|------|------|
| 密码外置到 .env / 平台密钥 | ✅ | 无硬编码密码，密码变量无默认值 |
| 非敏感变量兜底 | ✅ | 用户名/库名/端口有 `:-default`，漏配不崩溃 |
| Redis 密码认证 | ✅ | `--requirepass` + NestJS `password` 参数 |
| DB/Redis 端口不暴露 | ✅ | 生产基线不配 `ports` |
| 自定义网络隔离 | ✅ | `devpulse-net` bridge 网络 |
| 容器资源限额 | ✅ | PG: 1CPU/1GB, Redis: 0.5CPU/512MB |
| 镜像固定大版本标签 | ✅ | `16-alpine` / `7-alpine`，禁用 `latest` |
| restart 策略 | ✅ | `unless-stopped`（崩溃自启，人工 stop 不自启） |
| 健康检查 | ✅ | PG `pg_isready` + Redis `redis-cli ping` |
| .env 不提交仓库 | ✅ | `.gitignore` 已包含 `.env` |

### 11.7 线上操作规范

```bash
# 生产启动（通过系统环境变量注入，不放置 .env 文件）
export POSTGRES_USER=devpulse
export POSTGRES_PASSWORD=<strong-password-12+chars>
export REDIS_PASSWORD=<strong-password-12+chars>
docker compose up -d

# 定期备份数据库
docker exec devpulse-db pg_dump -U ${POSTGRES_USER} ${POSTGRES_DB} > backup.sql

# 更新镜像补丁
docker compose pull && docker compose up -d

# 防火墙只放行 API 3000 端口，5432/6379 全部封禁外网访问
# 绝对不要执行 docker compose down -v（会删除数据卷）
```

---

## 十二、快速命令参考

```bash
# 日常开发
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d   # 启动数据库 + Redis（开发端口）
pnpm dev:api                  # 启动后端（热重载）
pnpm dev:web                  # 启动前端（热重载）

# 数据库
pnpm db:migrate               # 运行迁移（schema 变更后）
pnpm db:seed                  # 填充种子数据（npx tsx prisma/seed.ts）
pnpm db:studio                # Prisma Studio 可视化

# 构建
pnpm build:api                # 构建后端
pnpm build:web                # 构建前端

# 生产部署
docker compose up -d          # 生产启动（DB/Redis 端口不暴露）
docker exec devpulse-db pg_dump -U devpulse devpulse > backup.sql   # 数据库备份

# 其他
docker compose down           # 停止容器（保留数据卷）
docker compose down -v        # 停止并清除数据（⚠️ 慎用，会删除数据卷）
npx prisma migrate dev --name xxx  # 创建新迁移
npx prisma generate           # 重新生成 Prisma Client
```

---

## 十三、项目复刻关键代码

> 本章收录复刻项目所需的全部关键代码。前面章节中已展示的代码（如 main.ts、PrismaService、schema.prisma）不再重复，此处补充前文未完整展示的核心文件。

### 13.1 全局异常过滤器（AllExceptionFilter）

```typescript
// src/common/filters/all-exception.filter.ts
import {
  ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';

@Catch()
export class AllExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let code = 'INTERNAL_ERROR';
    let message = 'An unexpected error occurred';

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exResponse = exception.getResponse();
      if (typeof exResponse === 'string') {
        message = exResponse;
      } else if (typeof exResponse === 'object' && exResponse !== null) {
        const obj = exResponse as Record<string, any>;
        message = obj.message || message;
        code = obj.code || code;
        // class-validator 数组 → 结构化 details
        if (Array.isArray(message)) {
          const details = message.map((msg: string) => {
            const parts = msg.split(' ');
            return { field: parts[0] || '', message: msg };
          });
          response.status(status).json({
            error: { code: 'INVALID_INPUT', message: 'Validation failed', details },
          });
          return;
        }
      }
    }

    // Prisma P2002 唯一约束冲突 → 409
    if (this.isPrismaError(exception) && exception.code === 'P2002') {
      status = HttpStatus.CONFLICT;
      code = 'CONFLICT';
      const target = (exception.meta?.target as string[])?.join(', ') || 'field';
      message = `Duplicate value for: ${target}`;
    }

    // Prisma P2025 记录不存在 → 404
    if (this.isPrismaError(exception) && exception.code === 'P2025') {
      status = HttpStatus.NOT_FOUND;
      code = 'NOT_FOUND';
      message = 'Resource not found';
    }

    response.status(status).json({ error: { code, message } });
  }

  private isPrismaError(exception: unknown): exception is { code: string; meta?: Record<string, any> } {
    return (
      typeof exception === 'object' && exception !== null &&
      'code' in exception && typeof (exception as any).code === 'string' &&
      (exception as any).code?.startsWith('P')
    );
  }
}
```

### 13.2 响应包装拦截器（TransformInterceptor）

```typescript
// src/common/interceptors/transform.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

export interface TransformedResponse<T> {
  data: T;
  meta?: { page: number; pageSize: number; total: number; totalPages: number };
}

@Injectable()
export class TransformInterceptor<T>
  implements NestInterceptor<T, TransformedResponse<T>>
{
  intercept(_context: ExecutionContext, next: CallHandler): Observable<TransformedResponse<T>> {
    return next.handle().pipe(
      map((result) => {
        // 已包含 { data, meta } 的分页响应直接透传
        if (result && typeof result === 'object' && 'data' in result && 'meta' in result) {
          return result;
        }
        // 其他响应统一包装为 { data }
        return { data: result };
      }),
    );
  }
}
```

### 13.3 权限常量定义（permissions.ts）

```typescript
// src/common/constants/permissions.ts

// 系统角色定义
export const SYSTEM_ROLES = {
  ADMIN:  { name: 'ADMIN',  description: '系统管理员，拥有全部权限', isSystem: true },
  AUTHOR: { name: 'AUTHOR', description: '内容创作者，可发布和管理自己的文章', isSystem: true },
  READER: { name: 'READER', description: '读者，可评论和管理自己的内容', isSystem: true },
} as const;

// 14 个权限常量
export const PERMISSIONS = {
  ARTICLE_CREATE: 'article:create',
  ARTICLE_UPDATE_OWN: 'article:update:own',
  ARTICLE_UPDATE_ANY: 'article:update:any',
  ARTICLE_DELETE_OWN: 'article:delete:own',
  ARTICLE_DELETE_ANY: 'article:delete:any',
  COMMENT_CREATE: 'comment:create',
  COMMENT_DELETE_OWN: 'comment:delete:own',
  COMMENT_DELETE_ANY: 'comment:delete:any',
  TAG_MANAGE: 'tag:manage',
  USER_MANAGE: 'user:manage',
  USER_BAN: 'user:ban',
  ROLE_MANAGE: 'role:manage',
  PERMISSION_MANAGE: 'permission:manage',
  ADMIN_ACCESS: 'admin:access',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

// 默认角色→权限映射（用于 seed）
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  READER: [PERMISSIONS.COMMENT_CREATE, PERMISSIONS.COMMENT_DELETE_OWN],
  AUTHOR: [
    PERMISSIONS.ARTICLE_CREATE, PERMISSIONS.ARTICLE_UPDATE_OWN,
    PERMISSIONS.ARTICLE_DELETE_OWN, PERMISSIONS.COMMENT_CREATE,
    PERMISSIONS.COMMENT_DELETE_OWN,
  ],
  ADMIN: ALL_PERMISSIONS,
};

// 权限中文描述（seed + 管理 UI 展示）
export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'article:create': '发布文章', 'article:update:own': '编辑自己的文章',
  'article:update:any': '编辑任意文章', 'article:delete:own': '删除自己的文章',
  'article:delete:any': '删除任意文章', 'comment:create': '发表评论',
  'comment:delete:own': '删除自己的评论', 'comment:delete:any': '删除任意评论',
  'tag:manage': '管理标签（创建/编辑/删除）', 'user:manage': '管理用户（修改角色等）',
  'user:ban': '封禁/解封用户', 'role:manage': '管理角色',
  'permission:manage': '管理权限分配', 'admin:access': '访问管理后台',
};
```

### 13.4 RBAC 守卫与装饰器

```typescript
// src/common/permission/permissions.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './require-permission.decorator';
import { PermissionService } from './permission.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector, private permissionService: PermissionService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY, [context.getHandler(), context.getClass()],
    );
    if (!requiredPermissions || requiredPermissions.length === 0) return true;

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    if (!user) throw new ForbiddenException('Authentication required');

    const userId: string = user.id ?? user.sub;
    const { permissions, roleNames } = await this.permissionService.getUserPermissions(userId);

    // ADMIN 超级用户绕过
    if (roleNames.includes('ADMIN')) return true;

    for (const permission of requiredPermissions) {
      if (permissions.has(permission)) return true;
      // :any → :own 回退（Service 层做最终归属验证）
      if (permission.endsWith(':any')) {
        const ownPermission = permission.replace(':any', ':own');
        if (permissions.has(ownPermission)) return true;
      }
    }
    throw new ForbiddenException(`Missing required permission: ${requiredPermissions.join(', ')}`);
  }
}
```

```typescript
// src/common/permission/require-permission.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const PERMISSIONS_KEY = 'permissions';
export const RequirePermission = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions);
```

```typescript
// src/common/permission/permission.module.ts
import { Global, Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './permissions.guard';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PermissionService, PermissionsGuard],
  exports: [PermissionService, PermissionsGuard],
})
export class PermissionModule {}
```

### 13.5 认证守卫

```typescript
// src/common/guards/jwt-auth.guard.ts
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
```

```typescript
// src/common/guards/optional-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

@Injectable()
export class OptionalAuthGuard extends AuthGuard('jwt') {
  handleRequest<TUser = any>(_err: any, user: TUser): TUser {
    return user; // 不抛异常，未认证时 user 为 undefined
  }
  canActivate(context: ExecutionContext) {
    return super.canActivate(context);
  }
}
```

```typescript
// src/common/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common';

export const CurrentUser = createParamDecorator(
  (data: string | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest();
    return data ? request.user?.[data] : request.user;
  },
);
```

### 13.6 认证模块（JWT 双令牌完整流程）

```typescript
// src/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({}),  // 空配置，secret/expiresIn 在 Service 中动态传入
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService, JwtModule],
})
export class AuthModule {}
```

```typescript
// src/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

export interface JwtPayload { sub: string; email: string; tokenVersion: number; }

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'change-me-to-a-random-secret-in-production',
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, email: true, username: true, displayName: true,
        avatar: true, bio: true, isBanned: true, tokenVersion: true,
        createdAt: true, updatedAt: true,
      },
    });
    if (!user) throw new UnauthorizedException('User not found');
    if (user.isBanned) throw new UnauthorizedException('Account has been banned');
    // tokenVersion 校验：令牌中携带的版本号必须与数据库当前值一致，否则视为已吊销
    if (payload.tokenVersion !== user.tokenVersion) {
      throw new UnauthorizedException('Token has been invalidated');
    }
    return user;
  }
}
```

**JWT 令牌流程要点：**

| 令牌 | Payload | Secret | 有效期 | 存储 |
|------|---------|--------|--------|------|
| accessToken | `{ sub: userId, email, tokenVersion }` | `JWT_SECRET` | 15min | 前端 sessionStorage |
| refreshToken | `{ sub: userId, deviceId: uuid }` | `JWT_REFRESH_SECRET` | 7d | 前端 sessionStorage + HttpOnly Cookie 双通道；后端 Redis `rt:{userId}:{deviceId}` HASH (bcrypt hash + 设备元数据, TTL 7d) |

刷新流程（Cookie 优先、body 兜底）：前端 401 → Axios 拦截器自动调 `POST /auth/refresh`（`withCredentials: true`，浏览器自动携带 HttpOnly Cookie；同时 body 中附带 sessionStorage 的 refreshToken 作为兜底）→ 后端读取策略 `req.cookies?.refresh_token || dto.refreshToken` → 从 refreshToken 提取 `deviceId` → 查找 Redis `rt:{userId}:{deviceId}` → 验证 bcrypt 哈希 → 颁发新双令牌（新 `deviceId`）+ 同时 Set-Cookie 写入新 HttpOnly Cookie → 删除旧设备会话 → 写入新设备会话。Token 重用检测：如果哈希不匹配，仅撤销该设备，不影响其他设备的正常会话。

会话管理：`GET /auth/sessions` 列出所有活跃设备（通过 `rt:{userId}:_devices` SET 遍历），`DELETE /auth/sessions/:deviceId` 注销指定设备，`POST /auth/logout` 不传 `deviceId` 则批量注销所有设备。单用户最多 10 个并发设备（`MAX_DEVICES`），超限自动淘汰最早登录的设备。

**tokenVersion 主动吊销机制：**

JWT 是无状态的，签发后在有效期内天然无法主动撤销。传统方案只能通过黑名单（Redis 存储已撤销 token）或封禁检查（每次请求查 DB）来弥补，但黑名单增加存储开销，封禁检查只能处理"账号被封"这一种场景。本项目引入 `tokenVersion` 字段，以极低成本解决了"AccessToken 签发后无法主动吊销"的缺陷：

- **工作原理**：User 模型新增 `tokenVersion Int @default(0)` 字段，AccessToken 签发时将当前 `tokenVersion` 写入 payload（`{ sub, email, tokenVersion }`）。JwtStrategy 的 `validate()` 方法在每次认证请求时比对 `payload.tokenVersion === user.tokenVersion`，不一致则拒绝认证。
- **触发时机**：安全事件发生时递增 DB 中的 `tokenVersion`（如修改密码、全部下线），所有已签发的 AccessToken 因为嵌入的旧版本号与 DB 不匹配，立即失效。
- **覆盖场景**：
  - **修改密码**：ProfileService.updatePassword 完成后调用 AuthService.logoutAll()，logoutAll 在清除所有 Redis 会话的同时递增 tokenVersion，双重保障。
  - **全部下线（logout-all）**：除了删除 Redis 中所有设备会话外，还递增 tokenVersion，确保即使用户本地还持有未过期的 AccessToken 也无法继续使用。
  - **管理员封禁**：封禁时同样递增 tokenVersion，被封用户的 AccessToken 立即失效（无需等待 15 分钟过期）。
- **性能影响**：仅在 `validate()` 中多一次字段比对（`tokenVersion` 已随 `findUnique` 查出，无额外 DB 查询），对性能零影响。
- **错误处理**：tokenVersion 不匹配时 JwtStrategy 返回 `UnauthorizedException`，前端收到 401 后触发 refreshToken 刷新流程。如果 refreshToken 也已被撤销（Redis 会话不存在），则返回 `ErrTokenRevoked`，前端跳转登录页。

### 13.7 前端 Axios 拦截器（api.ts）

```typescript
// apps/web/src/lib/api.ts
import axios from 'axios';
import type { ApiError } from '@/types/api';

const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

// 请求拦截：自动附加 accessToken
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// 响应拦截：401 自动刷新令牌
let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: unknown) {
  pendingQueue.forEach((p) => (error ? p.reject(error) : p.resolve(undefined)));
  pendingQueue = [];
}

api.interceptors.response.use(
  (res) => res,
  async (error) => {
    const original = error.config;
    if (error.response?.status !== 401 || original._retry) return Promise.reject(error);

    if (isRefreshing) {
      return new Promise((resolve, reject) => {
        pendingQueue.push({ resolve, reject });
      }).then(() => api(original));
    }

    original._retry = true;
    isRefreshing = true;
    const refreshToken = sessionStorage.getItem('refreshToken');
    if (!refreshToken) { clearAuth(); return Promise.reject(error); }

    try {
      const { data } = await axios.post('/api/v1/auth/refresh', { refreshToken });
      sessionStorage.setItem('accessToken', data.data.accessToken);
      sessionStorage.setItem('refreshToken', data.data.refreshToken);
      processQueue(null);
      return api(original);
    } catch (refreshError) {
      processQueue(refreshError);
      clearAuth();
      return Promise.reject(refreshError);
    } finally {
      isRefreshing = false;
    }
  },
);

function clearAuth() {
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  window.location.href = '/login';
}

export function getApiError(error: unknown): ApiError['error'] | null {
  if (axios.isAxiosError(error) && error.response?.data?.error) {
    return error.response.data.error as ApiError['error'];
  }
  return null;
}

export default api;
```

> **设计要点：** 并发请求同时 401 时，只有第一个请求触发 refresh，其余请求排入 `pendingQueue` 等待。refresh 请求配置 `withCredentials: true`，浏览器自动携带 HttpOnly Cookie 中的 refreshToken（Cookie 优先）；拦截器同时从 sessionStorage 读取 refreshToken 放入 body 作为兜底（兼容 Cookie 未设置的场景，如 APP 客户端或 Cookie 被禁用的浏览器）。refresh 成功后自动重发所有排队请求。refresh 失败则 `clearAuth()` 清除令牌并跳转登录页。

### 13.8 前端路由守卫

```typescript
// apps/web/src/components/ProtectedRoute.tsx
import { Navigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '@/stores/authStore';

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}
```

使用方式（App.tsx 中包裹需要登录的路由）：

```tsx
<Route path="editor" element={<ProtectedRoute><ArticleEditorPage /></ProtectedRoute>} />
<Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
<Route path="bookmarks" element={<ProtectedRoute><BookmarksPage /></ProtectedRoute>} />
<Route path="notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
```

### 13.9 种子数据设计（seed.ts 摘要）

种子数据采用**全量 upsert + 固定 UUID** 确保幂等性，重复执行不会创建重复数据。

**创建顺序（有依赖关系）：**

1. **角色**（3 个系统角色：ADMIN/AUTHOR/READER） — upsert by `name`
2. **权限**（14 个权限记录） — upsert by `resource_action` 复合键
3. **角色-权限映射** — delete + createMany（先清后建）
4. **用户**（4 个） — upsert by `email`
   - `admin@devpulse.com / Admin123!` → ADMIN 角色
   - `author@devpulse.com / Author123!` → AUTHOR 角色
   - `dbexpert@devpulse.com / Author123!` → AUTHOR 角色
   - `reader@devpulse.com / Reader123!` → READER 角色
5. **标签**（6 个：React/NestJS/TypeScript/PostgreSQL/Redis/Docker） — upsert by `name`
6. **文章**（4 篇，状态 PUBLISHED） — upsert by `slug`，关联标签
7. **标签计数更新** — 遍历每个标签统计关联文章数
8. **互动数据** — Like/Bookmark/Follow/Comment/Notification，均 upsert

**固定 UUID 常量（用于 Comment 和 Notification 的幂等 upsert）：**

```typescript
const COMMENT_1_ID = 'a1111111-1111-1111-1111-111111111111';
const COMMENT_2_ID = 'a2222222-2222-2222-2222-222222222222';
const NOTIF_1_ID = 'b1111111-1111-1111-1111-111111111111';
const NOTIF_2_ID = 'b2222222-2222-2222-2222-222222222222';
```

### 13.10 环境变量总表

| 变量名 | 读取方 | 用途 | 开发默认值 | 生产要求 |
|--------|--------|------|-----------|---------|
| `POSTGRES_USER` | Docker Compose | PG 用户名 | `devpulse` | 可保持 |
| `POSTGRES_PASSWORD` | Docker Compose + NestJS | PG 密码 | `devpulse123` | **强密码** |
| `POSTGRES_DB` | Docker Compose | PG 数据库名 | `devpulse` | 可保持 |
| `DATABASE_URL` | NestJS (PrismaService) | PG 连接串 | `postgresql://devpulse:devpulse123@localhost:5432/devpulse` | 使用生产凭证 |
| `REDIS_HOST` | NestJS (BullMQ + ioredis) | Redis 主机 | `localhost` | 容器名或 IP |
| `REDIS_PORT` | NestJS | Redis 端口 | `6379` | 可保持 |
| `REDIS_PASSWORD` | Docker Compose + NestJS | Redis 认证密码 | `devpulse_redis` | **强密码** |
| `JWT_SECRET` | NestJS (JwtStrategy + AuthService) | accessToken 签名 | `change-me-...` | **随机 64+ 字符** |
| `JWT_EXPIRES_IN` | NestJS | accessToken 有效期 | `15m` | 可保持 |
| `JWT_REFRESH_SECRET` | NestJS | refreshToken 签名 | `change-me-refresh-...` | **随机 64+ 字符** |
| `JWT_REFRESH_EXPIRES_IN` | NestJS | refreshToken 有效期 | `7d` | 可保持 |
| `API_PORT` | NestJS | 后端监听端口 | `3000` | 可保持 |
| `API_PREFIX` | NestJS | URL 前缀 | `api/v1` | 可保持 |
| `FRONTEND_URL` | NestJS (CORS) | 前端地址 | `http://localhost:5173` | 生产域名 |
| `UPLOAD_DIR` | NestJS | 上传目录 | `./uploads` | 可保持 |
| `MAX_FILE_SIZE` | NestJS | 上传大小限制(bytes) | `2097152` (2MB) | 可保持 |
| `ADMIN_EMAIL` | PrismaService | 初始管理员邮箱 | `admin@devpulse.com` | 生产邮箱 |
| `ADMIN_PASSWORD` | PrismaService | 初始管理员密码 | `Admin123!` | **强密码** |
| `SMTP_HOST` | NestJS (可选) | 邮件服务地址 | `localhost` | 邮件服务商 |
| `SMTP_PORT` | NestJS (可选) | 邮件服务端口 | `1025` | 邮件服务商 |

> **两个 .env 文件的职责分工：** 根目录 `.env` 供 Docker Compose 读取（POSTGRES_*、REDIS_*），`apps/api/.env` 供 NestJS 读取（DATABASE_URL、JWT_*、API_* 等）。两者可包含相同的 REDIS/DB 变量，NestJS 主要通过 `apps/api/.env` 获取配置。

---

## 十四、前端框架搭建与开发步骤

> 本项目的学习侧重在后端，前端以"够用、清晰、能快速搭建"为原则。本章记录从零搭建前端到完成全部页面的完整过程，帮助复刻时快速还原。

### 14.1 技术选型与架构思路

**核心选型：**

| 层面 | 选型 | 选型理由 |
|------|------|----------|
| 框架 | React 19 + TypeScript | 生态最成熟，类型推导好 |
| 构建 | Vite 8 | 启动极快，HMR 毫秒级，配置简单 |
| 样式 | Tailwind CSS 4 | 原子化 CSS，不用写 CSS 文件，开发效率高 |
| 路由 | React Router 7 | 单页应用标准路由方案 |
| 数据请求 | TanStack Query 5 | 自动缓存、重试、后台刷新，替代手动 useEffect |
| 状态管理 | Zustand 5 | 轻量（< 1KB），API 简洁，只用来管认证状态 |
| 富文本 | Tiptap 3 | 基于 ProseMirror，React 友好，扩展性好 |
| 表单 | React Hook Form + Zod | 性能优秀（非受控组件），Zod 提供 schema 校验 |
| 图标 | lucide-react | Tree-shakable，体积小，风格统一 |
| HTTP | axios | 拦截器机制成熟，401 自动刷新令牌 |
| 工具 | clsx + tailwind-merge | 条件拼接 className，避免样式冲突 |

**架构原则：**

前端采用 **feature-based** 目录结构（按业务领域划分），而非按技术类型（controllers/hooks/services）划分。每个 feature 目录包含该功能的所有页面组件，通用组件和基础设施放在公共目录。

```
src/
├── components/          # 跨 feature 复用的通用组件
│   ├── ui/              # 基础 UI 原子组件（Button/Input/Avatar/TagBadge）
│   ├── ArticleCard.tsx   # 文章卡片（首页、列表页复用）
│   └── ProtectedRoute.tsx # 路由守卫
├── features/            # 按业务划分的功能模块（每个 feature 一个目录）
│   ├── auth/            # 登录 + 注册
│   ├── article/         # 首页 + 文章详情 + 编辑器 + 标签页
│   ├── user/            # 个人主页 + 设置 + 收藏
│   ├── notification/    # 通知中心
│   ├── search/          # 搜索页
│   └── admin/           # 管理后台（AdminLayout + 6 个管理页面）
├── layouts/             # 布局组件（MainLayout/AuthLayout）
├── lib/                 # 基础设施（axios 实例、API 服务层、工具函数）
├── stores/              # Zustand 全局状态（只有认证状态）
├── types/               # TypeScript 类型定义
├── App.tsx              # 路由配置（入口）
├── main.tsx             # React 挂载点
└── index.css            # 全局样式（Tailwind + prose 排版 + Tiptap）
```

> **为什么不用 Redux/RTK？** 项目只有认证状态需要全局共享（user、token），Zustand 35 行代码就搞定了。引入 Redux 会大幅增加样板代码量，对学习项目来说是不必要的复杂度。

### 14.2 项目初始化

```bash
cd apps

# 用 Vite CLI 生成 React + TypeScript 模板
pnpm create vite web -- --template react-ts
cd web
pnpm install

# 安装项目依赖
pnpm add react react-dom react-router-dom \
  @tanstack/react-query zustand axios \
  @tiptap/react @tiptap/starter-kit @tiptap/extension-image @tiptap/extension-placeholder \
  react-hook-form @hookform/resolvers zod \
  tailwindcss @tailwindcss/vite lucide-react clsx tailwind-merge

pnpm add -D @types/react @types/react-dom @vitejs/plugin-react
```

### 14.3 Vite 配置（代理 + Tailwind + 路径别名）

```typescript
// vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: { alias: { '@': path.resolve(__dirname, './src') } },
  server: {
    port: 5173,
    proxy: { '/api': { target: 'http://localhost:3000', changeOrigin: true } },
  },
});
```

**三个关键配置：**

- `@vitejs/plugin-react`：React Fast Refresh（HMR 不丢失组件状态）
- `@tailwindcss/vite`：Tailwind 4 的 Vite 插件（不需要 postcss 配置）
- `resolve.alias`：`@/` 映射到 `src/`，import 路径更清晰（`@/lib/api` 而非 `../../lib/api`）
- `server.proxy`：开发环境把 `/api` 请求代理到 NestJS `:3000`，避免 CORS 问题

TypeScript 路径别名必须和 Vite 保持一致：

```json
// tsconfig.json
{
  "compilerOptions": {
    "paths": { "@/*": ["./src/*"] },
    "jsx": "react-jsx",
    "moduleResolution": "bundler",
    "noEmit": true
  },
  "include": ["src"]
}
```

### 14.4 类型定义（types/api.ts）

所有与后端交互的数据结构都在这一个文件中定义，作为前后端的"契约"：

```typescript
// types/api.ts — 核心类型（摘选）

// 统一响应格式
export interface ApiResponse<T> {
  code: number;          // 0 = 成功，非 0 = 业务错误码
  message: string;
  data: T;
  meta?: PaginationMeta;
  requestId?: string;
}

export interface ApiError {
  code: number;
  message: string;
  details?: Array<{ field: string; message: string }>;
  requestId?: string;
}

// 用户模型（与后端 User entity 对齐）
export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
  roles: UserRoleItem[];  // 多角色
  isBanned: boolean;
  createdAt: string;
  updatedAt: string;
}

// 角色检查辅助函数（直接放在类型文件中，全局可用）
export function hasRole(user: { roles: UserRoleItem[] }, roleName: string): boolean {
  return user.roles.some((ur) => ur.role.name === roleName);
}
```

> **设计原则：** 类型文件只做"形状定义"（interface/type），不包含业务逻辑。`hasRole()` 和 `getRoleNames()` 是纯函数辅助工具，因为被多处引用所以放在类型文件中方便导入。完整的类型定义约 340 行，覆盖 User、Article、Comment、Tag、Notification、Search、Admin 全部数据结构。

### 14.5 HTTP 客户端（lib/api.ts）

这是前端与后端通信的唯一出口，包含三个核心功能：

**1. axios 实例 + 请求拦截（自动附加 Token）：**

```typescript
const api = axios.create({
  baseURL: '/api/v1',
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('accessToken');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});
```

**2. 响应拦截（业务错误检测 + 401 自动刷新令牌）：**

HTTP 200 的响应会先检查 `code !== 0`（业务错误），转为 rejected promise。HTTP 401 的响应触发令牌自动刷新流程——并发请求中只有第一个触发 refresh，其余请求排入 `pendingQueue` 等待：

```typescript
api.interceptors.response.use(
  (res) => {
    const body = res.data as ApiResponse<unknown>;
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject({ ...res, data: body, isBusinessError: true });
    }
    return res;
  },
  async (error) => {
    // 401 → 自动刷新令牌（并发安全：只触发一次 refresh）
    // refresh 成功 → 重发原始请求 + 清空 pendingQueue
    // refresh 失败 → clearAuth() 跳转登录页
  },
);
```

**3. 错误提取工具函数：**

```typescript
// 从 catch 中提取标准化的 ApiError
export function getApiError(error: unknown): ApiError | null { ... }

// 判断是否是特定错误码
export function isErrorCode(error: unknown, code: number): boolean { ... }
```

### 14.6 API 服务层（lib/api-services.ts）

所有页面的数据请求统一收在这个文件中，按业务域组织为多个 API 对象。页面组件不直接调用 `api.get/post`，而是通过 `api-services` 间接调用，好处是类型安全、接口集中管理、方便全局搜索。

```typescript
// api-services.ts — 按业务域组织的 API 调用层

export const authApi = {
  getMe: () => api.get<ApiResponse<User>>('/auth/me').then((r) => r.data.data),
  logout: () => api.post('/auth/logout'),
};

export const articleApi = {
  list: (params?: ArticleListParams) =>
    api.get<{ data: ArticleListItem[]; meta: PaginationMeta }>('/articles', { params })
      .then((r) => r.data),
  getBySlug: (slug: string) =>
    api.get<ApiResponse<ArticleDetail>>(`/articles/${slug}`).then((r) => r.data.data),
  create: (data: CreateArticleRequest) =>
    api.post<ApiResponse<ArticleDetail>>('/articles', data).then((r) => r.data.data),
  update: (id: string, data: UpdateArticleRequest) =>
    api.put<ApiResponse<ArticleDetail>>(`/articles/${id}`, data).then((r) => r.data.data),
  toggleLike: (id: string) =>
    api.post<ApiResponse<ToggleResponse>>(`/articles/${id}/like`).then((r) => r.data.data),
  toggleBookmark: (id: string) =>
    api.post<ApiResponse<BookmarkToggleResponse>>(`/articles/${id}/bookmark`).then((r) => r.data.data),
};

export const commentApi = { /* list / create / remove / toggleLike */ };
export const notificationApi = { /* list / markRead / markAllRead / unreadCount */ };
export const searchApi = { /* search / suggest */ };
export const adminApi = { /* dashboard / listUsers / updateRoles / ban / ... */ };
```

> **`.then((r) => r.data.data)` 的双重解包：** axios 响应第一层 `.data` 是 HTTP body（`{ code, message, data }`），第二层 `.data` 是 ApiResponse 中的实际数据。这个模式在所有 API 调用中统一使用。

### 14.7 全局状态管理（stores/authStore.ts）

项目只有一个全局状态需要跨组件共享：认证状态。用 Zustand 实现，35 行代码：

```typescript
export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: !!sessionStorage.getItem('accessToken'),

  login: (user, accessToken, refreshToken) => {
    sessionStorage.setItem('accessToken', accessToken);
    sessionStorage.setItem('refreshToken', refreshToken);
    set({ user, isAuthenticated: true });
  },

  logout: () => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    set({ user: null, isAuthenticated: false });
  },

  updateUser: (updates) =>
    set((state) => ({
      user: state.user ? { ...state.user, ...updates } : null,
    })),
}));
```

**Token 存储选择 `sessionStorage` 而非 `localStorage`：** 关闭浏览器标签页后 token 自动清除，安全性更好。代价是每次打开新标签页需要通过 `authApi.getMe()` 重新获取用户信息（但 token 如果在有效期内，刷新机制会自动恢复会话）。

**退出登录流程（多设备适配 + HttpOnly Cookie 清除）：** MainLayout 的 `handleLogout` 在清除本地 token 之前，先调用 `authApi.logout()` 通知后端注销当前设备——请求体中携带 refreshToken，同时浏览器自动附带 HttpOnly Cookie 中的 refreshToken。后端采用"Cookie 优先、body 兜底"策略（`req.cookies?.refresh_token || dto.refreshToken`）读取令牌，从中解码 `deviceId`，仅删除该设备会话，不影响其他设备。后端在响应中通过 `Set-Cookie` 头将 HttpOnly Cookie 清空（`maxAge=0`），确保浏览器端彻底移除认证凭据。即使后端不可达（catch 静默处理），前端仍然会清除本地状态。

### 14.8 设置页面的设备会话管理

`SettingsPage` 新增"登录设备"区域，调用 `GET /auth/sessions` 展示所有活跃设备（设备名称、平台、IP、登录时间、最近活跃时间），支持：
- **单设备下线**：点击设备旁的删除图标，调用 `DELETE /auth/sessions/:deviceId`
- **全部下线**：点击"退出所有设备"按钮，调用 `POST /auth/logout-all`，成功后跳转登录页
- **修改密码自动下线**：`profileApi.changePassword` 成功后，后端自动调用 `AuthService.logoutAll()`（撤销所有会话 + 递增 tokenVersion 使所有已签发 AccessToken 立即失效），前端提示"密码已修改，请重新登录"后 1.5 秒自动跳转登录页

设备列表按 `lastActiveAt` 降序排列，使用平台图标（Monitor/Smartphone/Globe）区分设备类型。

### 14.9 Token 传输分层兼容（HttpOnly Cookie + JSON Body）

后端在 register / login / refresh 三个端点中同时执行两件事：
1. **JSON 响应体**：返回 `{ accessToken, refreshToken }`（兼容 APP / 小程序 / API 客户端）
2. **Set-Cookie 响应头**：将 refreshToken 写入 HttpOnly Cookie（Web 浏览器自动携带，防 XSS）

Cookie 配置：
- `httpOnly: true` — JavaScript 无法读取，防 XSS
- `secure: true`（仅生产环境）— 仅 HTTPS 传输
- `sameSite: 'lax'` — 防 CSRF（Lax 模式允许同站跳转携带）
- `path: '/api/v1/auth'` — 限制 Cookie 仅在认证相关接口发送
- `maxAge: 7 天` — 与 refreshToken 有效期一致

后端 refresh 端点的读取策略：`req.cookies?.refresh_token || dto.refreshToken`（Cookie 优先，body 兜底）。logout / logout-all 端点在清除 Redis 会话的同时清除 Cookie。

前端 Axios 配置 `withCredentials: true`，浏览器自动携带 HttpOnly Cookie。refresh 拦截器仍保留 sessionStorage 中的 refreshToken 作为兜底（兼容 Cookie 未设置的场景）。

面试话术："我的项目做了 Token 传输的分层兼容——后端统一返回双 Token 并同时 Set-Cookie，Web 前端走 HttpOnly Cookie 更安全，APP 客户端走 JSON body 更灵活。这样一套后端代码同时服务 Web 和多端。"

### 14.10 路由系统（App.tsx）

路由按三类布局组织：Auth（无导航栏）、Main（顶部导航 + 底部）、Admin（侧边栏布局）：

```tsx
function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <Routes>
          {/* Auth — 登录注册页（无主导航栏，已登录自动重定向） */}
          <Route path="/login" element={<AuthLayout><LoginPage /></AuthLayout>} />
          <Route path="/register" element={<AuthLayout><RegisterPage /></AuthLayout>} />

          {/* Admin — 管理后台（侧边栏布局，ADMIN 角色守卫） */}
          <Route path="/admin" element={<AdminLayout />}>
            <Route index element={<DashboardPage />} />
            <Route path="users" element={<UsersManagePage />} />
            <Route path="articles" element={<ArticlesManagePage />} />
            <Route path="tags" element={<TagsManagePage />} />
            <Route path="roles" element={<RolesManagePage />} />
            <Route path="permissions" element={<PermissionsManagePage />} />
          </Route>

          {/* Main — 前台页面（顶部导航 + 底部） */}
          <Route element={<MainLayout />}>
            <Route index element={<HomePage />} />
            <Route path="article/:slug" element={<ArticleDetailPage />} />
            <Route path="editor" element={<ProtectedRoute><ArticleEditorPage /></ProtectedRoute>} />
            <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            {/* ... 其他路由 */}
          </Route>

          {/* 兜底 — 未匹配路由跳转首页 */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </QueryClientProvider>
  );
}
```

**路由守卫（ProtectedRoute）：** 需要登录才能访问的页面用 `<ProtectedRoute>` 包裹，未登录自动跳转 `/login` 并记住来源路径，登录后可以回跳：

```tsx
export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();
  if (!isAuthenticated) return <Navigate to="/login" replace state={{ from: location }} />;
  return <>{children}</>;
}
```

**AdminLayout 双重守卫：** 管理后台布局组件内部同时检查登录状态和 ADMIN 角色，非管理员直接重定向到首页。

### 14.9 布局组件

**MainLayout（前台布局）：**

顶部固定导航栏 + 中间内容区（`<Outlet />`） + 底部 Footer。导航栏包含 Logo、首页/标签链接、搜索框、通知铃铛（带未读红点）、用户头像下拉菜单。移动端自动切换为汉堡菜单。

通知未读数通过 TanStack Query 每 30 秒轮询：

```tsx
const { data: unreadData } = useQuery({
  queryKey: ['unread-count'],
  queryFn: notificationApi.unreadCount,
  enabled: isAuthenticated,
  refetchInterval: 30_000,  // 30 秒轮询
});
```

**AuthLayout（认证布局）：** 居中卡片布局，已登录用户访问时自动重定向到首页（避免重复登录）。

**AdminLayout（管理后台布局）：** 左侧固定侧边栏 + 右侧内容区。侧边栏包含仪表盘、用户管理、文章管理、标签管理、角色管理、权限管理六个入口。

### 14.10 数据请求模式（TanStack Query）

所有数据获取都通过 `useQuery` / `useMutation`，不用 `useEffect` + `useState` 手动管理加载/错误状态。

**列表查询（带分页和筛选）：**

```tsx
// HomePage.tsx — 文章列表
const { data: articlesResponse, isLoading } = useQuery({
  queryKey: ['articles', page, sort, selectedTag],
  queryFn: () => articleApi.list({
    page, pageSize: 10,
    sortBy: SORT_MAP[sort], sortOrder: 'desc',
    ...(selectedTag ? { tag: selectedTag } : {}),
  }),
});
```

`queryKey` 数组中包含所有影响查询结果的参数，参数变化时 TanStack Query 会自动重新请求并缓存之前的结果（切回时秒级显示）。

**数据变更（useMutation + 缓存刷新）：**

```tsx
// 点赞 toggle
const likeMutation = useMutation({
  mutationFn: () => articleApi.toggleLike(article.id),
  onSuccess: (data) => {
    // 方式 1：直接更新本地状态（乐观更新）
    queryClient.setQueryData(['article', slug], (old: ArticleDetail) => ({
      ...old, isLiked: data.liked, likeCount: data.likeCount,
    }));
    // 方式 2：使缓存失效，触发重新请求
    // queryClient.invalidateQueries({ queryKey: ['articles'] });
  },
});
```

**全局 QueryClient 配置：**

```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,    // 5 分钟内不重新请求
      retry: 1,                      // 失败重试 1 次
      refetchOnWindowFocus: false,   // 切回窗口不自动刷新
    },
  },
});
```

### 14.11 表单处理（React Hook Form + Zod）

所有表单统一使用 React Hook Form 做表单状态管理，Zod 做 schema 校验：

```tsx
// LoginPage.tsx — 典型表单模式
const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(1, '请输入密码'),
});
type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      const res = await api.post<{ data: AuthResponse }>('/auth/login', data);
      login(res.data.data.user, res.data.data.accessToken, res.data.data.refreshToken);
      navigate('/');
    } catch (err) {
      const apiErr = getApiError(err);
      setError(apiErr?.message || '登录失败，请重试');
    }
  };

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <Input label="邮箱" type="email" error={errors.email?.message} {...register('email')} />
      <Input label="密码" type="password" error={errors.password?.message} {...register('password')} />
      <Button type="submit" loading={loading}>登录</Button>
    </form>
  );
}
```

**错误处理统一模式：** `try/catch` → `getApiError(err)` → 取 `message` 展示给用户。如果需要根据特定错误码做不同处理（比如邮箱重复时高亮输入框），可以用 `isErrorCode(err, ErrEmailRegistered)` 判断。

### 14.12 通用 UI 组件

`components/ui/` 下有 4 个基础组件，全部使用 Tailwind 样式，支持 `className` 覆盖：

| 组件 | 功能 | 关键 Props |
|------|------|-----------|
| `Button` | 按钮（primary/secondary/ghost/danger 四种变体） | `variant`, `size`, `loading`, `className` |
| `Input` | 输入框（带 label + 错误提示） | `label`, `error`, `...register()` |
| `Avatar` | 用户头像（图片/首字母兜底） | `src`, `size`, `name` |
| `TagBadge` | 标签徽章（带颜色点） | `name`, `color`, `active`, `onClick` |

`components/` 下还有两个跨 feature 复用的组件：

- `ArticleCard`：文章卡片（首页列表、用户主页文章列表、搜索结果复用），显示标题、摘要、作者、标签、统计数据
- `ProtectedRoute`：路由守卫（见 14.8）

**工具函数（lib/utils.ts）：**

```typescript
// 条件拼接 className（clsx + tailwind-merge 消除冲突）
export function cn(...inputs: ClassValue[]) { return twMerge(clsx(inputs)); }

// 相对时间格式化（"3 分钟前"、"2 天前"）
export function formatDate(dateStr: string): string { ... }

// 数字缩写（1200 → "1.2k"、15000 → "1.5w"）
export function formatNumber(n: number): string { ... }

// 标题转 URL slug
export function generateSlug(title: string): string { ... }
```

### 14.13 页面开发步骤（标准流程）

以"新建一个功能页面"为例，标准开发流程：

**Step 1：定义类型** — 在 `types/api.ts` 中添加请求/响应类型

```typescript
export interface SomeData {
  id: string;
  title: string;
}
```

**Step 2：添加 API 方法** — 在 `lib/api-services.ts` 中添加对应的调用函数

```typescript
export const someApi = {
  list: () => api.get<ApiResponse<SomeData[]>>('/some-endpoint').then((r) => r.data.data),
};
```

**Step 3：创建页面组件** — 在 `features/xxx/` 目录下创建页面

```tsx
import { useQuery } from '@tanstack/react-query';
import { someApi } from '@/lib/api-services';

export default function SomePage() {
  const { data, isLoading } = useQuery({
    queryKey: ['some-data'],
    queryFn: someApi.list,
  });
  // ... 渲染逻辑
}
```

**Step 4：注册路由** — 在 `App.tsx` 中添加路由配置

```tsx
<Route path="some-path" element={<SomePage />} />
```

**Step 5：添加导航入口** — 在对应的 Layout 组件中添加导航链接

### 14.14 页面清单与功能对照

| 页面 | 路由 | 文件 | 数据获取 | 需要登录 |
|------|------|------|---------|---------|
| 首页 | `/` | `HomePage.tsx` | `articleApi.list` + `tagApi.list` | 否 |
| 文章详情 | `/article/:slug` | `ArticleDetailPage.tsx` | `articleApi.getBySlug` | 否（点赞/收藏需登录） |
| 文章编辑器 | `/editor`, `/editor/:id` | `ArticleEditorPage.tsx` | `articleApi.getById`（编辑时） | 是 |
| 标签页 | `/tags` | `TagsPage.tsx` | `tagApi.list` | 否 |
| 登录 | `/login` | `LoginPage.tsx` | `api.post('/auth/login')` | 否（已登录重定向） |
| 注册 | `/register` | `RegisterPage.tsx` | `api.post('/auth/register')` | 否（已登录重定向） |
| 个人主页 | `/users/:id` | `UserProfilePage.tsx` | `userApi.getProfile` + `userApi.getArticles` | 否 |
| 设置 | `/settings` | `SettingsPage.tsx` | `profileApi.update` / `profileApi.changePassword` / `authApi.getSessions` | 是 |
| 收藏 | `/bookmarks` | `BookmarksPage.tsx` | `profileApi.getBookmarks` | 是 |
| 通知 | `/notifications` | `NotificationsPage.tsx` | `notificationApi.list` | 是 |
| 搜索 | `/search` | `SearchPage.tsx` | `searchApi.search` + `searchApi.suggest` | 否 |
| 仪表盘 | `/admin` | `DashboardPage.tsx` | `adminApi.dashboard` | 是（ADMIN） |
| 用户管理 | `/admin/users` | `UsersManagePage.tsx` | `adminApi.listUsers` | 是（ADMIN） |
| 文章管理 | `/admin/articles` | `ArticlesManagePage.tsx` | `adminApi.listArticles` | 是（ADMIN） |
| 标签管理 | `/admin/tags` | `TagsManagePage.tsx` | `adminApi.listTags` | 是（ADMIN） |
| 角色管理 | `/admin/roles` | `RolesManagePage.tsx` | `adminApi.listRoles` + `adminApi.createRole` | 是（ADMIN） |
| 权限管理 | `/admin/permissions` | `PermissionsManagePage.tsx` | `adminApi.getRolesWithPermissions` | 是（ADMIN） |

### 14.15 全局样式（index.css）

全局样式文件 `src/index.css` 包含三部分：

1. **`@import "tailwindcss"`** — 引入 Tailwind CSS 4（不需要 `@tailwind base/components/utilities` 三行写法）
2. **`.prose` 文章排版样式** — 用于文章详情页的 HTML 内容渲染，覆盖 h1-h3、code、pre、blockquote、table、img 等元素的排版，约 150 行
3. **`.tiptap-editor` 富文本编辑器样式** — Tiptap 编辑器的工具栏、占位符、图片等样式，约 100 行

> **为什么不用 `@tailwindcss/typography` 插件？** 插件生成的 prose 样式不完全符合中文排版习惯（行距、字间距、代码块背景色），手写 `.prose` 更可控。

### 14.16 开发顺序建议

前端开发建议按以下顺序逐步推进，每完成一步都确保编译通过且页面可正常渲染：

1. **基础设施层**：`types/api.ts` → `lib/utils.ts` → `lib/api.ts` → `stores/authStore.ts`
2. **布局层**：`MainLayout.tsx` → `AuthLayout.tsx` → `components/ProtectedRoute.tsx`
3. **UI 组件**：`Button` → `Input` → `Avatar` → `TagBadge` → `ArticleCard`
4. **认证流程**：`LoginPage` → `RegisterPage`（登录成功后 token 存入 sessionStorage）
5. **核心页面**：`HomePage` → `ArticleDetailPage` → `TagsPage`
6. **用户功能**：`UserProfilePage` → `SettingsPage` → `BookmarksPage`
7. **互动功能**：文章点赞/收藏/评论 toggle（在详情页中实现）
8. **编辑器**：`ArticleEditorPage`（Tiptap 富文本编辑器集成）
9. **通知系统**：`NotificationsPage` + MainLayout 通知红点轮询
10. **搜索**：`SearchPage`（搜索框 + 搜索建议 + 搜索结果列表）
11. **管理后台**：`AdminLayout` → `DashboardPage` → `UsersManagePage` → `ArticlesManagePage` → `TagsManagePage` → `RolesManagePage` → `PermissionsManagePage`
12. **API 服务层**：`lib/api-services.ts`（随页面开发逐步添加，最终汇总为完整文件）

### 14.17 前后端联调注意事项

**HTTP 方法必须与后端一致：** 后端用 `@Put()` 的接口前端必须 `api.put()`，不能混用 `api.patch()`。项目初期联调时发现 6 处方法不匹配，全部统一后解决。

**分页响应格式：** 分页接口返回 `{ data: [...], meta: { page, pageSize, total, totalPages } }`，前端直接解构使用。非分页接口返回 `ApiResponse<T>` 格式（`{ code, message, data }`），通过 `.then((r) => r.data.data)` 取出实际数据。

**错误处理三层兜底：**

```typescript
try {
  await api.post(...);
} catch (err) {
  const apiErr = getApiError(err);
  if (apiErr) {
    // 1. 有结构的业务错误 → 展示 apiErr.message
    toast.error(apiErr.message);
  } else if (axios.isAxiosError(err) && !err.response) {
    // 2. 网络错误（服务器不可达）
    toast.error('网络连接失败，请检查网络');
  } else {
    // 3. 未知错误兜底
    toast.error('操作失败，请重试');
  }
}
```

**Vite 代理配置：** 开发环境通过 `vite.config.ts` 的 `proxy` 把 `/api` 转发到 `localhost:3000`，不需要后端配 CORS。生产环境前后端同域或配反向代理，也不需要 CORS。只有在前后端分开部署到不同域名时才需要在后端 `main.ts` 中配置 `enableCors`。
