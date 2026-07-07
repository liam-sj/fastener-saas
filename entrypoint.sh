#!/bin/sh
# 容器启动入口：先执行数据库迁移（幂等），再启动 NestJS
# seed 数据不幂等（用 create 而非 upsert），需要首次部署后手动执行一次：
#   docker compose -f docker-compose.prod.yml exec app node dist/prisma/seed.js

set -e

echo "==> 等待数据库就绪..."
# 给 postgres 一点启动缓冲时间，避免首次启动时 migrate 先于 pg 就绪
sleep 3

echo "==> 执行 Prisma migrate deploy..."
npx prisma migrate deploy

echo "==> 启动 NestJS 应用..."
exec node dist/src/main