# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Multi-tenant SaaS ERP for the fastener (紧固件) industry. Business flow: **purchase request → quotation (multi-version) → order → production (custom items) → delivery → settlement**.

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

`generateNo(prisma, prefix, tenantId)` in `src/common/utils/no-generator.ts` produces numbers like `SO-20260707-001`. Prefixes: `PR` (purchase request), `BJ` (quotation), `SO` (order), `PO` (purchase), `MO` (production order), `IN` (inbound), `DO` (delivery). Format: `{prefix}-{YYYYMMDD}-{3-digit-seq}`.

### Business Flow (order.service.ts)

The full business flow is: **PurchaseRequest → Quotation (multi-version) → Order → ProductionOrder/ProcessStep (custom items) → DeliveryOrder → Settlement**.

When creating an order:
1. For each line item, check if the SKU has enough stock.
2. **stock**: deduct stock immediately, set `source = 'stock'`.
3. **custom** (insufficient stock): set `source = 'custom'` — later triggers production order creation.
4. Order revisions (`add`/`modify`/`remove`) are tracked in `order_revisions` with `beforeData`/`afterData` snapshots.
5. Removing a `stock` item restores the unreleased quantity back to inventory.

### Order State Machine

```
accepted → sourcing → producing → ready_to_ship → partial_delivered → delivered → completed
                                                                        ↘ cancelled (any stage)
```

- Orders with all stock items skip to `ready_to_ship` directly.
- Orders with custom items go through `sourcing`/`producing` as production orders progress.
- `ProductionService.syncOrderStatus()` auto-advances order status when production orders complete.
- `SettlementService.reconcile()` auto-transitions to `completed` when `paidAmount >= totalAmount`.

### Production Flow (production.service.ts)

Custom items (`source = 'custom'`) get a 1:1 `ProductionOrder` with a chain of `ProcessStep` records:
- 4 stages: `preparation` → `forming` → `threading` → `post_treatment` (fixed order)
- 8 step types: `feeding`, `turning`, `milling`, `grinding`, `drilling`, `rolling`, `heat_treatment`, `surface_treatment`
- Steps are created on-demand (not all 8), validated for sequence continuity and stage ordering.
- `completedQty` on the last step becomes the shippable quantity for custom items.

### Delivery Validation (delivery.service.ts)

- Stock items: shippable = `qty - deliveredQty`
- Custom items: shippable = `ProductionOrder.completedQty - already delivered`
- Order must be in `ready_to_ship` or `partial_delivered` status to create deliveries.
- Concurrent shipping uses atomic `updateMany` with `deliveredQty` condition to prevent overshipping.

### Purchase Order Purposes

Purchase orders have a `purpose` field:
- `material`: buying raw materials for a process step (linked via `processStepId`)
- `outsource`: outsourcing a processing step (linked via `processStepId`)
- `finished_goods`: buying finished goods to fulfill an order item (linked via `orderItemId`)

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
