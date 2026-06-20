1、nest/docker-compose.yml（复刻学习版，仅隔离标识修改，逻辑完全对齐原版）
yaml
# ── Production baseline ──
# Dev usage:  docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
# Prod usage: docker compose up -d (DB/Redis ports NOT exposed to host)

services:
  postgres:
    image: postgres:16-alpine
    container_name: devpulse-study-db
    restart: unless-stopped
    environment:
      POSTGRES_USER: ${POSTGRES_USER:-devpulse_study}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}       # No fallback — must be injected
      POSTGRES_DB: ${POSTGRES_DB:-devpulse_study}
    volumes:
      - postgres_study_data:/var/lib/postgresql/data
    networks:
      - devpulse-study-net
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-devpulse_study}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: devpulse-study-redis
    restart: unless-stopped
    command: ["redis-server", "--requirepass", "${REDIS_PASSWORD}"]
    volumes:
      - redis_study_data:/data
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

volumes:
  postgres_study_data:
  redis_study_data:

networks:
  devpulse-study-net:
    driver: bridge
2、nest/docker-compose.dev.yml（开发端口偏移，不占用原版 5432/6379）
yaml
# ── Dev overrides ──
# Exposes DB/Redis ports for local tools (pgAdmin, RedisInsight, etc.)
# Usage: docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

services:
  postgres:
    ports:
      - "${POSTGRES_PORT:-5433}:5432"

  redis:
    ports:
      - "${REDIS_PORT:-6380}:6379"
3、nest/.env（compose 全局环境变量，账号库名全部隔离）
env
# Docker Compose environment variables
# Copy .env.example to .env and adjust values as needed

POSTGRES_USER=devpulse_study
POSTGRES_PASSWORD=devpulse123
POSTGRES_DB=devpulse_study
POSTGRES_PORT=5433

REDIS_PASSWORD=devpulse_redis_study
REDIS_PORT=6380
4、nest/apps/api/.env（Api 业务连接配置，端口 / 账号 / 库同步替换）
env
# Database (docker-compose and app share these values)
POSTGRES_USER=devpulse_study
POSTGRES_PASSWORD=devpulse123
POSTGRES_DB=devpulse_study
DATABASE_URL=postgresql://devpulse_study:devpulse123@localhost:5433/devpulse_study

# Redis
REDIS_HOST=localhost
REDIS_PORT=6380
REDIS_PASSWORD=devpulse_redis_study

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

# Email (optional, dev only)
SMTP_HOST=127.0.0.1
SMTP_PORT=1025
精准改动对照清单
容器名称
devpulse-db → devpulse-study-db
devpulse-redis → devpulse-study-redis
数据卷
postgres_data → postgres_study_data
redis_data → redis_study_data
网桥网络
devpulse-net → devpulse-study-net
PG 默认用户、默认库：devpulse → devpulse_study
宿主机端口偏移
PG：5432 → 5433
Redis：6379 → 6380
Redis 密码加区分后缀 devpulse_redis → devpulse_redis_study
Prisma DATABASE_URL 内账号、密码、端口、库全部同步匹配
其余所有镜像、资源限制、健康检查、重启策略、注释、文件结构完全和原版一字不差，保证架构学习一致，只是物理隔离两套环境。
启动初始化步骤
bash
运行
# 拉起学习版数据库+Redis
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 进入api目录初始化库结构
cd apps/api
npm run db:migrate -- --name init
npm run db:generate
npm run db:seed

# 启动nest服务
npm run dev