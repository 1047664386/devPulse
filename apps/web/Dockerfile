# ─── Stage 1: Build ──────────────────────────────────────
FROM node:22-alpine AS builder

RUN corepack enable && corepack prepare pnpm@latest --activate

# Use China npm mirror for faster downloads
RUN pnpm config set registry https://registry.npmmirror.com

WORKDIR /app

COPY pnpm-workspace.yaml package.json pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json

RUN pnpm install --frozen-lockfile --filter web

COPY apps/web/ apps/web/

RUN cd apps/web && pnpm build

# ─── Stage 2: Nginx static server ────────────────────────
FROM nginx:1.27-alpine AS runner

# Remove default site
RUN rm -rf /usr/share/nginx/html/*

# Copy built static files
COPY --from=builder /app/apps/web/dist /usr/share/nginx/html

# Copy custom nginx config (for SPA fallback)
COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
