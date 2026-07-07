FROM node:20-alpine AS builder

WORKDIR /app

# 启用 corepack 并用项目 package.json 的 packageManager 字段指定 pnpm 版本
RUN corepack enable && corepack prepare pnpm@10.15.0 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm run build

# ────────────────────────────────────────

FROM node:20-alpine AS runner

WORKDIR /app

# runner 阶段仍需 prisma CLI（用 npx 调用），node 自带 npx，无需额外装 pnpm
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package.json ./package.json
COPY --from=builder /app/src/prisma ./src/prisma
COPY --from=builder /app/prisma.config.ts ./prisma.config.ts
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

CMD ["/app/entrypoint.sh"]