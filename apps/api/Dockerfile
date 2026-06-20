# ─── Stage 1: Build ──────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm config set registry https://registry.npmmirror.com && npm install -g pnpm@latest
RUN pnpm config set registry https://registry.npmmirror.com \
    && pnpm config set fetch-timeout 600000 \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-retry-mintimeout 30000 \
    && pnpm config set fetch-retry-maxtimeout 120000

# Prisma engine mirror for China
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

WORKDIR /app

# Copy workspace root files for pnpm install
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma/

# Install all dependencies (including devDependencies for build)
RUN pnpm install --frozen-lockfile --filter api

# Copy ALL source code at once
COPY apps/api/ apps/api/

# Generate Prisma Client & build
RUN cd apps/api && npx prisma generate && pnpm exec nest build && ls -la dist/

# ─── Stage 2: Production ─────────────────────────────────
FROM node:22-alpine AS runner

RUN npm config set registry https://registry.npmmirror.com && npm install -g pnpm@latest \
    && apk add --no-cache curl
RUN pnpm config set registry https://registry.npmmirror.com \
    && pnpm config set fetch-timeout 600000 \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-retry-mintimeout 30000 \
    && pnpm config set fetch-retry-maxtimeout 120000

# Prisma engine mirror for China
ENV PRISMA_ENGINES_MIRROR=https://registry.npmmirror.com/-/binary/prisma

WORKDIR /app

# Copy workspace root files
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma/

# Install production dependencies only
RUN pnpm install --frozen-lockfile --filter api --prod

# Copy built artifacts from builder
COPY --from=builder /app/apps/api/dist apps/api/dist/
COPY --from=builder /app/apps/api/src/generated apps/api/src/generated/
# Copy prisma config (JS version for production, no ts-node needed)
COPY apps/api/prisma.config.js apps/api/prisma.config.js

# Create uploads directory
RUN mkdir -p apps/api/uploads

WORKDIR /app/apps/api

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/docs || exit 1

CMD ["sh", "-c", "./node_modules/.bin/prisma migrate deploy && node dist/src/main"]
