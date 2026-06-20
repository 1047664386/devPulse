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
- [十五、Bug 修复记录](#十五bug-修复记录)
- [十六、项目技术亮点](#十六项目技术亮点)
- [十七、技术难点与挑战](#十七技术难点与挑战)
- [十八、待补充与改进方向](#十八待补充与改进方向)

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

### Step 2：Docker Compose — PostgreSQL + Redis + Mailpit（dev/prod 分离）

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
      - devpulse-study-net
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
      - devpulse-study-net
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

  # Mailpit — 本地 SMTP 捕获工具（开发环境专用）
  # 捕获所有发出的邮件不真实投递，打开 http://localhost:8025 查看邮件
  mailpit:
    image: axllent/mailpit:latest
    container_name: devpulse-mailpit
    restart: unless-stopped
    ports:
      - "${MAILPIT_SMTP_PORT:-1025}:1025"   # SMTP 接收端口
      - "${MAILPIT_UI_PORT:-8025}:8025"     # Web UI 查看端口
    networks:
      - devpulse-study-net

volumes:
  postgres_data:
  redis_data:

networks:
  devpulse-study-net:
    driver: bridge
```

```yaml
# docker-compose.dev.yml（开发覆盖 — 暴露端口给本地工具）
services:
  postgres:
    ports:
      - "${POSTGRES_PORT:-5434}:5432"

  redis:
    ports:
      - "${REDIS_PORT:-6380}:6379"
```

```bash
# 开发环境启动（带端口映射，pgAdmin/RedisInsight 可连）
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 生产环境启动（数据库端口不暴露，仅内网通信）
docker compose up -d

docker compose ps   # 确认三个容器都是 healthy/running
```

> **设计决策：**
> - 生产环境不映射 5432/6379 端口到宿主机，数据库只通过 `devpulse-study-net` 内网桥与 API 容器通信，防止公网端口扫描爆破。
> - `POSTGRES_USER` / `POSTGRES_DB` 使用 `${VAR:-default}` 语法提供兜底默认值，漏配 `.env` 不会崩溃；**密码变量禁止写默认值**，缺失时直接启动失败，强制外部注入。
> - `deploy.resources.limits` 限制容器最大资源占用（PG: 1CPU/1GB, Redis: 0.5CPU/512MB），防止单容器吃满服务器资源影响其他服务共存。
> - `POSTGRES_PORT` / `REDIS_PORT` 只在端口冲突时才需要在 `.env` 中覆盖。
> - **Mailpit** 是轻量级 SMTP 捕获工具（MailHog 的继任者），端口 1025 接收邮件、端口 8025 提供 Web UI 查看。开发环境 `SMTP_HOST=127.0.0.1` + `SMTP_PORT=1025` 即可让后端邮件发送到 Mailpit，打开 `http://localhost:8025` 即可查看所有捕获的邮件。**注意：HOST 务必用 `127.0.0.1` 而非 `localhost`**——macOS 下 `localhost` 会被解析为 IPv6 `::1`，若 Mailpit 未启动或端口未监听 IPv6 会报 `ECONNREFUSED ::1:1025`。生产环境不需要 Mailpit，应配真实 SMTP 服务商。

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
DATABASE_URL=postgresql://devpulse:devpulse123@localhost:5434/devpulse_study

# Redis (shared by docker-compose and NestJS)
REDIS_HOST=localhost
REDIS_PORT=6380
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

# Email — 本地 Mailpit 模式（仅 HOST+PORT，USER/PASS 留空无需认证）
# 打开 http://localhost:8025 查看捕获的邮件
# HOST 用 127.0.0.1 而非 localhost，避免 macOS 下 IPv6 解析报 ECONNREFUSED ::1:1025
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
```

> **安全提示：** `.env` 已在 `.gitignore` 中，不会提交到仓库。生产环境应通过平台密钥管理器或系统环境变量注入，不要放置明文 `.env` 文件。

#### 环境变量：本地 vs 线上配置策略

很多初学者会有疑问：**`.env` 文件被 gitignore 忽略了，那线上服务器怎么读到配置？** 这要先理清 `.env` 文件的本质——它只是本地开发的一个便利文件，并非应用读取配置的唯一途径。

**NestJS 读取环境变量的真实机制：**

NestJS 的 `ConfigModule`（见 `apps/api/src/app.module.ts` 第 55-58 行）调用 `process.env` 读取环境变量。`.env` 文件只是 `@nestjs/config` 在启动时把这些键值对**加载进 `process.env`** 的一种方式。换句话说：

- **本地开发**：`process.env` 里没有这些变量 → 靠 `dotenv` 读取 `.env` 文件填进去
- **线上生产**：运行环境本身就把变量注入到 `process.env` → 根本不需要 `.env` 文件

这就是为什么 `.env` 被 gitignore 是安全的——线上根本不依赖这个文件。

**线上注入环境变量的三种常见方式：**

| 方式 | 适用场景 | 本项目示例 |
|------|----------|-----------|
| **Docker `environment` / `env_file`** | 容器化部署（本项目 `docker-compose.yml` 已采用） | `docker-compose.yml` 第 11-12 行用 `${POSTGRES_PASSWORD}` 从宿主机环境变量读取注入容器 |
| **PM2 ecosystem 配置** | Node 进程托管（非容器化） | `ecosystem.config.js` 中 `env_production: { DATABASE_URL: '...', JWT_SECRET: '...' }` |
| **云平台环境变量** | K8s Secret、腾讯云、Vercel、Render 等 | 在平台控制台「环境变量」面板逐项配置，部署时注入容器 `process.env` |

**本项目 Docker 部署的配置流转：**

```text
宿主机 shell export POSTGRES_PASSWORD=xxx
        │
        ▼
docker compose up 读取 docker-compose.yml 中的 ${POSTGRES_PASSWORD}
        │
        ▼
写进容器的 environment（POSTGRES_PASSWORD=xxx）
        │
        ▼
容器内 NestJS 进程的 process.env.POSTGRES_PASSWORD 可直接读到
```

注意 `docker-compose.yml` 第 12 行 `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}` 注释写着 `# No fallback — must be injected`——这正是生产模式的设计：敏感变量没有默认值，**必须由部署环境注入**，未注入则启动失败（`env.validation.ts` 的 `@IsNotEmpty` 校验会拦截）。

**线上配置的最佳实践：**

1. **绝不把生产密钥写进 git 仓库**（`.env`、`.env.example`、代码注释里都不行）
2. **敏感变量（密码、JWT_SECRET、SMTP 授权码）走密钥管理服务**：K8s 用 Secret，云平台用「密钥管理」，而非明文环境变量
3. **`.env.example` 只放变量名和占位符**，不放真实值——它的作用是告诉协作者「需要配哪些变量」
4. **校验前置**：本项目 `env.validation.ts` 在 NestJS 启动时校验所有必填变量，配置缺失直接报错阻止启动，避免「线上跑起来才发现配置漏了」
5. **环境隔离**：dev / staging / prod 用不同的环境变量集，绝不混用（如生产 JWT_SECRET 必须重新生成，不能用 `.env.example` 里的 `change-me-...` 占位符）

> **一句话总结：** `.env` 是本地开发的「便利贴」，线上靠运行环境把变量直接注入 `process.env`，所以 gitignore 忽略 `.env` 完全不影响生产部署。

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
// src/app.module.ts（完整版本 — 18 个 imports）
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

#### 1.7 忘记密码与重置密码

**用户故事：** 作为已注册用户，当我忘记密码时，我想通过邮箱接收重置链接来设置新密码。

**忘记密码 `POST /auth/forgot-password`（无需认证）：**

请求：
```json
{ "email": "user@example.com" }
```

响应（无论邮箱是否存在都返回相同响应，防邮箱枚举）：
```json
{ "sent": true, "message": "如果该邮箱已注册，重置邮件将在几分钟内送达" }
```

验收标准：
- 邮箱格式校验（`@IsEmail()`）
- 冷却机制：同一邮箱 60 秒内只能发送一次重置邮件（Redis key: `pwd_reset_cd:{email}`，TTL=60s），超频返回 `ErrResetCooldown(20027)`
- 无论邮箱是否存在都返回统一成功消息，不泄露用户注册信息
- 用户存在时：生成 JWT 重置令牌（payload: `{sub: userId, purpose: 'password-reset'}`，有效期 30 分钟），令牌状态存入 Redis（key: `pwd_reset:{userId}`，value: `"unused"`，TTL=30min）
- 构造前端重置链接 `{FRONTEND_URL}/reset-password?token={resetToken}` 通过 `MailService` 发送邮件
- **邮件发送同步 await**：`AuthService.forgotPassword` 同步等待邮件发送结果。发送成功才设置冷却期；**发送失败时抛 `ErrMailSendFailed(20028)` + 不设冷却期**（清理已生成的令牌），用户可立即重试，前端显示"邮件发送失败，请稍后重试或联系管理员"

**重置密码 `POST /auth/reset-password`（无需认证）：**

请求：
```json
{ "token": "eyJhbGciOiJIUzI1NiIs...", "newPassword": "NewPassword123!" }
```

响应：
```json
{ "success": true, "message": "密码已重置，请使用新密码登录" }
```

验收标准：
- JWT 令牌校验（签名 + 有效期）→ 过期/无效返回 `ErrResetTokenExpired(20024)` 或 `ErrResetTokenInvalid(20025)`
- 令牌用途校验：`purpose !== 'password-reset'` → `ErrResetTokenInvalid(20025)`
- Redis 令牌状态校验：不存在 → `ErrResetTokenExpired(20024)`；值为 `"used"` → `ErrResetTokenUsed(20026)`
- 新密码规则：>= 8 位，含大小写字母和数字（`class-validator` 的 `@MinLength(8)` + `@Matches` 装饰器）
- 密码 bcrypt hash(saltRounds=12) 写入数据库
- 令牌使用一次后 Redis 标记为 `"used"`（防重放攻击）
- 安全联动：递增 `tokenVersion` + 清除全部设备 Redis 会话 → 所有设备强制重新登录

**前端页面：**

- `/forgot-password`：邮箱输入表单，提交成功后显示"邮件已发送"提示页
- `/reset-password?token=eyJ...`：新密码输入表单（含确认密码），从 URL query 提取 token 参数，成功后跳转登录页
- 无 token 参数时显示"请通过邮件中的重置链接访问"提示

**邮件服务（MailService）配置说明：**

邮件服务通过 `MailModule` 在 `AuthModule` 中导入，基于 `nodemailer` 实现。环境变量配置位于 `apps/api/.env`：

| 变量 | 说明 | 示例值 |
|------|------|--------|
| `SMTP_HOST` | SMTP 服务器地址（本地务必用 `127.0.0.1`，勿用 `localhost`） | `127.0.0.1`（本地 Mailpit）或 `smtp.gmail.com` |
| `SMTP_PORT` | SMTP 端口 | `1025`（Mailpit）/ `465`（SSL）/ `587`（TLS） |
| `SMTP_USER` | SMTP 认证用户名（本地开发工具可留空） | `user@gmail.com` |
| `SMTP_PASS` | SMTP 认证密码（本地开发工具可留空） | `app-password` |
| `MAIL_FROM` | 发件人地址 | `noreply@devpulse.com` |

三种配置模式：
- **本地开发（Mailpit）**：仅配 `SMTP_HOST`（务必 `127.0.0.1`）和 `SMTP_PORT`，`SMTP_USER` / `SMTP_PASS` 留空 → 无需认证的本地 SMTP 捕获工具，打开 `http://localhost:8025` 即可查看邮件。启动 Mailpit：`docker compose up -d mailpit`。
- **生产环境**：配齐 `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS` → 通过真实邮件服务商发送

> **关于发送失败的统一处理：** 无论开发/生产模式，`MailService.sendResetPasswordEmail()` 在 SMTP 发送失败时都会**抛出错误**（不再静默吞掉）。`AuthService.forgotPassword()` 捕获后返回 `ErrMailSendFailed(20028)` + 不设冷却期，前端显示"邮件发送失败，请稍后重试或联系管理员"，用户可立即重试。开发模式下发送前会把重置链接打印到终端日志辅助调试，但连接失败仍会抛错——请先确保 Mailpit 已启动。

> **实现细节：** `MailService` 在**构造函数**中同步初始化 transporter（`nodemailer.createTransport()` 本身是同步调用），实例化后即可用，无需 `await`，不存在 `initTransporter()` 异步方法导致 transporter 为 `undefined` 的问题。

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

修复：在项目根目录创建 `.env.example`，覆盖全部环境变量：`POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` / `DATABASE_URL` / `REDIS_HOST` / `REDIS_PORT` / `REDIS_PASSWORD` / `JWT_SECRET` / `JWT_EXPIRES_IN` / `JWT_REFRESH_SECRET` / `JWT_REFRESH_EXPIRES_IN` / `API_PORT` / `API_PREFIX` / `FRONTEND_URL` / `APP_URL` / `UPLOAD_DIR` / `MAX_FILE_SIZE` / `ADMIN_EMAIL` / `ADMIN_PASSWORD` / `SMTP_HOST` / `SMTP_PORT`。每个变量附带注释说明用途和安全要求。

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
│   │   │   │   │   ├── register.dto.ts
│   │   │   │   │   ├── refresh.dto.ts
│   │   │   │   │   ├── forgot-password.dto.ts
│   │   │   │   │   ├── reset-password.dto.ts
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
│   │   │   ├── app.module.ts             # 根模块（18 个 imports）
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
| ✅ 认证模块 | JWT 双令牌 + 多设备登录 + 会话管理 + 注册/登录/刷新/登出/忘记密码/重置密码 + Passport + 邮件服务 | 已完成 |
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
  - **重置密码（forgot-password → reset-password）**：重置密码成功后递增 tokenVersion + 清除全部 Redis 会话，所有设备强制重新登录。

**忘记密码 / 重置密码完整流程：**

1. 用户在登录页点击"忘记密码？" → 跳转 `/forgot-password` 页面 → 输入邮箱 → 调用 `POST /auth/forgot-password`。
2. 后端 `AuthService.forgotPassword(email)`：
   - 冷却期检查：同一邮箱 60 秒内只能发送一次（Redis key: `pwd_reset_cd:{email}`），超频抛 `ErrResetCooldown(20027)`。
   - 查询用户：无论邮箱是否存在都继续流程（防邮箱枚举）。
   - 用户存在时：生成 JWT 重置令牌（payload: `{sub: userId, purpose: 'password-reset'}`, 有效期 30 分钟, secret: `JWT_SECRET`）。
   - 令牌状态存入 Redis（key: `pwd_reset:{userId}`, value: `"unused"`, TTL=30min）。
   - 构造前端重置链接 `{FRONTEND_URL}/reset-password?token={resetToken}` → 通过 `MailService` 发送重置邮件。
   - 无论邮箱是否存在，都设置 60 秒冷却期并返回统一成功消息。
3. 用户在邮箱中点击重置链接 → 跳转前端 `/reset-password?token=eyJ...` 页面 → 输入新密码 → 调用 `POST /auth/reset-password`。
4. 后端 `AuthService.resetPassword(token, newPassword)`：
   - JWT 令牌校验：签名/有效期 → 过期抛 `ErrResetTokenExpired(20024)`，签名错误抛 `ErrResetTokenInvalid(20025)`。
   - 令牌用途校验：`purpose !== 'password-reset'` → 抛 `ErrResetTokenInvalid(20025)`。
   - Redis 令牌状态校验：不存在 → 过期 `ErrResetTokenExpired(20024)`；值为 `"used"` → 已使用 `ErrResetTokenUsed(20026)`。
   - 更新密码：bcrypt hash(saltRounds=12) → 写入 DB。
   - 标记令牌已使用：Redis value 改为 `"used"`（防重放攻击）。
   - 安全联动：递增 `tokenVersion` + 清除全部设备 Redis 会话 → 所有设备强制重新登录。

**邮件模块（MailModule / MailService）：**

- 位置：`src/common/mail/mail.module.ts` + `mail.service.ts`
- 依赖：`nodemailer`（npm 包）
- 配置：`.env` 中 `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM`
- **开发模式**（`SMTP_HOST` 为 `127.0.0.1`/localhost 或无认证信息）：连接本地 Mailpit（启动：`docker compose up -d mailpit`，查看邮件：`http://localhost:8025`）。发送前会把重置链接打印到终端日志辅助调试，但 **SMTP 连接失败会抛出错误**（不再静默吞掉），由 `AuthService.forgotPassword` 捕获后返回 `ErrMailSendFailed(20028)` + 不设冷却期。**`SMTP_HOST` 务必用 `127.0.0.1`**，避免 macOS 下 `localhost` 解析为 IPv6 `::1` 报 `ECONNREFUSED ::1:1025`。
- **生产模式**（配齐 `SMTP_HOST` + `SMTP_USER` + `SMTP_PASS`）：通过真实邮件服务商发送，发送失败时抛出错误，由 `AuthService.forgotPassword` 捕获并返回 `ErrMailSendFailed(20028)` 给用户。
- 全局模块：`MailModule` 在 `AuthModule` 中导入，其他模块如需邮件功能可直接注入 `MailService`
- **实现细节**：`MailService` 在**构造函数**中同步初始化 transporter（`nodemailer.createTransport()` 本身是同步调用），实例化后即可用，无需 `await`。
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
| `APP_URL` | NestJS (UploadService) | 后端对外 URL，拼接上传文件完整路径 | 留空（返回相对路径） | `https://api.example.com` |
| `UPLOAD_DIR` | NestJS | 上传目录 | `./uploads` | 可保持 |
| `MAX_FILE_SIZE` | NestJS | 上传大小限制(bytes) | `2097152` (2MB) | 可保持 |
| `ADMIN_EMAIL` | PrismaService | 初始管理员邮箱 | `admin@devpulse.com` | 生产邮箱 |
| `ADMIN_PASSWORD` | PrismaService | 初始管理员密码 | `Admin123!` | **强密码** |
| `SMTP_HOST` | NestJS (可选) | 邮件服务地址 | `127.0.0.1` | 邮件服务商 |
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

**Vite 代理配置：** 开发环境通过 `vite.config.ts` 的 `proxy` 把 `/api` 和 `/uploads` 转发到 `localhost:3000`，不需要后端配 CORS。`/uploads` 必须单独代理，否则上传的头像/封面图在开发环境下会 404（后端 `ServeStaticModule` 在 3000 端口提供文件，浏览器请求打到 Vite 的 5173 端口找不到文件）。生产环境前后端同域或配反向代理（Nginx 同时转发 `/api` 和 `/uploads`），也不需要 CORS。只有在前后端分开部署到不同域名时才需要在后端 `main.ts` 中配置 `enableCors`，同时后端通过 `APP_URL` 环境变量返回完整 URL（如 `https://api.example.com/uploads/xxx.webp`），前端 `resolveUploadUrl()` 工具函数兼容新数据（完整 URL）和历史遗留数据（相对路径）。

---

## 十五、Bug 修复记录

> 本章记录开发过程中遇到的典型 Bug，包括问题现象、根因分析和修复方案，方便后续回顾与复盘。

### 15.1 忘记密码邮件无法发送

**现象：** 调用"忘记密码"接口后返回成功，但邮箱始终收不到重置邮件。

**根因分析（三重叠加）：**

1. **`initTransporter()` 是 async 方法但在构造函数中调用**：构造函数无法 `await`，导致 `this.transporter` 在首次发邮件时仍为 `undefined`。`nodemailer.createTransport()` 本身是同步方法，无需 `async`。
2. **SMTP 条件过严**：原条件 `if (smtpHost && smtpUser && smtpPass)` 要求三个变量全部非空。本地 Mailpit 无需认证（`SMTP_USER` / `SMTP_PASS` 为空），结果跳过了本地 SMTP，直接走了 Ethereal 测试兜底。
3. **docker-compose 缺少 Mailpit 容器**：即使代码正确，也没有任何服务监听 1025 端口。

**修复方案：**

```typescript
// mail.service.ts — 去掉 async，构造函数内同步初始化
constructor(private configService: ConfigService) {
  // ...
  if (smtpHost) {
    this.transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: smtpPort === 465,
      ...(smtpUser && smtpPass ? { auth: { user: smtpUser, pass: smtpPass } } : {}),
    });
  }
}
```

docker-compose.yml 新增 Mailpit 服务：

```yaml
mailpit:
  image: axllent/mailpit:latest
  container_name: devpulse-study-mailpit
  ports:
    - "${MAILPIT_SMTP_PORT:-1025}:1025"   # SMTP
    - "${MAILPIT_UI_PORT:-8025}:8025"     # Web UI
```

### 15.2 密码输入框缺少"小眼睛"切换按钮

**现象：** Chrome / Edge 等 Chromium 浏览器原生的密码显示/隐藏眼睛图标不出现。

**根因：** Tailwind CSS v4 的 Preflight 全局样式包含 `appearance: none`，该属性会移除 Chromium 内核浏览器内置的密码 reveal 按钮（`::-ms-reveal` / `::-webkit-credentials-auto-fill-button`）。这是 Tailwind v4 的设计行为，并非浏览器 Bug。

**修复方案：** 创建 `PasswordInput.tsx` 自定义组件，用 `useState` 控制 `type="password"` / `type="text"` 切换，配合 `lucide-react` 的 `Eye` / `EyeOff` 图标实现手动切换按钮。全部 8 处密码输入（登录 1、注册 2、重置密码 2、设置页 3）统一替换。

```tsx
// PasswordInput.tsx 核心逻辑
const [visible, setVisible] = useState(false);
<input type={visible ? 'text' : 'password'} ... />
<button onClick={() => setVisible(v => !v)}>
  {visible ? <EyeOff /> : <Eye />}
</button>
```

### 15.3 登录后刷新页面状态不一致（能评论但头部显示"登录/注册"）

**现象：** 用户登录成功后刷新页面，Header 导航显示"登录 / 注册"按钮（未登录态），但评论功能正常使用且评论中显示用户名。

**根因：** Zustand Store 中 `isAuthenticated` 从 `sessionStorage` 读取（刷新后为 `true`），但 `user` 被硬编码为 `null`，没有做持久化。Header 根据 `user` 是否为 null 决定显示用户名还是登录按钮；评论组件只检查 `isAuthenticated`，所以两边状态矛盾。

**修复方案：** 增加 `loadUser()` / `saveUser()` 辅助函数，将 `user` 对象以 JSON 序列化到 `sessionStorage`。`login()`、`logout()`、`setUser()`、`updateUser()` 四个 action 全部同步写入 `sessionStorage`，保证 `user` 和 `isAuthenticated` 始终一致。

```typescript
// authStore.ts
function loadUser(): User | null {
  try {
    const raw = sessionStorage.getItem('user');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: loadUser(),           // ← 从 sessionStorage 恢复
  isAuthenticated: !!sessionStorage.getItem('accessToken'),
  login: (user, accessToken, refreshToken) => {
    sessionStorage.setItem('accessToken', accessToken);
    sessionStorage.setItem('refreshToken', refreshToken);
    saveUser(user);
    set({ user, isAuthenticated: true });
  },
  logout: () => {
    sessionStorage.removeItem('accessToken');
    sessionStorage.removeItem('refreshToken');
    saveUser(null);
    set({ user: null, isAuthenticated: false });
  },
}));
```

同时修复 `api.ts` 中 `clearAuth()` 遗漏清除 `user` 的问题。

### 15.4 刷新后用户信息过期（SWR 模式优化）

**现象：** 虽然 15.3 修复了本地持久化，但 `sessionStorage` 中的用户数据可能是过期的（比如管理员在后台修改了用户角色、用户自己修改了头像昵称等），刷新后仍显示旧数据。

**根因：** 纯本地持久化没有"回源校验"机制，无法感知服务端数据变化。

**修复方案（业内最佳实践 — SWR 模式）：** 创建 `useAuthRefresh.ts` Hook，利用 TanStack Query 的 `useQuery` 在页面加载时静默调用 `GET /auth/me` 接口，拿到最新用户数据后自动更新 Store。配置 `staleTime: 5min` 避免频繁请求，`enabled: isAuthenticated` 确保未登录时不发请求。

```typescript
// useAuthRefresh.ts
export function useAuthRefresh() {
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated);
  const setUser = useAuthStore((s) => s.setUser);
  useQuery({
    queryKey: ['auth-me'],
    queryFn: authApi.getMe,
    enabled: isAuthenticated,
    staleTime: 1000 * 60 * 5,
    retry: false,
    onSuccess: (freshUser) => { setUser(freshUser); },
  });
}
```

在 `MainLayout` 和 `AdminLayout` 中调用此 Hook。用户体验：先用本地缓存立即渲染（无闪烁），后台静默刷新拿到最新数据后自动更新 UI。

### 15.5 上传头像/封面图无法显示

**现象：** 上传头像成功后，`<img>` 标签 `src` 为 `/uploads/xxx.webp`，但图片加载 404。

**根因：** Vite 开发服务器只配置了 `/api` 代理，`/uploads` 请求打到 Vite 的 5173 端口而不是后端的 3000 端口。后端 `ServeStaticModule` 在 3000 端口提供静态文件，5173 端口自然找不到。

**修复方案：**

```typescript
// vite.config.ts
proxy: {
  '/api': { target: 'http://localhost:3000', changeOrigin: true },
  '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
}
```

**生产环境兼容：** 前后端分域部署时（前端 CDN + 后端 API 服务器），`/uploads/xxx.webp` 相对路径会请求到前端域名导致 404。解决方案：后端通过 `APP_URL` 环境变量返回完整 URL（如 `https://api.example.com/uploads/xxx.webp`），前端 `resolveUploadUrl()` 工具函数同时兼容完整 URL 和历史遗留的相对路径，保证新老数据都能正常显示。

### 15.6 登录设备列表出现多台相同 macOS 幽灵设备

**现象：** 用户仅在一个浏览器登录过，但"登录设备"页面出现 4 台完全相同的 macOS 设备（IP 均为 `::1`）。

**根因分析（两重叠加）：**

1. **每次登录生成随机 deviceId**：`crypto.randomUUID()` 每次调用产生不同 ID，即使同一浏览器也产生独立的 Redis 会话条目。
2. **手动清除 token ≠ 调用 logout API**：用户手动清除浏览器 sessionStorage/Cookie 中的 token 后，旧的 Redis 会话仍然存活（TTL 7 天），不会被清理。重新登录后又产生一条全新的随机会话，导致同一浏览器在 Redis 中有多条"孤儿"记录。

**修复方案 — 设备指纹（Device Fingerprint）确定性会话：**

整体思路分三层：前端采集稳定特征 → 后端确权生成确定性 deviceId → Redis HSET 天然覆盖实现 UPDATE 语义。

**① 前端指纹采集（`fingerprint.ts`）— 只采集稳定硬件/浏览器底层特征：**

```typescript
/**
 * 已采集的稳定维度（不受窗口缩放、页面操作、网络切换影响）：
 *  ① navigator.userAgent          — 浏览器内核 + 版本号
 *  ② screen.width × screen.height — 物理屏幕分辨率
 *  ③ screen.colorDepth            — 色深（硬件固定）
 *  ④ timeZone                     — 系统时区名
 *  ⑤ navigator.maxTouchPoints     — 触控点数
 *  ⑥ navigator.hardwareConcurrency — CPU 逻辑核心数
 *  ⑦ navigator.languages          — 浏览器语言偏好列表
 *
 * 刻意剔除的易变字段：
 *  ✗ window.innerWidth/innerHeight — 缩放/调整窗口即变
 *  ✗ devicePixelRatio              — 系统缩放比例改变时跟随变化
 *  ✗ IP 地址                       — 切 WiFi/VPN 就变，仅存展示不参与指纹
 *  ✗ Canvas/WebGL                  — 异步渲染 + 无痕模式降级 + 隐私警告
 */
export function getDeviceFingerprint(): string {
  const parts = [
    navigator.userAgent,
    String(screen.width), String(screen.height),
    String(screen.colorDepth),
    Intl.DateTimeFormat().resolvedOptions().timeZone,
    String(navigator.maxTouchPoints),
    String(navigator.hardwareConcurrency ?? 0),
    navigator.languages.join(','),
  ];
  // FNV-1a 32-bit hash → 8 位十六进制，零依赖毫秒级计算
  let hash = 0x811c9dc5;
  for (let i = 0; i < parts.join('|').length; i++) { /* ... */ }
  return (hash >>> 0).toString(16).padStart(8, '0');
}
```

**② 后端确定性 deviceId（`auth.service.ts`）：**

```typescript
// SHA-256(userId + fingerprint) → 32 位十六进制确定性 deviceId
private deriveDeviceId(userId: string, fingerprint: string): string {
  return createHash('sha256').update(`${userId}:${fingerprint}`).digest('hex').slice(0, 32);
}

// login() / register()：有指纹用确定性 ID，无指纹退回随机 UUID（兼容旧客户端）
const deviceId = dto.fingerprint
  ? this.deriveDeviceId(user.id, dto.fingerprint)
  : crypto.randomUUID();
```

**③ Redis HSET 天然覆盖 → UPDATE 语义：**

确定性 deviceId 的 key 为 `rt:{userId}:{sha256-hash}`，同一浏览器无论登录多少次，HSET 都覆盖同一条 Hash。`storeSession()` 额外保留原始 `loginAt`（首次登录时间），仅更新 `lastActiveAt`、`tokenHash`、`ip` 等易变字段。

**④ `getSessions` 按 fingerprint 分组去重：**

作为兜底，查询所有会话后按 fingerprint 分组，同一指纹仅保留最近活跃的一条。历史遗留的随机 UUID 孤儿会话（无 fingerprint 字段或 fingerprint 相同但 deviceId 不同）在此步骤自动清理。

**⑤ Refresh Token 轮换保持 deviceId 不变：**

刷新令牌时从 Redis 读取存储的 fingerprint，生成相同的确定性 deviceId。新会话 HSET 覆盖旧会话后，`revokeSession(userId, oldDeviceId)` 因为 `oldDeviceId === newDeviceId` 成为幂等 no-op。旧 refreshToken 的 tokenHash 已被覆盖，重用检测正常触发。

**设计决策记录（与常见"最佳实践"方案的对比）：**

| 决策点 | 本方案选择 | 理由 |
|--------|-----------|------|
| IP 是否参与指纹 | **不参与**，仅存展示 | 切 WiFi/VPN 即变，需要额外模糊匹配兜底 |
| Canvas/WebGL | **不采集** | 异步渲染 + 无痕降级 + 隐私警告，社区平台 ROI 低 |
| 后端私盐 | **不加** | 攻击者直接调 API 即可拿到结果，盐挡不住真正攻击者 |
| 会话存储 | **Redis Hash**（现有架构） | 自动 TTL、原子操作、管道批量，优于每次走 DB |
| 无指纹兼容 | **退回随机 UUID** | 旧客户端/APP 端无感知，逐步迁移 |

### 15.7 删除登录设备后当前账号未退出

**现象：** 在"登录设备"页面点击垃圾桶删除所有设备，页面显示"暂无活跃设备"，但当前账号仍然保持登录状态，可以继续操作。

**根因：** `logoutDevice` 仅删除 Redis 中的会话记录，不清理浏览器本地的 accessToken（sessionStorage）和 refreshToken（Cookie）。前端 `onSuccess` 只刷新设备列表，没有判断删除的是否是当前设备。accessToken 在 15 分钟内仍有效，过期后 refresh 时才发现 Redis 无会话而退出，体验割裂。

**修复方案：**

1. **后端标记当前设备**：AccessToken payload 新增 `deviceId` 字段，`getSessions` 从 Bearer Token 解码出当前 deviceId，返回 `isCurrent: true` 标记。
2. **前端 UI 标识**：当前设备卡片蓝色高亮 + "当前设备"徽章，删除时弹出二次确认。
3. **删除即退出**：`onSuccess` 回调检查被删设备的 `isCurrent` 标志，若为 true 立即调用 `logout()` 清理本地 token 并跳转登录页。

### 15.8 登出后重新登录，设备列表仍显示旧数据

**现象：** 在设置页删除旧设备 → 退出登录 → 重新登录 → 进入设置页，"登录设备"列表仍然显示上一次会话的旧数据（包括已被删除的设备），手动刷新页面后才恢复正常。

**根因：** TanStack Query 全局配置了 `staleTime: 5min`，即查询数据在 5 分钟内被视为"新鲜"，不会重新请求。登出时 `authStore.logout()` 只清理了 `sessionStorage`（token + user），但 TanStack Query 的内存缓存（包括 `['sessions']`、`['auth-me']`、`['notifications']` 等所有查询）未清理。重新登录后如果距上次查询不到 5 分钟，`useQuery({ queryKey: ['sessions'] })` 命中旧缓存直接返回，不发请求。

**修复方案：** 将 `QueryClient` 从 `App.tsx` 抽到独立模块 `lib/queryClient.ts`，使非组件代码（Zustand store、axios 拦截器）也能引用。在三个登出入口统一调用 `queryClient.clear()` 清空所有查询缓存：

```typescript
// lib/queryClient.ts — 全局单例
export default new QueryClient({ defaultOptions: { queries: { staleTime: 5min } } });

// authStore.ts — 登出 + 登入
login: (user, accessToken, refreshToken) => {
  queryClient.clear();  // 清理上一会话残留缓存
  // ... 写入 token + user
},
logout: () => {
  queryClient.clear();  // 清理当前会话缓存
  // ... 清除 token + user
},

// api.ts — 401 强制登出
function clearAuth() {
  queryClient.clear();
  // ... 清除 token + user + 跳转登录页
}
```

### 15.9 发布文章后首页列表不刷新 / 点赞评论后卡片数据不同步

**现象：** 写完文章发布成功后，跳转回首页看不到新文章；在文章详情页点赞/评论后返回列表页，卡片上的点赞数/评论数仍是旧值；后台删除文章后前台列表不更新；设置页上传头像后 Header 头像不更新；标记通知已读后 Header 未读数角标不消失。

**根因：** 全局 `staleTime: 5min`，`useMutation` 的 `onSuccess` 回调中只 invalidate 了当前页面直接相关的 queryKey，缺少跨页面级联失效。例如文章编辑器只 `navigate()` 不 invalidate `['articles']`；点赞 mutation 只 invalidate `['article', slug]`（详情页），不 invalidate `['articles']`（列表页）。

**修复方案 — 全量排查所有 mutation 的级联 invalidate：**

| 页面 | Mutation | 补充的 invalidate |
|------|----------|------------------|
| ArticleEditorPage | createMutation | `['articles']`, `['user-articles']` |
| ArticleEditorPage | updateMutation | `['article', slug]`, `['articles']`, `['user-articles']` |
| ArticleDetailPage | likeMutation | `['articles']`, `['user-articles']`（列表卡片点赞数） |
| ArticleDetailPage | bookmarkMutation | `['bookmarks']`（收藏夹页面） |
| ArticleDetailPage | postCommentMutation | `['article', slug]`, `['articles']`（评论数） |
| SettingsPage | avatarMutation | `['auth-me']`（Header 头像） |
| SettingsPage | saveProfileMutation | `['auth-me']`（Header 昵称） |
| NotificationsPage | markRead/markAllRead | `['unread-count']`（Header 未读角标） |
| AdminArticlesManagePage | deleteMutation | `['articles']`, `['user-articles']`（前台列表） |
| AdminTagsManagePage | deleteMutation | `['tags']`（前台标签侧栏） |

设计原则：**mutation 改了哪个后端资源，所有读取该资源的 queryKey 都必须 invalidate**。不仅限于当前页面使用的 queryKey，还要考虑其他页面可能缓存了同一份数据。

### 15.10 草稿保存功能缺陷（校验 / 错误跳转 / 无草稿页 / 无标签选择）

**问题描述：** 草稿保存存在四个关联问题：① 草稿走了和发布相同的 `CreateArticleDto`，title MinLength(5) + content MinLength(1) 校验导致短标题或空内容无法保存草稿；② 保存成功后 `onSuccess` 直接 `navigate(/article/${slug})` 跳到文章详情页，而 `findBySlug` 只查 PUBLISHED 文章，所以 100% 报 40001 "内容不存在"；③ 没有「我的草稿」页面，用户无法找到和管理已保存的草稿；④ 编辑器没有标签选择器，无法为文章打标签。

**根因分析：**

| 问题 | 根因 |
|------|------|
| 草稿被校验拦截 | `CreateArticleDto` 的 `@MinLength(5)` / `@MinLength(1)` 对草稿不适用 |
| 保存后 40001 | `onSuccess` → `navigate(/article/${slug})` → `findBySlug` 只查 `status='PUBLISHED'` |
| 无草稿页面 | 缺少 `GET /articles/drafts` 接口和前端草稿列表页 |
| 无标签选择 | 编辑器未集成 `tagApi.list` + 多选 UI |

**修复方案：**

1. **后端新增 SaveDraftDto**（`apps/api/src/article/dto/save-draft.dto.ts`）：所有字段 `@IsOptional()`，不做任何长度/格式校验。新增三个接口：
   - `POST /articles/save-draft` — 创建新草稿，标题为空时自动填 "无标题草稿"
   - `PUT /articles/:id/save-draft` — 更新已有草稿（仅校验所属权，不走 optimistic lock）
   - `GET /articles/drafts` — 获取当前用户的草稿列表（按 `updatedAt DESC` 排序）

2. **前端编辑器拆分两条保存路径**（`ArticleEditorPage.tsx`）：
   - **存草稿**：无校验 → `saveDraft` / `updateDraft` → 不跳页，仅显示 "✓ 已保存" 状态提示；首次保存后用 `navigate(replace)` 把 URL 从 `/editor` 切换到 `/editor/:id`
   - **发布**：保留前端校验（标题≥5字符 + 内容非空） → `create` / `update` → 跳文章详情页
   - 额外：`Ctrl/Cmd+S` 快捷键绑定到草稿保存

3. **新建 MyDraftsPage**（`apps/web/src/features/article/MyDraftsPage.tsx`）：queryKey `['my-drafts']`，支持分页、继续编辑（跳 `/editor/:id`）、删除草稿。路由 `/drafts`，MainLayout 头像下拉菜单 + 移动端导航均有入口。

4. **编辑器集成标签选择器**：`useQuery(['tags'])` 获取全量标签，渲染为可点击的 chip 列表，选中态蓝底 + ✓，数据存储到 `selectedTagIds` 状态。保存草稿和发布时均携带 `tagIds`。

5. **UpdateArticleDto 增加 status 字段**：支持从草稿页直接发布（`PUT /articles/:id` + `status: 'PUBLISHED'`）。`update()` 方法的 optimistic lock SQL 新增 `status` 和 `published_at` 字段，DRAFT → PUBLISHED 时自动设置 `publishedAt`。

### 15.11 点击编辑按钮不回填标题/内容/标签

**问题描述：** 从文章详情页点击"编辑"按钮进入编辑器，标题、正文、标签全部为空。

**根因分析：** 重写编辑器时将 `useSearchParams` 改为 `useParams` 取 `editId`，但 `ArticleDetailPage` 的编辑链接仍是旧格式 `/editor?id=xxx`（query string），不匹配 `/editor/:id` 路由。导致 `editId = undefined` → `useQuery.enabled = false` → `existingArticle` 始终为空 → `useEffect` 不触发。

**修复方案：** ① `ArticleDetailPage` 的链接改为 `/editor/${article.id}`；② 编辑器同时读取 `useParams` 和 `useSearchParams`，取 `paramId || searchParams.get('id')` 作为 `editId`，兼容两种 URL 格式。`useEffect` 依赖数组增加 `editId` 确保路由参数变化时重新触发回填。

### 15.12 首页列表与文章详情页查看次数不一致

**问题描述：** 列表显示 11 次查看，点进详情页后数字不立即变 12，返回列表也没更新。两个页面都没有实时反映真实的访问量。

**根因分析（三层问题）：**

| 层级 | 问题 | 根因 |
|------|------|------|
| 后端 | 多次访问返回相同计数 | `findBySlug` 从 DB 读 `viewCount` 后固定返回 `+1`，未读取 Redis `view_buffer` 中已累积的增量 |
| 前端-详情页 | 不即时 +1 | 等后端 API 返回才更新 viewCount，用户点击后有明显延迟 |
| 前端-列表页 | 不更新 | `staleTime: 5min` 缓存策略下，详情页的实时计数不会同步到列表缓存 |

**修复方案：**

1. **后端**（`article.service.ts` → `findBySlug`）：将 `redis.incr()` 的返回值（自上次 flush 以来的累积访问次数）加到 DB `viewCount` 上返回。flush 流程不变——`ViewCountProcessor` 每 60s 将 buffer 写入 DB 并删除 Redis key。

2. **前端-点击即时乐观更新**（`ArticleCard.tsx`）：用户点击文章标题链接时，`onClick` 立即通过 `queryClient.setQueriesData` 将列表缓存和详情页缓存中该文章的 `viewCount + 1`。**不等待后端响应**，用户感知上就是即时的。后端返回真实值后 TanStack Query 自动校准缓存——如果其他用户也在看同一篇文章，真实值可能高于乐观值（如 13 > 12），此时自动覆盖。

3. **前端-详情页校准**（`ArticleDetailPage.tsx`）：`useEffect` 在 API 数据到达后再次同步列表缓存，作为乐观更新的兜底校准层。

**业内实践：** 掘金/知乎将查看次数视为"低精度高频计数器"——前端乐观 +1 + 后端 Redis buffer 批量刷写 DB + 返回真实值校准。不追求每次访问都精确写入 DB（避免大量小 UPDATE），但用户感知上必须是即时的。其他文章的查看次数不轮询，靠 `refetchOnWindowFocus` 自然刷新（切回标签页时自动 refetch）。

---

## 十六、项目技术亮点

### 16.1 JWT 双令牌 + Redis 多设备会话管理

采用 AccessToken（15min）+ RefreshToken（7d）双令牌架构，RefreshToken 存储在 Redis 中并绑定设备指纹。前端通过 FNV-1a 哈希生成稳定的浏览器指纹（7 个维度：UA + 屏幕分辨率 + 色深 + 时区 + 触控点数 + CPU 核心数 + 语言列表），刻意剔除窗口尺寸、设备像素比、IP 等易变字段。后端用 SHA-256(userId + fingerprint) 生成确定性 deviceId，同一浏览器反复登录/刷新令牌只会 HSET 覆盖同一条 Redis Hash（UPDATE 语义），不再产生重复会话。支持最多 10 台设备同时在线，超出时自动淘汰最早登录的设备。每次 RefreshToken 使用时检测令牌重用劫持，强制该设备下线。`getSessions` 接口额外按 fingerprint 分组去重，自动清理旧格式随机 UUID 孤儿会话。无指纹客户端（旧版/APP端）自动退回随机 UUID，逐步迁移无感知。

### 16.2 RBAC 四表权限模型

通过 roles / permissions / user_roles / role_permissions 四张表实现完整的基于角色的访问控制。权限数据缓存到 Redis 减少数据库查询，每次鉴权时先查缓存。支持 `:any` 到 `:own` 的自动回退策略——当用户不具备 `article:delete:any`（删除任意文章）权限时，系统自动检查 `article:delete:own`（仅删除自己的文章），实现细粒度的资源级权限控制。

### 16.3 BullMQ 异步通知管道

将通知创建逻辑从业务操作中完全解耦：点赞、评论、关注等操作只向 BullMQ 队列投递通知任务，由独立的 Worker 进程异步创建通知记录。Worker 崩溃后 BullMQ 自动重试（指数退避），保证通知不丢失。业务接口因此响应更快，通知系统故障也不会影响核心功能。

### 16.4 Prisma 7 + Driver Adapter 与 NestJS 11 ESM/CJS 兼容

Prisma 7 弃用传统 `datasource.db.url` 直连方式，改用 `@prisma/adapter-pg` Driver Adapter 模式。配合 NestJS 11 的 ESM 支持，在 `prisma.schema` 中设置 `moduleFormat: cjs` 确保生成的 Client 兼容 CJS 模块系统。这是 Prisma 7 + NestJS 11 组合的首批可落地的兼容方案之一。

### 16.5 全局异常四层兜底

设计了 BusinessException -> HttpException -> PrismaKnownError -> UnknownError 四层异常过滤链。每层都有明确的错误码和消息格式，所有异常响应携带 `requestId` 实现全链路追踪。未预期的异常会被兜底捕获并记录完整堆栈，客户端只看到通用错误消息，不泄露内部实现细节。

### 16.6 前端 401 并发安全刷新

当 AccessToken 过期时，多个并发请求可能同时收到 401 响应。通过 `isRefreshing` 标志位 + `pendingQueue` 队列机制，确保同一时刻只有一个刷新请求发出，其余请求排队等待刷新完成后自动重发。避免了重复刷新导致的 RefreshToken 失效和请求丢失问题。

### 16.7 SWR 认证状态刷新（TanStack Query）

采用 SWR（Stale-While-Revalidate）模式管理用户认证状态：页面加载时先用本地 `sessionStorage` 缓存立即渲染（零延迟），后台通过 TanStack Query 的 `useQuery` 静默调用 `GET /auth/me` 获取最新用户数据。配置 `staleTime: 5min` 避免频繁请求，`enabled: isAuthenticated` 确保未登录状态不发请求。

### 16.8 Sharp 图片处理管线

上传流程严格遵循 MIME 类型校验 -> 尺寸检测 -> resize（最大宽度 1920px）-> WebP 转码（quality 80%）的管线。不保留原始图片以节省磁盘空间。Sharp 库在 Node.js 中提供接近原生的图片处理性能，WebP 格式相比 JPEG 节省约 30%-50% 带宽。

### 16.9 Docker base + override 双文件编排

使用 `docker-compose.yml`（基础配置）+ `docker-compose.dev.yml`（开发覆盖）双文件模式，实现开发/生产环境配置分离。开发环境暴露数据库和 Redis 端口供本地工具连接，生产环境仅内网通信。所有密码类环境变量禁止设置默认值（Fail Secure），缺失时容器直接启动失败，强制外部注入。

### 16.10 Zustand sessionStorage 持久化 + resolveUploadUrl 兼容

使用 Zustand 的 `persist` 中间件将用户认证状态序列化到 `sessionStorage`，刷新页面后从缓存恢复状态避免重新登录。`resolveUploadUrl()` 工具函数智能判断 URL 类型：完整 URL 直接返回，相对路径自动拼接后端域名，兼容不同部署阶段的数据格式。

### 16.11 React Compiler 自动 memoization

引入 `babel-plugin-react-compiler`（React Compiler），自动分析组件的 props 和 state 依赖关系并插入 `memo` / `useMemo` / `useCallback` 优化。开发者无需手动编写 memoization 代码，编译器确保只有依赖变化时才触发重新渲染，显著减少不必要的渲染周期。

### 16.12 全文搜索 PL/pgSQL 触发器 + GIN 索引

通过 PostgreSQL 的 `BEFORE INSERT OR UPDATE` 触发器自动将文章标题和正文转换为 `tsvector` 类型并存储在专用列中。查询时使用 `@@ ts_query` 配合 GIN 索引实现毫秒级全文搜索，无需引入 Elasticsearch 等外部搜索引擎，降低了系统复杂度和运维成本。

### 16.13 草稿双通道保存 + 标签多选芯片 + 自由创建

编辑器将「存草稿」和「发布」拆成两条独立的 mutation 路径。草稿走 `SaveDraftDto`（全字段 `@IsOptional`，无校验），首次保存后用 `navigate(replace)` 把 URL 从 `/editor` 切换到 `/editor/:id`，后续保存直接 `PUT /:id/save-draft`，全程不刷新页面，仅用状态文字 "✓ 已保存" 反馈。发布走 `CreateArticleDto`（带 MinLength 校验），成功后跳文章详情页。额外绑定 `Ctrl/Cmd+S` 快捷键到草稿保存。编辑器兼容两种 URL 格式：`/editor/:id`（路由参数，草稿页跳转）和 `/editor?id=xxx`（查询参数，文章详情页编辑按钮）。标签选择器采用业内最佳实践（掘金/Medium/Stack Overflow 混合模式）：展示已有标签供点选，同时提供输入框让用户键入新标签名按 Enter 创建。输入时实时过滤匹配项，最多展示 10 个候选；若精确匹配已有标签则自动选中，否则创建新标签。后端 `POST /tags` 权限从 `tag:manage`（ADMIN）放宽为 `JwtAuthGuard`（任何已登录用户），允许社区自由共建标签体系。

---

## 十七、技术难点与挑战

### 17.1 Prisma 7 ESM/CJS 兼容

Prisma 7 默认生成 ESM 格式的 Client，但 NestJS 11 在某些场景下仍以 CJS 模式加载模块，导致 `ERR_REQUIRE_ESM` 错误。解决方案是在 `schema.prisma` 的 generator 中显式设置 `moduleFormat: cjs`，并使用 `@prisma/adapter-pg` 作为 Driver Adapter 替代传统的直连方式，确保生成的 Client 可以在 NestJS 的 CJS 环境中正常工作。

### 17.2 NestJS 构造函数中异步初始化陷阱

NestJS 的 `@Injectable()` 服务通过构造函数注入依赖，但构造函数不支持 `async/await`。`MailService` 中需要在启动时异步读取邮件模板文件和初始化 SMTP transporter，直接在构造函数中使用 `await` 会导致 `onModuleInit` 生命周期钩子执行时初始化尚未完成。最终通过 `onModuleInit()` 异步钩子完成初始化，确保模块加载完成后 transporter 已就绪。

### 17.3 并发点赞 TOCTOU 竞态

点赞操作本质是 toggle（不存在则创建，已存在则删除），在并发场景下存在 TOCTOU（Time-of-check to time-of-use）竞态条件：两个请求同时查到"未点赞"状态，都执行创建操作。解决方案是数据库层面添加 `(userId, articleId, type)` 唯一约束作为兜底，应用层捕获 `P2002` 唯一约束冲突后自动回退到查询状态。同时通过原子化的 `updateMany` 操作维护点赞计数，避免计数与实际记录不一致。

### 17.4 Tailwind v4 Preflight 导致密码 reveal 消失

Tailwind CSS v4 的 Preflight 基础样式重置了 `appearance: none`，导致浏览器原生的密码输入框"显示/隐藏密码"按钮（reveal toggle）被移除。用户无法通过原生 UI 切换密码可见性。解决方案是在密码输入组件上显式添加 `appearance-auto` 或使用自定义的密码可见性切换按钮替代原生功能。

### 17.5 Vite 代理 /uploads 遗漏

开发环境中 Vite 开发服务器只配置了 `/api` 代理到后端 3000 端口，但上传的图片通过 `/uploads/xxx.webp` 路径访问。请求被 Vite 当作前端静态资源处理，在 5173 端口找不到文件返回 404。修复方法是在 `vite.config.ts` 中补充 `/uploads` 代理规则指向后端。生产环境通过 Nginx 反向代理或 CDN 分发不存在此问题。

### 17.6 Zustand user 状态未持久化导致 UI 不一致

初始实现中 Zustand store 只持久化了 `isAuthenticated` 标志和 token，`user` 对象未持久化。刷新页面后 `isAuthenticated` 为 `true` 但 `user` 为 `null`，导致页面头部显示"未登录"状态而实际已登录。修复方案是将 `user` 对象一并序列化到 `sessionStorage`，并通过 `partialize` 配置只持久化必要的用户字段（id、username、avatar、role），避免存储过多数据。

### 17.7 PostgreSQL 全文搜索中英文分词策略

PostgreSQL 内置的 `english` 文本搜索配置使用 stemming 算法处理英文词形变化，但对中文完全无效（中文无空格分词）。初期使用 `simple` 配置（仅做小写化和停用词过滤）作为折中方案，可以正确索引中文字符但无法实现词干提取。理想的中文搜索需要安装 `zhparser` 扩展配合 `pg_jieba` 分词，但这增加了部署复杂度，当前版本使用 `simple` 配置满足基本搜索需求。

### 17.8 Docker 多阶段构建中 Prisma generate 的时机

在 Docker 多阶段构建中，`prisma generate` 必须在 `pnpm install` 之后执行（需要 `@prisma/client` 依赖已安装），但又必须在 `pnpm build` 之前完成（TypeScript 编译需要引用生成的 Client 类型）。如果顺序错误会导致构建阶段找不到 Prisma Client 类型定义。正确的 Dockerfile 顺序是：install dependencies -> copy prisma schema -> prisma generate -> build application。

---

## 十八、待补充与改进方向

### 18.1 WebSocket 实时通知

当前通知系统采用客户端轮询方式定期查询未读通知数量，存在延迟和资源浪费。未来计划接入 Socket.IO 实现服务端推送，用户在线时通知实时到达，离线时降级为下次登录时批量推送。需要考虑 WebSocket 连接管理、断线重连、消息确认等机制。

### 18.2 单元测试 / E2E 测试覆盖

当前项目缺少系统化的测试覆盖。计划使用 Jest 进行单元测试（Service 层业务逻辑、工具函数），使用 Supertest 进行 E2E 测试（API 端到端流程）。目标覆盖率达到 80%，重点覆盖认证流程、权限校验、并发操作等核心路径。需要配置测试数据库和 Mock 外部依赖（Redis、邮件服务）。

### 18.3 CI/CD 流水线

目前部署依赖手动操作，计划搭建 GitHub Actions 自动化流水线：代码推送触发 lint + 类型检查 -> 运行测试 -> 构建 Docker 镜像 -> 推送到镜像仓库 -> SSH 部署到服务器。需要配置环境变量管理、部署回滚机制、多环境（staging/production）隔离。

### 18.4 Winston 结构化日志

当前使用 `console.log` 输出日志，缺乏结构化和持久化能力。计划引入 Winston 日志库，输出 JSON 格式的结构化日志（包含 timestamp、level、requestId、module 等字段），生产环境写入文件并按天轮转。长期目标是对接 ELK（Elasticsearch + Logstash + Kibana）实现集中化日志检索和分析。

### 18.5 Prometheus + Grafana 监控指标

当前缺乏系统级的性能监控和告警。计划接入 Prometheus 采集关键指标（接口 QPS、响应时间 P99/P95、错误率、数据库连接池使用率），使用 Grafana 构建可视化仪表盘。设置告警规则（如错误率超过 5% 触发通知），实现故障的快速发现和定位。

### 18.6 CDN/OSS 静态资源迁移

当前上传的头像和文章封面图存储在服务器本地磁盘，通过 NestJS 的 `ServeStaticModule` 提供访问。这种方式不适合多实例部署且占用服务器带宽。计划迁移到对象存储（如阿里云 OSS、AWS S3），上传接口直接返回 CDN 加速域名 URL，减轻 API 服务器压力并提升全球访问速度。

### 18.7 国际化 i18n

当前系统仅支持中文界面。计划引入 i18n 国际化方案（前端使用 `react-i18next`，后端 API 错误消息支持多语言），实现中英文双语切换。需要抽离所有硬编码的文本字符串，建立翻译资源文件，根据用户浏览器语言或偏好设置自动切换语言。

### 18.8 API 版本化策略

当前所有 API 统一使用 `/api/v1` 前缀，但未规划版本迭代策略。未来引入 breaking changes 时需要 `/api/v2` 平滑过渡：v1 和 v2 并行运行一段时间，通过 Nginx 路由分发，给客户端足够的迁移窗口。需要考虑版本间的数据格式兼容、废弃版本的下线计划、文档同步更新等问题。
