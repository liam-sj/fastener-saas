# 紧固件 SaaS 系统 — 技术规格

> 版本：V1.0 | 日期：2026-07-06 | 状态：设计已确认，待实施

---

## 一、项目概述

紧固件行业多租户 SaaS 系统 MVP，后端 NestJS API 服务。覆盖从报价到发货对账的完整业务流程。前端（React + Ant Design Pro）在后续迭代中单独开发。

**实施策略：** 先后端再前端，全部 10 个模块一齐上，分 4 个阶段交付。

---

## 二、技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端框架 | NestJS 11 + TypeScript 5.7 | 当前项目已初始化 |
| ORM | Prisma | 类型安全，自动迁移 |
| 数据库 | PostgreSQL 16 | 本地安装，端口 5432 |
| 认证 | @nestjs/jwt + bcrypt | JWT 含 tenantId + userId + role |
| 多租户 | @lexmata/nestjs-multi-tenant | AsyncLocalStorage，JWT 提取策略 |
| 缓存 | 无（代码预留抽象层） | 后续按需接入 Redis |
| 校验 | class-validator + class-transformer | 全局 ValidationPipe |
| 部署 | Docker Compose（P4） | 本地开发直连 PG |

---

## 三、项目结构

```
erp/                               # = backend，git 仓库根目录
├── src/
│   ├── common/
│   │   ├── filters/               # 全局异常过滤器
│   │   ├── interceptors/          # 统一响应格式包装
│   │   ├── pipes/                 # 校验管道
│   │   ├── decorators/            # @Public, @CurrentUser, @CurrentTenant
│   │   └── utils/
│   │       └── no-generator.ts    # 单号生成（BJ-/SO-/PO-/IN-/DO-）
│   ├── prisma/
│   │   ├── schema.prisma
│   │   └── seed.ts
│   ├── modules/
│   │   ├── auth/                  # 登录/注册/token刷新
│   │   ├── tenant/                # 租户 CRUD + 多租户上下文
│   │   ├── user/                  # 用户 CRUD
│   │   ├── customer/              # 客户 CRUD
│   │   ├── supplier/              # 供应商 CRUD
│   │   ├── product/               # Category + SPU + SKU
│   │   ├── quotation/             # 报价单（头+JSONB明细）
│   │   ├── order/                 # 销货订单（核心：分流/变更/分批）
│   │   ├── purchase/              # 采购单
│   │   ├── inventory/             # 入库单 + 发货单
│   │   └── settlement/            # 对账结算（条目级）
│   ├── app.module.ts
│   └── main.ts
├── docker-compose.yml             # P4
└── package.json
```

---

## 四、公共层设计

### 4.1 统一响应格式

```json
{ "code": 0, "message": "success", "data": {} }
```

- `code: 0` — 成功；非 0 — 异常
- 错误码：`1001` 参数校验、`1002` 未授权、`1003` 资源不存在、`2001` 业务规则限制、`9999` 未知异常
- `ResponseInterceptor` 自动包装，Controller 只 return data

### 4.2 全局异常过滤器

- HttpException → 映射到对应 code
- PrismaClientKnownRequestError（唯一约束冲突 → 2001，记录不存在 → 1003）
- 未知异常 → 9999，生产环境不暴露 stack trace

### 4.3 参数校验

- 全局 `ValidationPipe({ whitelist: true, transform: true })`
- DTO 使用 class-validator 装饰器约束

### 4.4 请求管线

```
请求 → JwtAuthGuard(全局) → 解析 tenantId/userId/role
  → TenantContextMiddleware → 写入 AsyncLocalStorage
  → ValidationPipe → Controller → Service(注入 TenantContextService)
  → Prisma where: { tenantId: ctx.getTenantId() }
  → ResponseInterceptor 包装 → 返回
```

- 公开路由用 `@Public()` 装饰器豁免 JWT 校验
- 超级管理员路由额外跳过租户过滤

---

## 五、Prisma 数据模型

### 5.1 基础模型

- **Tenant**：id / name / contact / phone / status(active|inactive) / createdAt
- **User**：tenantId / username / password(bcrypt) / role(admin|manager|staff) / @@unique([tenantId, username])
- **Customer**：tenantId / name / contact / phone / address
- **Supplier**：tenantId / name / contact / phone / address

### 5.2 商品模型（三层结构）

- **Category**：name / parentId(自引用树) / specTemplate(Json) — 定义该品类规格维度
- **Product** (SPU)：categoryId / name / description / images(String[]) / tags(String[])
- **Sku**：productId / skuCode(自动生成) / attributes(Json) / price(Decimal) / stock(Int) / @@unique([productId, skuCode])

SKU 编码格式：`品类缩写-规格值-材质-表面处理`，如 `BLT-M8x30-304-ZN`

### 5.3 业务单据模型

**报价单 Quotation**：quotationNo / customerId / items(Json) / totalAmount(Decimal) / status(draft|sent|accepted|rejected) / validUntil

**销货订单 Order**：orderNo / quotationId? / customerId / totalAmount / paidAmount / status(pending|partial_delivered|delivered|completed|cancelled)
- **OrderItem**：快照字段(productName/skuCode/skuAttrs/price) / qty / deliveredQty / source(stock|custom) / purchaseOrderId?
- **OrderRevision**：type(add|modify|remove) / beforeData(Json) / afterData(Json) / reason

**采购单 PurchaseOrder**：purchaseNo / supplierId / totalAmount / status(pending|confirmed|partial_received|received) / expectedDate
- **PurchaseOrderItem**：快照字段 / qty / receivedQty / unitPrice

**入库单 InboundOrder**：inboundNo / purchaseOrderId / items(Json) / status(pending|confirmed) / operatorId

**发货单 DeliveryOrder**：deliveryNo / orderId / logisticsCompany / trackingNo / status(pending|shipped|signed)
- **DeliveryItem**：orderItemId / qty

**对账 Settlement**：orderId / orderItemId / amount / paidAt / status(pending|paid)

### 5.4 关键关系链

```
OrderItem.source = "custom" → 自动生成 PurchaseOrder
InboundOrder.confirm → PurchaseOrderItem.receivedQty += qty → Sku.stock += qty
DeliveryItem 关联 OrderItem → 发货后累加 OrderItem.deliveredQty
Settlement 以 OrderItem 为单位对账（非整单）
```

---

## 六、分阶段实施计划

### P1：基础设施

| 任务 | 产出 |
|------|------|
| 安装依赖 | @nestjs/jwt, @nestjs/passport, bcrypt, @lexmata/nestjs-multi-tenant, prisma, @prisma/client, class-validator, class-transformer |
| Prisma Schema | 所有模型定义 + 迁移 |
| 公共层 | GlobalExceptionFilter, ResponseInterceptor, ValidationPipe, @Public/@CurrentUser 装饰器 |
| Auth 模块 | register / login / refresh，JWT 策略 |
| 多租户上下文 | MultiTenantModule 配置，TenantContextService |

**里程碑：** `POST /api/auth/login` 返回 JWT，后续请求自动携带租户上下文

### P2：基础数据

| 任务 | 产出 |
|------|------|
| Tenant/User/Customer/Supplier CRUD | 标准的 RESTful 5 端点 × 4 |
| Category 模块 | 分类树 CRUD + specTemplate 管理 |
| Product 模块 | SPU + SKU CRUD，SKU 编码自动生成 |
| 种子数据 | 默认租户 + admin/admin123 + 5 个分类 + 50+ SKU |

**里程碑：** 可创建租户下的客户和商品，种子数据载入

### P3：核心业务

| 任务 | 产出 |
|------|------|
| Quotation 模块 | 报价单 CRUD + 状态流转 + 接受报价→生成订单 |
| Order 模块 | 订单创建（库存分流）+ 变更（增/改/减 + Revision）+ 分批发货跟踪 |
| Purchase 模块 | 采购单 CRUD + 自动生成 + 状态流转 |
| Inventory 模块 | 入库单（确认→更新库存）+ 发货单（创建/发货/签收/跟踪）|

**里程碑：** 报价→订单→采购→入库→发货 完整业务主链路可跑通

### P4：收尾

| 任务 | 产出 |
|------|------|
| Settlement 模块 | 条目级对账 + 收款确认 + 汇总 |
| 种子数据完善 | 示例客户/供应商/历史数据 |
| Docker Compose | 一键启动（app + postgres） |

**里程碑：** 系统完整可用

---

## 七、API 规范

### 7.1 RESTful 约定

每个 CRUD 模块（Tenant/User/Customer/Supplier）统一：

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/{resource}` | 分页列表，?page=1&pageSize=20&keyword= |
| GET | `/api/{resource}/:id` | 详情 |
| POST | `/api/{resource}` | 创建 |
| PATCH | `/api/{resource}/:id` | 更新 |
| DELETE | `/api/{resource}/:id` | 软删除 |

### 7.2 认证路由

| 方法 | 路径 | 认证 | 说明 |
|------|------|------|------|
| POST | `/api/auth/register` | ❌ | 注册（创建租户+管理员） |
| POST | `/api/auth/login` | ❌ | 登录返回 JWT |
| POST | `/api/auth/refresh` | ✅ | 刷新 token |

### 7.3 单号生成规则

| 单据 | 前缀 | 格式 |
|------|------|------|
| 报价单 | BJ | `BJ-YYYYMMDD-###` |
| 销货订单 | SO | `SO-YYYYMMDD-###` |
| 采购单 | PO | `PO-YYYYMMDD-###` |
| 入库单 | IN | `IN-YYYYMMDD-###` |
| 发货单 | DO | `DO-YYYYMMDD-###` |

序号按天重置，数据库行级锁防并发重复。

---

## 八、约束与规范

1. 所有查询通过 TenantContextService 获取 tenantId，手动传入 Prisma where
2. 超级管理员可通过路由排除跳过租户过滤
3. 敏感操作（删除、修改订单）必须记录操作日志
4. 金额统一用 Decimal（PG `numeric(10,2)` / `numeric(12,2)`）
5. 所有 API DTO 加 class-validator 校验
6. 错误统一由全局异常过滤器处理
7. 统一响应格式 `{ code, message, data }`
8. Redis 初期不接入，代码预留缓存抽象层
9. MVP 阶段先实现功能，后续统一补测试

---

## 九、变更记录

| 日期 | 变更 | 说明 |
|------|------|------|
| 2026-07-06 | 初始设计 | 基于方案设计文档 + 多轮讨论确认 |
