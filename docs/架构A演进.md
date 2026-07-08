# 向 A 演进改进路线

> 2026-07-08 基于两轮代码审查后的实际代码状态制定。
> 目标:把项目从 **A-**(作业级优秀 / 单租户小规模可用)演进到 **A**(产品级 / 单租户生产可用且可放心维护)。
> 与前两份审查文档的关系:前两份是"问题清单",本文是"演进路线"——只列走向 A 必须做的事,不重复 P2/P3 边角项。

---

## 一、定位:现在在哪,要去哪

| 等级 | 定义 | 当前状态 |
|------|------|---------|
| B+ | 作业级,设计扎实但有数据正确性硬伤 | (修改前) |
| A- | 数据正确性地基打牢,小规模能跑不乱账 | ✅ **已到达** |
| **A** | **产品级,跑了不会半夜被叫起来救火,敢交给别人维护** | **本文目标** |
| A+ | 可演进、可证伪、可观测(领域分层 + 测试网 + 监控) | 暂不追求 |

**A- → A 的本质**:不是补更多洞,是把两轮审查中"会影响生产稳定"的尾巴收干净。前两轮把数据正确性硬伤清掉了(原子扣减、事务包裹、单号序列表、状态机、索引),A 的差距只剩三类:

1. **数据纯洁性**——金额精度(Decimal)
2. **配置可靠性**——环境变量静默降级
3. **业务健壮性收尾**——少量未改的 P1

A+ 的内容(领域分层、测试网、可观测性)**故意不做**——单租户阶段投入产出比低,且没有测试网时重构等同走钢丝。等真有多租户/多人维护需求再启动。

---

## 二、A- → A 必做事项(按 ROI 排序)

### 1. 🔴 金额全程 Decimal 化 —— 数据纯洁性硬伤

**为什么是必做**:这是 A 和 A- 之间最实质的差距。其余都是"不够好",这个是"会悄悄错"。`Number(Decimal)` 转 JS 浮点后累加,`Math.round(x*100)/100` 只保证最终值两位小数,**累加过程已丢精度**。单张订单无所谓,月结对账时客户财务会盯上这几分钱。

**当前隐患点**(全项目 13 处,均用 `Number(decimal) * qty` 模式):

| 文件 | 行 | 运算 |
|------|-----|------|
| order.service.ts | 55, 191 | `recalculateTotal` / `create` 总额 |
| order.service.ts | 249-250 | `getProfit` 收入成本 |
| order.service.ts | 268-273 | 利润汇总 |
| quotation.service.ts | 112 | 报价总额 |
| settlement.service.ts | 32, 95, 99, 144, 174 | 对账已收/未收金额 |
| settlement.service.ts | 35, 147 | 条目总额校验 |
| purchase.service.ts | 81 | 采购单总额 |
| inbound.service.ts | 100 | 加权平均成本价 |
| stock.service.ts | 56 | 回填成本 |

**改法**:引入 `decimal.js`,全程 Decimal 运算,只在**最外层返回前端时** `Number()`。

```ts
import { Decimal } from '@prisma/client/runtime/library';
// 或 import Decimal from 'decimal.js';

// ❌ 现在
const total = items.reduce((sum, i) => sum + Number(i.price) * i.qty, 0);

// ✅ 改后
const total = items.reduce(
  (sum, i) => sum.plus(new Decimal(i.price).times(i.qty)),
  new Decimal(0),
);
return Number(total.toDecimalPlaces(2));
```

**判断标准**:grep 不到任何针对金额字段的 `* / + -` 原生运算,只有 `.plus().times().minus().div()`。

**工作量**:半天。收益:数据纯洁性,财务对账不再"差几分钱"。

---

### 2. 🔴 配置强校验 —— 消灭静默降级

**为什么是必做**:`auth.module.ts:12` 仍有 `process.env.JWT_SECRET || 'fastener-saas-secret-key'`。漏配密钥 → 静默用弱密钥裸跑,应用正常启动但密钥强度为零,可伪造任意 token。A 级系统不会有这种"静默安全降级"。

**当前隐患点**:

| 文件 | 行 | 问题 |
|------|-----|------|
| auth.module.ts | 12 | JWT_SECRET 硬编码兜底 |
| (全项目) | — | DATABASE_URL / PORT 等无启动校验,缺了会用 undefined 裸跑 |

**改法**:引入 `@nestjs/config` + `class-validator`,启动时强校验,缺失直接 crash。

```ts
// src/config/env.validation.ts
import { IsString, MinLength, IsNumber } from 'class-validator';
export class EnvConfig {
  @IsString() @MinLength(32)
  JWT_SECRET: string;

  @IsString()
  DATABASE_URL: string;

  @IsNumber()
  PORT: number;
}

// app.module.ts
ConfigModule.forRoot({
  isGlobal: true,
  validate: (raw) => plainToInstance(EnvConfig, raw, { enableImplicitConversion: true }),
});
```

启动失败比带病运行好。**判断标准**:删掉 `.env` 启动,进程直接 crash 报"JWT_SECRET is required",而不是跑起来。

**工作量**:1-2 小时。收益:配置错误第一秒暴露,不上线才知道。

---

### 3. 🟠 业务健壮性收尾 —— 未改的 P1

两轮审查里大部分 P1 已改(状态机 ✅、对账事务 ✅、采购供应商参数化 ✅、入库 N+1 ✅)。剩下这几处:

#### 3.1 全局 Filter 非 HTTP 上下文判断(15 分钟)

**位置**:`global-exception.filter.ts`

**问题**:`@Catch()` 捕获所有异常,非 HTTP 上下文(WebSocket、定时任务)抛错时 `response.status().json()` 会二次报错,掩盖原始异常。

**改法**:
```ts
if (host.getType() !== 'http') {
  this.logger.error(exception);
  return;
}
```

#### 3.2 Prisma 错误信息不泄漏(30 分钟)

**位置**:`global-exception.filter.ts` 未识别分支

**问题**:未识别的 Prisma 错误把 `exception.message` 原样返回,可能含表名/字段名/约束名,帮攻击者摸清 DB 结构。

**改法**:未识别错误只返回通用提示"数据操作失败",详情写日志。

#### 3.3 update 透传 DTO 的越权风险(半天)

**位置**:`user.service.ts` 等的 `update`

**问题**:`data: dto` 直接透传,UpdateUserDto 若含 `role` 字段,staff 可把自己提升为 admin(配合当前无 RBAC)。虽然现在单租户熟人环境风险低,但这是产品级底线。

**改法**:敏感字段拆分——`UpdateProfileDto`(改自己)和 `UpdateRoleDto`(仅 admin),或用 `OmitType` 排除 role。

#### 3.4 delivery 发货超量校验的非原子读(半天)

**位置**:`delivery.service.ts:46-55` 的 `create`

**问题**:先 for 循环 `findFirst` 校验 `deliveredQty + qty <= qty`,再 `create` 发货单。校验和创建不在同一事务,两个发货单并发对同一 orderItem 可能都通过校验然后都创建,导致超发。

**改法**:校验放进 `create` 的事务里(目前 create 还没事务),且 `ship` 里的 `deliveredQty: { increment: item.qty }` 配合"校验总数不超"的条件 update。

```ts
// ship 里把 increment 改成条件更新,超量直接失败
const r = await tx.orderItem.updateMany({
  where: { id: item.orderItemId, deliveredQty: { lte: orderItem.qty - item.qty } },
  data: { deliveredQty: { increment: item.qty } },
});
if (r.count === 0) throw new BadRequestException('发货数量超过订单数量');
```

---

## 三、故意不做的事(A+ 内容,现在碰反而添乱)

| 项目 | 为啥不做 |
|------|---------|
| 领域分层(Domain/Application/Repository) | 没有 3-5 周净时间,做了反而引入新 bug;且当前 `StockService` 已抽出关键复用,够用 |
| 测试网(e2e 断言事务回滚) | 先把功能 bug 补完,否则是给"会错的代码"上保险;A 阶段靠肉眼 + 小流量验证 |
| 可观测性(Prometheus + pino) | 单租户阶段 docker logs 够用,等出过一次"查不到原因"的故障再上 |
| RBAC(RolesGuard) | 重要但不紧急,单租户内部系统用户都是熟人,等开放给第二家租户前再做 |
| 分布式锁 | 1 台服务器 1 个 PG 实例,根本不分布式;数据库原子操作 + 事务已覆盖所有并发场景 |

---

## 四、执行路径与验收

```
第 1 步(半天):Decimal 全程化
   └─ grep 验证:无金额字段的原生四则运算

第 2 步(1-2 小时):配置强校验
   └─ 验证:删 .env 启动直接 crash

第 3 步(1 天):P1 收尾
   ├─ Filter HTTP 上下文判断
   ├─ Prisma 错误信息过滤
   ├─ update DTO 拆分
   └─ delivery 发货超量原子校验

第 4 步:全链路冒烟(手动)
   └─ 报价→订单→采购→入库→发货→对账 各跑一遍,金额对得上
```

**总工作量:1.5-2 天。**

**验收标准(满足即达 A)**:
- [ ] 全项目无 `Number(decimal) * qty` 模式,金额全程 Decimal
- [ ] 删掉任意必填环境变量,进程启动即 crash
- [ ] 全局 Filter 在非 HTTP 上下文不二次报错
- [ ] 未识别的 Prisma 错误不向前端泄漏表结构
- [ ] 用户不能通过 update 接口越权改 role
- [ ] 并发发货不会超发
- [ ] 报价→对账全链路金额一致(手动冒烟通过)

---

## 五、A 阶段之后什么时候启动 A+

出现以下任一信号,再启动 A+ 演进:

1. **要接第二家租户** → 必须先做 RBAC + 审计字段( createdBy/updatedBy )
2. **订单量破 10 万或月结对账变慢** → 启动可观测性,用真实数据定位瓶颈
3. **团队要加第 2 个后端** → 必须先搭测试网,否则改不动
4. **要加新业务模块(返单/退换货/报表)** → 启动领域分层,让规则可复用

在那之前,A 就是终点。**过度工程化比代码烂更危险——它让简单的事变难维护。**

---

> 本文档是动态文档,每次启动 A+ 前或执行 A 阶段时回顾一次。