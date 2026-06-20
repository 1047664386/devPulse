# ─── Stage 1: Build ──────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

# Use China npm mirror for faster downloads
RUN pnpm config set registry https://registry.npmmirror.com

WORKDIR /app

# Copy workspace root files for pnpm install
COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/prisma apps/api/prisma/

# Install dependencies (all, including dev for build)
RUN pnpm install --frozen-lockfile --filter api

# Copy source code
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/tsconfig.build.json apps/api/tsconfig.build.json
COPY apps/api/nest-cli.json apps/api/nest-cli.json
COPY apps/api/src apps/api/src/

# Generate Prisma Client & build
RUN cd apps/api && npx prisma generate && npx nest build

# ─── Stage 2: Production ─────────────────────────────────
FROM node:22-alpine AS runner

RUN corepack enable && corepack prepare pnpm@latest --activate \
    && apk add --no-cache curl

# Use China npm mirror for faster downloads
RUN pnpm config set registry https://registry.npmmirror.com

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

# Create uploads directory
RUN mkdir -p apps/api/uploads

WORKDIR /app/apps/api

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost:3000/api/docs || exit 1

CMD ["node", "dist/main"]
