---
AIGC:
    Label: "1"
    ContentProducer: 001191110102MACQD9K64018705
    ProduceID: 7628597989082153256-data_volume/files/所有对话/主对话/文档输出/紧固件SaaS系统方案设计.md
    ReservedCode1: ""
    ContentPropagator: 001191110102MACQD9K64028705
    PropagateID: 1238521382705363#1783345171354
    ReservedCode2: ""
---
# 紧固件行业多租户SaaS系统 — 方案设计文档

> 版本：V1.0 | 日期：2026-07-06 | 状态：方案讨论阶段

---

## 一、技术选型

| 层级 | 技术 | 说明 |
|------|------|------|
| 后端框架 | NestJS + TypeScript | 强制模块化、依赖注入、TypeScript原生支持 |
| ORM | Prisma | 类型安全、自动迁移、Extension机制实现租户过滤 |
| 前端 | React + Ant Design Pro | 成熟企业级后台方案 |
| 数据库 | PostgreSQL 16 | JSONB灵活存储、行级安全策略(RLS)、多租户性能优 |
| 缓存 | Redis（可选，后续接入） | 初期可不装，代码预留降级；后续接入用于Session/权限缓存/限流 |
| 部署 | Docker + Docker Compose（仅服务器部署） | 本地开发直接装PG，无需Docker；部署到服务器时一键启动 |

---

## 二、项目结构

```
fastener-saas/
├── backend/
│   ├── src/modules/
│   │   ├── auth/          # JWT认证
│   │   ├── tenant/        # 租户管理
│   │   ├── user/          # 用户管理
│   │   ├── customer/      # 客户管理
│   │   ├── supplier/      # 供应商管理
│   │   ├── product/       # 商品（SPU+SKU）
│   │   ├── quotation/     # 报价单
│   │   ├── order/         # 销货订单
│   │   ├── purchase/      # 采购单
│   │   ├── inventory/     # 库存（入库+出库）
│   │   └── settlement/    # 对账结算
│   ├── src/common/        # 公共组件
│   └── package.json
├── frontend/              # React管理后台
└── docker-compose.yml     # 一键启动（仅服务器）
```

---

## 三、多租户方案

### 3.1 方案选择：共享数据库 + tenant_id 字段

所有租户共用一个数据库，通过每条记录的 tenantId 字段区分归属。最简单、成本最低，适合当前阶段。

### 3.2 多租户工具包：`@lexmata/nestjs-multi-tenant`

使用社区成熟的多租户模块，零依赖，基于 AsyncLocalStorage 实现租户上下文，支持从 JWT token 自动提取租户信息。

**核心能力：**
- 支持多种提取策略：JWT、Header、Subdomain、Path、Cookie、自定义
- TenantContextService：在任意 Service 中注入即可获取当前 tenantId
- TenantGuard + @CurrentTenant() 装饰器：控制器层声明式获取租户
- 支持租户解析缓存，减少数据库查询
- 支持路由排除（如健康检查等公开接口）
- 支持异步配置，可从外部源加载配置

**集成方式：**
- 在 AppModule 中配置 `MultiTenantModule.forRoot()`，使用 JWT 提取策略
- JWT payload 中包含 tenantId 字段，登录后自动携带
- 业务 Service 中注入 TenantContextService，查询时自动带 tenantId
- 配合 Prisma 使用，在 Repository 层手动传入 tenantId 过滤（Prisma Extension 可作为后续增强）

### 3.3 租户上下文流转

```
客户端登录 → JWT签发（payload含tenantId）
  ↓
后续请求携带JWT → MultiTenantModule从JWT提取tenantId
  ↓
TenantContextService注入AsyncLocalStorage → 整个请求链路可获取tenantId
  ↓
业务Service查询时 → tenantCtx.getTenantId() → Prisma where条件带tenantId
```

---

## 四、数据模型设计

### 4.1 基础模块

| 模型 | 核心字段 | 说明 |
|------|----------|------|
| Tenant | id / name / contact / phone / status | 租户（公司），系统最顶层隔离单位 |
| User | tenantId / username / password / role | 用户，关联租户，角色：admin/manager/staff |
| Customer | tenantId / name / contact / phone / address | 客户，关联租户 |
| Supplier | tenantId / name / contact / phone / address | 供应商，关联租户 |

### 4.2 商品模块（SPU + SKU 三层结构）

| 模型 | 核心字段 | 说明 |
|------|----------|------|
| Category | name / parentId / specTemplate(JSONB) | 分类，支持多级，specTemplate定义规格维度模板 |
| Product | categoryId / name / description / images / tags | SPU，商品页面，负责展示 |
| Sku | productId / attributes(JSONB) / skuCode / price / stock | SKU，具体规格，负责交易 |

**设计原则：**
- 不同品类的规格属性用 JSONB 灵活存储，不同品类属性维度不同
- SKU 不复用：每个 Product 下独立管理 SKU
- 同商品下 `@@unique([productId, skuCode])` 防止重复 SKU
- SKU 编码自动生成：品类缩写-规格-材质-表面处理，如 BLT-M8x30-304-ZN

### 4.3 报价单模块

- **Quotation**：报价单头（单号/客户/总金额/状态/有效期）
- 报价明细 items 用 JSONB 存储（productId/skuId/skuCode/productName/attrs/qty/unitPrice/amount）
- 状态流转：draft → sent → accepted / rejected
- 一个报价单可生成多个销货订单

### 4.4 销货订单模块（核心）

| 模型 | 核心字段 | 说明 |
|------|----------|------|
| Order | orderNo / quotationId / customer / totalAmount / paidAmount / status | 订单头 |
| OrderItem | 快照字段 / qty / deliveredQty / source / purchaseOrderId | 订单明细 = 对账最小单位 |
| OrderRevision | type(add/modify/remove) / beforeData / afterData / reason | 订单变更记录 |

**OrderItem 关键设计：**
- 快照字段：productName/skuCode/skuAttrs，防止商品修改后历史订单数据不一致
- source 标记：stock（现货）/ custom（需采购），下单时自动按库存分流
- deliveredQty 跟踪每个条目的发货进度，支持分批发货
- purchaseOrderId 关联采购单，custom 条目自动触发采购
- OrderItem 是对账最小单位，支持按条目引用（非按单据）

### 4.5 采购单模块

- **PurchaseOrder**：采购单头（单号/供应商/总金额/状态/预计到货日期）
- **PurchaseOrderItem**：采购明细（商品快照/数量/已到货数量/供应商报价）
- 由订单 custom 条目自动生成，也支持手动创建
- 状态：pending → confirmed → partial_received → received

### 4.6 入库单模块

- **InboundOrder**：入库单（关联采购单/明细JSON/状态/操作人）
- 采购到货 → 创建入库单 → 确认上架 → 更新 Sku.stock

### 4.7 发货单模块

- **DeliveryOrder**：发货单（关联订单/物流公司/物流单号/状态）
- **DeliveryItem**：发货明细，每个条目关联一个 OrderItem
- 一个订单可创建多张发货单，支持分批发货
- 通过 DeliveryItem.orderItemId 关联 OrderItem，实现按条目对账

---

## 五、核心业务流程

### 5.1 主流程

```
客户询价
  ↓
创建报价单（定制件需多方询价后综合估算）
  ↓
客户确认报价 → 生成销货订单
  ↓
系统逐条检查库存，自动分流：
  ├─ 现货条目 → 锁定库存 → 待发货
  └─ 需采购条目 → 自动生成采购单 → 供应商发货 → 入库 → 待发货
  ↓
生成发货单（可多次分批）→ 客户签收
  ↓
按 OrderItem 逐条对账 → 收款 → 订单完成
```

### 5.2 订单变更流程

- **增项**：新增 OrderItem → 检查库存 → 无库存的自动触发采购单生成
- **改项**：修改已有 OrderItem → 记录 OrderRevision → 差额部分走补货或退换
- **减项**：标记 OrderItem 取消 → 释放已占库存

所有变更记录在 OrderRevision，保证可追溯。按条目对账不受订单变更影响。

### 5.3 分批发货场景

- 料厂原料不足 → 先加工现有原料的 7000 个 → 发货
- 后续补料继续加工剩余 3000 个 → 第二次发货
- 一个订单对应多张发货单，通过 OrderItem.deliveredQty 跟踪进度
- 订单状态：全部发完 → delivered；部分发完 → partial_delivered

### 5.4 对账机制

- 对账以 OrderItem 为最小单位，不是按整张订单
- 每个 DeliveryItem 关联一个 OrderItem，可追溯每条的发货情况
- 增项/改项后，新条目自动进入对账队列，已对账的条目不受影响
- 同一订单大概率在同一合同内，按条引用保证对账灵活

---

## 六、单号生成规则

| 单据类型 | 编号格式 | 示例 |
|----------|----------|------|
| 报价单 | BJ-{YYYYMMDD}-{3位序号} | BJ-20260706-001 |
| 销货订单 | SO-{YYYYMMDD}-{3位序号} | SO-20260706-001 |
| 采购单 | PO-{YYYYMMDD}-{3位序号} | PO-20260706-001 |
| 入库单 | IN-{YYYYMMDD}-{3位序号} | IN-20260706-001 |
| 发货单 | DO-{YYYYMMDD}-{3位序号} | DO-20260706-001 |

---

## 七、种子数据

- 默认租户："紧固件工厂"
- 管理员账号：admin / admin123
- 基础分类：螺栓、螺钉、螺母、垫圈、牙条/丝杆
- 每个分类预置 3-5 个常见商品（SPU），每个商品下预置多个 SKU
- 总计 50+ SKU 数据

---

## 八、约束与规范

1. 所有查询通过 TenantContextService 获取 tenantId，手动传入 Prisma where 条件
2. 超级管理员可通过路由排除跳过租户过滤
3. 敏感操作（删除、修改订单）必须记录操作日志
4. 金额字段统一用 Decimal，前端传来的是 string
5. 所有 API 加 class-validator 参数校验
6. 错误统一由全局异常过滤器处理
7. 统一响应格式：`{ code, message, data }`
8. Redis 初期不接入，代码层预留缓存抽象层，无 Redis 时降级为直连数据库；后续接入时零改动切换

---

## 九、实施步骤

1. 初始化 NestJS 项目，安装依赖
2. 编写 Prisma Schema，执行数据库迁移
3. 实现 TenantContext + TenantMiddleware + TenantGuard
4. 实现 Auth 模块（注册/登录/JWT策略/token刷新）
5. 实现 Tenant、User、Customer、Supplier 基础 CRUD
6. 实现 Product 模块（Category + Product + SKU）
7. 实现 Quotation 报价单模块
8. 实现 Order 模块（库存分流/变更/分批发货）
9. 实现 Purchase 采购模块
10. 实现 Inventory 库存模块（入库/出库/库存锁定）
11. 实现 Settlement 对账模块
12. 编写种子数据脚本
13. 编写 Docker Compose，验证一键启动

---

> 本内容由 Coze AI 生成，请遵循相关法律法规及《人工智能生成合成内容标识办法》使用与传播。
