# ─── Stage 1: Build ──────────────────────────────────────
FROM node:22-alpine AS builder

RUN npm config set registry https://registry.npmmirror.com && npm install -g pnpm@latest
RUN pnpm config set registry https://registry.npmmirror.com \
    && pnpm config set fetch-timeout 600000 \
    && pnpm config set fetch-retries 5 \
    && pnpm config set fetch-retry-mintimeout 30000 \
    && pnpm config set fetch-retry-maxtimeout 120000

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
