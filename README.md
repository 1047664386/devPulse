# DevPulse

开发者内容社区平台 — 发布技术文章、参与讨论、关注作者、收藏内容、接收通知。

## 技术栈

| 层 | 技术 | 版本 |
|---|------|------|
| 前端 | React + Vite + TypeScript + Tailwind CSS | 19 / 8 / 6 / 4 |
| 路由 / 状态 / 请求 | React Router + Zustand + TanStack Query | 7 / 5 / 5 |
| 富文本编辑器 | TipTap | 3 |
| 后端 | NestJS + TypeScript | 11 / 5 |
| ORM | Prisma (Driver Adapter) | 7 |
| 数据库 | PostgreSQL | 16 |
| 缓存 / 队列 | Redis + BullMQ | 7 / 5 |
| 认证 | Passport + JWT（双令牌） | — |
| 容器 | Docker Compose | — |

## 项目结构

```
devpulse/
├── apps/
│   ├── api/          # NestJS 后端
│   └── web/          # React 前端
├── docs/             # 开发手册
├── docker-compose.yml        # 生产基线（PG + Redis，不暴露端口）
├── docker-compose.dev.yml    # 开发覆盖（暴露端口）
├── .env.example              # 环境变量模板
├── pnpm-workspace.yaml
└── package.json              # Monorepo 根脚本
```

## 快速开始

### 1. 前置要求

- Node.js >= 20
- pnpm >= 9
- Docker & Docker Compose

### 2. 克隆并安装

```bash
git clone <repo-url>
cd devpulse
pnpm install
```

### 3. 环境变量

```bash
cp .env.example .env
cp .env.example apps/api/.env
```

编辑 `.env`，填入安全的密码和 JWT 密钥：

- `POSTGRES_PASSWORD` — 数据库密码
- `REDIS_PASSWORD` — Redis 密码
- `JWT_SECRET` — 用 `openssl rand -base64 32` 生成
- `JWT_REFRESH_SECRET` — 同上
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` — 管理员初始账号（首次启动自动创建）

### 4. 启动基础设施

```bash
pnpm docker:up
```

这会启动 PostgreSQL 16 和 Redis 7（开发模式会暴露端口 5432 / 6379）。

### 5. 数据库初始化

```bash
# 同步 schema 到数据库
pnpm --filter api db:migrate

# 生成 Prisma Client
pnpm --filter api db:generate

# 填充种子数据（角色 + 权限 + 示例用户/文章）
pnpm db:seed
```

### 6. 启动开发服务器

```bash
# 终端 1：后端 API（http://localhost:3000）
pnpm dev:api

# 终端 2：前端（http://localhost:5173）
pnpm dev:web
```

### 7. 访问

- 前端：http://localhost:5173
- API：http://localhost:3000/api/v1
- Swagger 文档：http://localhost:3000/api/docs
- Prisma Studio：`pnpm db:studio`

## 核心功能

**用户系统** — 注册 / 登录 / JWT 双令牌（15min access + 7d refresh）/ 个人资料 / 头像上传

**文章系统** — Markdown 富文本编辑 / slug URL / 草稿-发布流程 / 乐观锁版本控制 / 阅读量 Redis 缓冲

**互动系统** — 评论（两级嵌套）/ 文章点赞 / 评论点赞 / 收藏 / 关注（全部 toggle 模式）

**通知中心** — 5 种通知类型通过 BullMQ 异步创建：文章被赞、收到评论、评论被回复、评论被赞、被关注

**RBAC 权限** — 3 个系统角色（ADMIN / AUTHOR / READER）+ 动态自定义角色 + 14 个细粒度权限 + 用户级权限缓存

**管理后台** — 仪表盘统计 / 用户管理（多角色分配 + 封禁）/ 文章管理 / 标签管理 / 角色管理 / 权限矩阵

**全文搜索** — PostgreSQL tsvector + tsquery，按 rank 排序

## 常用命令

```bash
# 开发
pnpm dev:api                # 后端 watch 模式
pnpm dev:web                # 前端 HMR
pnpm docker:up              # 启动 PG + Redis
pnpm docker:down            # 停止容器

# 数据库
pnpm db:migrate             # Prisma 迁移
pnpm db:seed                # 填充种子数据
pnpm db:studio              # Prisma Studio

# 构建
pnpm build:api              # 构建后端
pnpm build:web              # 构建前端
```

## 默认账号

种子数据创建 4 个用户（密码均为 `password123`）：

| 邮箱 | 角色 | 说明 |
|------|------|------|
| `admin@devpulse.com` | ADMIN | 管理员 |
| `alice@devpulse.com` | AUTHOR | 作者 |
| `bob@devpulse.com` | AUTHOR | 作者 |
| `reader@devpulse.com` | READER | 读者 |

> 生产环境通过 `ADMIN_EMAIL` / `ADMIN_PASSWORD` 环境变量自动引导管理员账号。

## 文档

详细的架构设计、模块说明和开发记录见 [docs/DevPulse-开发手册.md](docs/DevPulse-开发手册.md)。

## License

MIT
