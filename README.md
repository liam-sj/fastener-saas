# 紧固件 SaaS ERP

紧固件行业多租户 SaaS 后端系统，覆盖**报价 → 订单 → 采购 → 入库 → 发货 → 对账**完整业务链路。

## 技术栈

| 技术 | 版本 |
|------|------|
| NestJS | 11 |
| TypeScript | 5.9 |
| Prisma | 7.8 |
| PostgreSQL | 16 |
| pnpm | 10 |
| Swagger | 11 |

## 快速开始

### 1. 环境准备

- Node.js 20+
- pnpm
- PostgreSQL 16

### 2. 安装依赖

```bash
pnpm install
```

### 3. 配置数据库

创建 `.env` 文件：

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/fastener_saas?schema=public"
```

在 PostgreSQL 中创建数据库：

```sql
CREATE DATABASE fastener_saas;
```

### 4. 初始化数据库

```bash
npx prisma migrate dev --name init
npx prisma db seed
```

### 5. 启动服务

```bash
# 开发模式（热重载）
pnpm run start:dev

# 生产模式
pnpm run build
pnpm run start:prod
```

服务默认运行在 `http://localhost:3000`。

## API 文档

启动后访问 Swagger UI：

```
http://localhost:3000/api/docs
```

### 默认账号

| 用户名 | 密码 | 角色 |
|--------|------|------|
| admin | admin123 | 管理员 |

### 用户角色

| 角色 | 说明 |
|------|------|
| admin | 管理员 |
| manager | 经理 |
| staff | 员工 |

## 功能模块

| 模块 | 端点前缀 | 说明 |
|------|----------|------|
| 认证 | `/api/auth` | 注册 / 登录 / 刷新令牌 |
| 租户 | `/api/tenants` | 多租户管理 |
| 用户 | `/api/users` | 用户 CRUD |
| 客户 | `/api/customers` | 客户管理 |
| 供应商 | `/api/suppliers` | 供应商管理 |
| 分类 | `/api/categories` | 无限级分类树 |
| 商品 | `/api/products` | SPU 管理 |
| SKU | `/api/products/:id/skus` | SKU + 自动编码 |
| 报价单 | `/api/quotations` | 报价 → 发送 → 接受/拒绝 |
| 订单 | `/api/orders` | 订单 + 增项/改项/减项 |
| 采购单 | `/api/purchase-orders` | 采购 + 自动生成 |
| 入库单 | `/api/inbound-orders` | 入库确认 → 更新库存 |
| 发货单 | `/api/delivery-orders` | 发货 → 签收 |
| 对账 | `/api/settlements` | 条目级收款对账 |

## 核心业务流程

```
客户报价 → 发送 → 接受 → 自动生成订单
                          ↓
              库存分流（stock / custom）
                          ↓
          ┌───────────────┼───────────────┐
          ↓                               ↓
      stock 库存扣减              custom 生成采购单
          ↓                               ↓
     发货单 → 签收                采购确认 → 入库单
          ↓                               ↓
          └───────────────┬───────────────┘
                          ↓
                  条目级对账 → 收款确认
```

## 项目结构

```
src/
├── common/              # 公共层
│   ├── constants/       # 错误码
│   ├── decorators/      # @Public 装饰器
│   ├── dto/             # 统一响应 DTO
│   ├── filters/         # 全局异常过滤器
│   ├── interceptors/    # 响应拦截器 / 租户拦截器
│   ├── middlewares/     # 租户中间件
│   ├── services/        # TenantContextService
│   └── utils/           # 单号生成器
├── prisma/              # Prisma Schema + Service
│   ├── schema.prisma    # 16 个数据模型
│   └── seed.ts          # 种子数据
└── modules/
    ├── auth/            # JWT 认证
    ├── tenant/          # 租户
    ├── user/            # 用户
    ├── customer/        # 客户
    ├── supplier/        # 供应商
    ├── product/         # 分类 + 商品 + SKU
    ├── quotation/       # 报价单
    ├── order/           # 订单（核心）
    ├── purchase/        # 采购单
    ├── inventory/       # 入库 + 发货
    └── settlement/      # 对账
```

## Docker 部署

```bash
docker compose up -d
```

启动 PostgreSQL + 应用，访问 `http://localhost:3000`。

## License

MIT
