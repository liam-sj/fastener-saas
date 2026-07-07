# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant SaaS ERP for the fastener (紧固件) industry. Business flow: **quotation → order → purchase → inbound → delivery → settlement**.

## Commands

```bash
pnpm run start:dev          # Development with hot reload (port 3000)
pnpm run build              # Production build
pnpm run start:prod         # Run production build
pnpm run test               # Unit tests (Jest)
pnpm run test:e2e           # E2E tests
pnpm run lint               # ESLint
pnpm run format             # Prettier

npx prisma migrate dev       # Create and apply migration
npx prisma db seed           # Seed database
npx prisma migrate deploy    # Apply migrations in production (used in entrypoint.sh)
```

## Architecture

### Multi-Tenant Isolation

Tenant isolation uses Node.js `AsyncLocalStorage` (not Prisma middleware). The flow:

1. **TenantContextService** (`src/common/services/tenant-context.service.ts`) — wraps `AsyncLocalStorage<TenantStore>` with `run()`, `getTenantId()`, `getTenantIdOrThrow()`.
2. **TenantInterceptor** (`src/common/interceptors/tenant.interceptor.ts`) — registered as `APP_INTERCEPTOR` in `AppModule`. Extracts `tenantId`/`userId`/`role` from `req.user` (set by JWT auth) and runs the request pipeline inside `tenantCtx.run(...)`.
3. **Every service** calls `this.tenantCtx.getTenantIdOrThrow()` and passes `tenantId` explicitly in Prisma `where` clauses. There is no implicit tenant filtering — each query must include `tenantId` in its `where`.

There is also a `TenantMiddleware` (`src/common/middlewares/tenant.middleware.ts`) but it is **not registered** in `AppModule`; the interceptor is the active mechanism.

### Auth

- Global `JwtAuthGuard` registered as `APP_GUARD` in `AppModule`.
- JWT payload: `{ sub: userId, tenantId, role }`. Validated in `JwtStrategy.validate()` which returns `{ userId, tenantId, role }` to `req.user`.
- `@Public()` decorator (from `src/common/decorators/public.decorator.ts`) bypasses the guard — apply to login/register routes.
- No refresh token rotation; `/api/auth/refresh` just re-signs a new access token.

### Response & Error Handling

- **ResponseInterceptor** wraps all successful responses in `ApiResponse.ok(data)` → `{ code: 0, message: "success", data }`.
- **GlobalExceptionFilter** catches everything: NestJS `HttpException`, Prisma known errors (`P2002` → duplicate, `P2025` → not found), and unknown errors.
- Error codes defined in `src/common/constants/error-codes.ts` (`ErrorCode` enum).

### Global Modules

Both `PrismaModule` and `CommonModule` are `@Global()`, so every module can inject `PrismaService` and `TenantContextService` without importing them.

### Document Number Generation

`generateNo(prisma, prefix, tenantId)` in `src/common/utils/no-generator.ts` produces numbers like `SO-20260707-001`. Prefixes: `BJ` (quotation), `SO` (order), `PO` (purchase), `IN` (inbound), `DO` (delivery). Format: `{prefix}-{YYYYMMDD}-{3-digit-seq}`.

### Business Flow (order.service.ts)

When creating an order:
1. For each line item, check if the SKU has enough stock.
2. **stock**: deduct stock immediately, set `source = 'stock'`.
3. **custom** (insufficient stock): set `source = 'custom'` — later triggers purchase order generation.
4. Order revisions (`add`/`modify`/`remove`) are tracked in `order_revisions` with `beforeData`/`afterData` snapshots.
5. Removing a `stock` item restores the unreleased quantity back to inventory.

### Prisma Adapter

Uses `@prisma/adapter-pg` with a raw `pg.Pool` (Prisma v7 pattern), initialized in `PrismaService` constructor.

### Module Pattern

Every business module follows NestJS convention: `*.module.ts`, `*.controller.ts`, `*.service.ts`, plus a `dto/` directory. Services inject `PrismaService` and `TenantContextService`, call `getTenantIdOrThrow()` at the top of each method.

## Docker

```bash
# Development
docker compose up -d

# Production
docker compose -f docker-compose.prod.yml up -d --build
# First deploy: seed manually (not auto because seed is not idempotent)
docker compose -f docker-compose.prod.yml exec app node dist/prisma/seed.js
```

The entrypoint (`entrypoint.sh`) waits for DB, runs `prisma migrate deploy`, then starts the app.
