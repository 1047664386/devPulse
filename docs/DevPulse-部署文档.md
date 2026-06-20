# DevPulse — 生产环境部署指南

**部署方案：** 单台 VPS + Docker Compose + Nginx 反向代理  
**适用环境：** 阿里云 / 腾讯云 / AWS / DigitalOcean 等 2C4G 以上 VPS  
**最后更新：** 2026-06-20

---

## 目录

- [一、部署架构总览](#一部署架构总览)
- [二、服务器准备](#二服务器准备)
- [三、项目构建与部署](#三项目构建与部署)
- [四、数据库初始化](#四数据库初始化)
- [五、HTTPS 配置](#五https-配置)
- [六、运维与监控](#六运维与监控)
- [七、更新与回滚](#七更新与回滚)
- [八、常见问题排查](#八常见问题排查)

---

## 一、部署架构总览

```
                    ┌─────────────────────────────────────────────┐
                    │              VPS (2C4G+)                     │
                    │                                              │
                    │  ┌─────────┐    ┌──────────────────────────┐│
  客户端 ── HTTPS ──▶│  │  Nginx  │───▶│  web (前端 SPA 静态文件)  ││
                    │  │  :80/443│    └──────────────────────────┘│
                    │  │         │    ┌──────────────────────────┐│
                    │  │         │───▶│  api (NestJS :3000)      ││
                    │  │         │    │  ├─ Prisma → PostgreSQL  ││
                    │  └─────────┘    │  ├─ ioredis → Redis      ││
                    │                 │  └─ BullMQ → Redis       ││
                    │                 └──────────────────────────┘│
                    │                 ┌──────────────────────────┐│
                    │                 │  PostgreSQL 16 (内网)    ││
                    │                 │  Redis 7 (内网)          ││
                    │                 └──────────────────────────┘│
                    │                                              │
                    │  volumes: postgres_data / redis_data / uploads_data
                    └─────────────────────────────────────────────┘
```

**容器清单（共 5 个）：**

| 容器 | 镜像 | 端口 | 职责 |
|------|------|------|------|
| `devpulse-nginx` | nginx:1.27-alpine | 80/443→宿主机 | 反向代理、SSL 终止、静态文件 |
| `devpulse-web` | 自建（nginx:1.27-alpine） | 80（内网） | 前端 SPA 静态文件 |
| `devpulse-api` | 自建（node:22-alpine） | 3000（内网） | NestJS 后端服务 |
| `devpulse-db` | postgres:16-alpine | 5432（内网） | PostgreSQL 数据库 |
| `devpulse-redis` | redis:7-alpine | 6379（内网） | Redis 缓存 + BullMQ 队列 |

**文件结构：**

```
DevPulse/
├── docker-compose.prod.yml      # 生产编排
├── .env                          # 生产环境变量（git 忽略）
├── docker/
│   └── nginx/
│       └── nginx.conf            # Nginx 反向代理配置
├── apps/
│   ├── api/
│   │   ├── Dockerfile            # 后端多阶段构建
│   │   └── .dockerignore
│   └── web/
│       ├── Dockerfile            # 前端多阶段构建
│       ├── nginx.conf            # SPA fallback 配置
│       └── .dockerignore
```

---

## 二、服务器准备

### 2.1 系统要求

最低配置：1C2G（勉强可用）。推荐配置：2C4G（日常稳定）。操作系统推荐 Ubuntu 22.04 LTS 或 Debian 12。

### 2.2 安装 Docker + Docker Compose

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装 Docker（官方脚本）
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER   # 免 sudo 运行 docker

# 验证
docker --version        # 24.x+
docker compose version  # 2.x+

# 重新登录使 docker 组生效
newgrp docker
```

### 2.3 安装 Git 并拉取代码

```bash
sudo apt install -y git
git clone https://github.com/your-org/DevPulse.git
cd DevPulse
```

### 2.4 配置防火墙

```bash
# UFW 防火墙（Ubuntu 默认）
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp     # SSH
sudo ufw allow 80/tcp     # HTTP
sudo ufw allow 443/tcp    # HTTPS
sudo ufw enable
sudo ufw status
```

### 2.5 创建生产环境变量

```bash
# 从模板创建
cp .env.prod.example .env

# 生成随机密钥
openssl rand -base64 48    # → 复制结果填入 JWT_SECRET
openssl rand -base64 48    # → 复制结果填入 JWT_REFRESH_SECRET（必须与上面不同）
```

编辑 `.env` 文件，**必须修改以下所有 `<CHANGE_ME>` 项**：

```bash
vi .env   # 或 nano .env
```

关键配置说明：

| 变量 | 说明 | 示例 |
|------|------|------|
| `POSTGRES_PASSWORD` | 数据库密码，至少 16 位随机字符串 | `xK9#mP2$vL8nQ4wR` |
| `REDIS_PASSWORD` | Redis 密码 | `rT5&jH7@bN3cF1dZ` |
| `JWT_SECRET` | AccessToken 签名密钥 | `openssl rand -base64 48` 的输出 |
| `JWT_REFRESH_SECRET` | RefreshToken 签名密钥（必须不同于 JWT_SECRET） | 另一个 `openssl rand` 的输出 |
| `ADMIN_PASSWORD` | 超级管理员初始密码 | `SecureP@ss2026!` |
| `FRONTEND_URL` | 前端域名（CORS + 重置邮件链接） | `https://devpulse.com` |
| `APP_URL` | 同源部署留空；分域部署填后端域名 | 留空或 `https://api.devpulse.com` |
| `SMTP_*` | 邮件服务配置（阿里云/腾讯企业邮） | 按服务商文档填写 |

---

## 三、项目构建与部署

### 3.1 一键启动

```bash
# 构建所有镜像并启动（首次约 3-5 分钟）
docker compose -f docker-compose.prod.yml up -d --build
```

### 3.2 验证服务状态

```bash
# 查看所有容器状态
docker compose -f docker-compose.prod.yml ps

# 预期输出（5 个容器全部 healthy/running）：
# NAME              STATUS
# devpulse-nginx    Up
# devpulse-web      Up
# devpulse-api      Up (healthy)
# devpulse-db       Up (healthy)
# devpulse-redis    Up (healthy)
```

### 3.3 查看日志

```bash
# 查看所有服务日志
docker compose -f docker-compose.prod.yml logs -f

# 只看后端日志
docker compose -f docker-compose.prod.yml logs -f api

# 只看最近 100 行
docker compose -f docker-compose.prod.yml logs --tail=100 api
```

### 3.4 验证接口可用

```bash
# 测试后端健康
curl http://localhost/api/docs

# 测试前端页面
curl -I http://localhost/

# 测试上传文件访问
curl -I http://localhost/uploads/test.webp
```

浏览器访问 `http://你的服务器IP` 即可看到前端页面。

---

## 四、数据库初始化

### 4.1 执行数据库迁移

```bash
# 应用所有 Prisma 迁移（创建表结构）
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

### 4.2 初始化种子数据（可选）

```bash
# 创建系统角色、权限、测试用户、示例文章
docker compose -f docker-compose.prod.yml exec api npx tsx prisma/seed.ts
```

种子数据包含：

| 数据 | 内容 |
|------|------|
| 系统角色 | ADMIN / AUTHOR / READER |
| 权限集合 | article:create, article:delete, user:ban 等 |
| 测试用户 | admin@devpulse.com / Admin123!（管理员）等 4 个 |
| 标签 | React / NestJS / TypeScript / PostgreSQL / Redis / Docker |
| 示例文章 | 4 篇含封面、标签、评论的完整文章 |

**注意：** 种子数据中的密码（`Admin123!` 等）仅用于测试，生产环境登录后应立即修改。

### 4.3 验证管理员登录

```bash
# 通过 API 测试登录
curl -X POST http://localhost/api/v1/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"email":"admin@devpulse.com","password":"Admin123!"}'
```

返回 `accessToken` 和 `refreshToken` 即表示初始化成功。

---

## 五、HTTPS 配置

### 5.1 域名解析

在域名服务商控制台添加 A 记录：

| 记录类型 | 主机记录 | 记录值 |
|----------|----------|--------|
| A | @ | 你的服务器 IP |
| A | www | 你的服务器 IP |
| A | api（分域部署时） | 你的服务器 IP |

### 5.2 Let's Encrypt 证书

```bash
# 安装 certbot
sudo apt install -y certbot

# 先停掉 Nginx 容器（释放 80 端口给 certbot 验证）
docker compose -f docker-compose.prod.yml stop nginx

# 申请证书
sudo certbot certonly --standalone -d your-domain.com -d www.your-domain.com

# 证书位置
ls /etc/letsencrypt/live/your-domain.com/
```

### 5.3 启用 HTTPS

1. 编辑 `docker/nginx/nginx.conf`：取消注释 HTTPS server 块，注释掉 HTTP 的 `return 301` 改为实际配置

2. 编辑 `docker-compose.prod.yml`：
   - 取消注释 nginx volumes 中的证书挂载行
   - 取消注释 443 端口映射

3. 重启：

```bash
docker compose -f docker-compose.prod.yml up -d --build nginx
```

### 5.4 证书自动续期

```bash
# 添加 cron 定时任务（每月 1 号凌晨 3 点续期）
sudo crontab -e

# 添加以下行：
0 3 1 * * certbot renew --pre-hook "docker compose -f /path/to/DevPulse/docker-compose.prod.yml stop nginx" --post-hook "docker compose -f /path/to/DevPulse/docker-compose.prod.yml start nginx"
```

---

## 六、运维与监控

### 6.1 常用运维命令

```bash
# 启动所有服务
docker compose -f docker-compose.prod.yml up -d

# 停止所有服务（数据保留）
docker compose -f docker-compose.prod.yml down

# 重启后端
docker compose -f docker-compose.prod.yml restart api

# 查看资源使用
docker stats --no-stream

# 进入后端容器调试
docker compose -f docker-compose.prod.yml exec api sh

# 进入数据库
docker compose -f docker-compose.prod.yml exec postgres psql -U devpulse -d devpulse

# 进入 Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli -a $REDIS_PASSWORD
```

### 6.2 数据备份

```bash
# 备份 PostgreSQL（建议每天执行，加入 crontab）
docker compose -f docker-compose.prod.yml exec postgres pg_dump -U devpulse devpulse > backup_$(date +%Y%m%d_%H%M%S).sql

# 备份 Redis
docker compose -f docker-compose.prod.yml exec redis redis-cli -a $REDIS_PASSWORD BGSAVE

# 备份上传文件
docker compose -f docker-compose.prod.yml cp api:/app/apps/api/uploads ./uploads_backup

# 自动备份脚本（加入 crontab，每天凌晨 2 点执行）
# 0 2 * * * /path/to/backup.sh
```

备份脚本示例（`backup.sh`）：

```bash
#!/bin/bash
BACKUP_DIR="/data/backups"
DATE=$(date +%Y%m%d_%H%M%S)

# 数据库备份
docker compose -f /path/to/DevPulse/docker-compose.prod.yml exec -T postgres pg_dump -U devpulse devpulse | gzip > "$BACKUP_DIR/db_$DATE.sql.gz"

# 上传文件备份
docker compose -f /path/to/DevPulse/docker-compose.prod.yml cp api:/app/apps/api/uploads "$BACKUP_DIR/uploads_$DATE"

# 保留最近 30 天备份
find "$BACKUP_DIR" -name "*.sql.gz" -mtime +30 -delete
find "$BACKUP_DIR" -name "uploads_*" -type d -mtime +30 -exec rm -rf {} +

echo "[$DATE] Backup completed"
```

### 6.3 日志管理

```bash
# Docker 默认日志会持续增长，配置日志轮转
# 编辑 /etc/docker/daemon.json：
{
  "log-driver": "json-file",
  "log-opts": {
    "max-size": "50m",
    "max-file": "3"
  }
}

# 重启 Docker 生效
sudo systemctl restart docker
```

### 6.4 资源监控

```bash
# 实时查看容器资源
docker stats

# 磁盘使用
df -h
docker system df

# 清理无用镜像（更新后旧镜像占用空间）
docker image prune -f
```

---

## 七、更新与回滚

### 7.1 更新部署

```bash
# 1. 拉取最新代码
cd DevPulse
git pull origin main

# 2. 重新构建并启动（只重建有变化的容器）
docker compose -f docker-compose.prod.yml up -d --build

# 3. 执行新迁移（如有）
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy

# 4. 清理旧镜像
docker image prune -f
```

### 7.2 回滚

```bash
# 1. 切回上一个稳定版本
git checkout v1.0.0   # 或 git log 找到稳定 commit

# 2. 重新构建
docker compose -f docker-compose.prod.yml up -d --build

# 3. 如果有数据库回滚需要（慎用，会丢数据）
docker compose -f docker-compose.prod.yml exec api npx prisma migrate deploy
```

### 7.3 零停机更新（进阶）

当前方案是单机部署，`docker compose up --build` 会有几秒停机。如果需要零停机，可以用以下方式：

```bash
# 先构建新镜像
docker compose -f docker-compose.prod.yml build api

# 再滚动更新（容器会先启动新实例再停旧实例）
docker compose -f docker-compose.prod.yml up -d --no-deps api
```

---

## 八、常见问题排查

### Q1：容器启动失败，api 报数据库连接错误

**原因：** PostgreSQL 尚未就绪时 api 已启动。

**排查：**
```bash
docker compose -f docker-compose.prod.yml logs api
docker compose -f docker-compose.prod.yml ps postgres   # 确认 healthy
```

**解决：** `docker-compose.prod.yml` 已配置 `depends_on: condition: service_healthy`，正常情况下会自动等待。如果仍然失败，检查 `DATABASE_URL` 中的主机名是否为 `postgres`（容器名）。

### Q2：前端页面能打开但接口 404

**原因：** Nginx 反向代理未正确转发 `/api` 请求。

**排查：**
```bash
# 测试后端是否存活
docker compose -f docker-compose.prod.yml exec api curl localhost:3000/api/docs

# 测试 Nginx 转发
curl http://localhost/api/docs

# 查看 Nginx 错误日志
docker compose -f docker-compose.prod.yml logs nginx
```

**解决：** 检查 `docker/nginx/nginx.conf` 中的 `upstream nestjs_backend` 地址是否为 `api:3000`。

### Q3：上传的图片访问 404

**原因：** uploads 卷未正确挂载。

**排查：**
```bash
# 查看卷内容
docker compose -f docker-compose.prod.yml exec api ls /app/apps/api/uploads/
docker compose -f docker-compose.prod.yml exec nginx ls /data/uploads/
```

**解决：** 确认 `docker-compose.prod.yml` 中 api 和 nginx 都挂载了同一个 `uploads_data` 卷。

### Q4：Redis 连接失败

**排查：**
```bash
docker compose -f docker-compose.prod.yml logs redis
docker compose -f docker-compose.prod.yml exec redis redis-cli -a $REDIS_PASSWORD ping
```

**解决：** 确认 `.env` 中的 `REDIS_PASSWORD` 与 docker-compose 中 `--requirepass` 参数一致。

### Q5：邮件发送失败

**排查：**
```bash
docker compose -f docker-compose.prod.yml logs api | grep SMTP
```

**解决：** 检查 SMTP 配置。注意许多云服务商封禁 25 端口，需要使用 465（SSL）或 587（TLS）。确认 `.env` 中 `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` 全部正确填写。

### Q6：磁盘空间不足

```bash
# 查看各目录占用
du -sh /var/lib/docker/*
docker system df

# 清理无用资源
docker system prune -af --volumes   # 危险！会删除所有未使用的镜像和卷
docker image prune -f               # 安全：只清理悬空镜像
```

---

## 附录 A：生产环境变量速查

| 变量 | 必填 | 说明 | 示例值 |
|------|------|------|--------|
| `POSTGRES_PASSWORD` | 是 | 数据库密码 | 随机 16 位+ |
| `REDIS_PASSWORD` | 是 | Redis 密码 | 随机 16 位+ |
| `JWT_SECRET` | 是 | AccessToken 密钥 | `openssl rand -base64 48` |
| `JWT_REFRESH_SECRET` | 是 | RefreshToken 密钥 | `openssl rand -base64 48` |
| `ADMIN_PASSWORD` | 是 | 管理员初始密码 | 强密码 |
| `FRONTEND_URL` | 是 | 前端域名 | `https://devpulse.com` |
| `APP_URL` | 否 | 后端对外 URL（同源留空） | `https://api.devpulse.com` |
| `SMTP_HOST` | 否 | SMTP 服务器 | `smtpdm.aliyun.com` |
| `SMTP_PORT` | 否 | SMTP 端口 | `465` |
| `SMTP_USER` | 否 | SMTP 用户名 | `noreply@devpulse.com` |
| `SMTP_PASS` | 否 | SMTP 密码 | 服务商提供 |
| `MAIL_FROM` | 否 | 发件人 | `noreply@devpulse.com` |

## 附录 B：docker-compose 文件对照

| 文件 | 用途 | 启动命令 |
|------|------|----------|
| `docker-compose.yml` | 基础设施基线（PG + Redis + Mailpit） | `docker compose up -d` |
| `docker-compose.dev.yml` | 开发覆盖（暴露端口） | `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d` |
| `docker-compose.prod.yml` | 生产完整编排（含 API + Web + Nginx） | `docker compose -f docker-compose.prod.yml up -d` |

## 附录 C：安全 Checklist

上线前逐项确认：

- [ ] `.env` 中所有 `<CHANGE_ME>` 已替换为真实强密码
- [ ] `JWT_SECRET` 和 `JWT_REFRESH_SECRET` 是两个不同的随机密钥
- [ ] `.env` 文件已加入 `.gitignore`，不会提交到版本库
- [ ] 种子数据中的测试密码已修改
- [ ] 防火墙仅开放 22/80/443 端口，数据库和 Redis 不暴露到宿主机
- [ ] SMTP 使用 465 或 587 端口（非 25）
- [ ] HTTPS 已配置，HTTP 自动跳转 HTTPS
- [ ] Nginx `nginx.conf` 中 `server_name` 已改为真实域名
- [ ] 数据备份 cron 已配置
- [ ] Docker 日志轮转已配置
