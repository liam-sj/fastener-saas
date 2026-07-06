# 紧固件 SaaS 系统 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建紧固件行业多租户 SaaS 后端系统，覆盖报价->订单->采购->入库->发货->对账完整链路。

**Architecture:** NestJS 模块化后端，Prisma ORM + PostgreSQL 16，AsyncLocalStorage 实现多租户隔离。全局 JWT 认证 + 租户上下文。统一响应格式包裹，全局异常过滤器。

**Tech Stack:** NestJS 11, TypeScript 5.9 (nodenext), Prisma 6, PostgreSQL 16, @nestjs/jwt, bcrypt, class-validator, class-transformer, pnpm

## Global Constraints

- 所有查询通过 TenantContextService 获取 tenantId，手动传入 Prisma where
- 金额统一用 Decimal（`@db.Decimal(10,2)` / `@db.Decimal(12,2)`）
- 所有 API DTO 加 class-validator 校验
- 统一响应格式 `{ code, message, data }`
- MVP 阶段先实现功能，后续统一补测试
- 包管理器使用 pnpm
- TS 使用 nodenext 模块解析

---

## P1: 基础设施

---

### Task 1: 安装项目依赖

**Files:**
- Modify: `package.json`

**Produces:** 所有 npm 依赖就绪

- [ ] **Step 1: 安装运行时依赖**

```bash
pnpm add @prisma/client @nestjs/jwt @nestjs/passport @nestjs/config passport passport-jwt bcrypt class-validator class-transformer
```

- [ ] **Step 2: 安装开发依赖**

```bash
pnpm add -D prisma @types/passport-jwt @types/bcrypt
```

- [ ] **Step 3: 验证 Prisma CLI**

```bash
pnpm prisma --version
```
Expected: 显示 Prisma CLI 版本号

- [ ] **Step 4: 初始化 Prisma**

```bash
npx prisma init
```
这会在项目根目录创建 `prisma/` 目录和 `.env` 文件。将生成的 `prisma/schema.prisma` 移动到 `src/prisma/schema.prisma`，并删除空的 `prisma/` 目录。

- [ ] **Step 5: 配置 .env**

```
DATABASE_URL="postgresql://postgres:<YOUR_PASSWORD>@localhost:5432/fastener_saas?schema=public"
```

- [ ] **Step 6: 提交**

```bash
git add package.json pnpm-lock.yaml .env
git commit -m "chore: install dependencies and init Prisma"
```

---

### Task 2: Prisma Schema 定义

**Files:**
- Create: `src/prisma/schema.prisma`

**Produces:** 完整数据模型（16 个 Model），所有表关系

- [ ] **Step 1: 编写完整 Prisma Schema**

写入 `src/prisma/schema.prisma`，完整 schema 见 spec 文档第 5 节。包含以下 16 个模型：

- Tenant, User, Customer, Supplier（基础模型）
- Category, Product, Sku（商品三层）
- Quotation（报价单）
- Order, OrderItem, OrderRevision（销货订单）
- PurchaseOrder, PurchaseOrderItem（采购单）
- InboundOrder（入库单）
- DeliveryOrder, DeliveryItem（发货单）
- Settlement（对账）

所有模型均包含 `tenantId Int` + `tenant Tenant @relation(...)`，金额字段使用 `@db.Decimal(10,2)` 或 `@db.Decimal(12,2)`，灵活属性使用 `Json` 类型。

- [ ] **Step 2: 执行数据库迁移**

```bash
npx prisma migrate dev --name init
```
Expected: 输出 "Your database is now in sync with your schema."

- [ ] **Step 3: 生成 Prisma Client**

```bash
npx prisma generate
```

- [ ] **Step 4: 提交**

```bash
git add src/prisma/schema.prisma prisma/ .env
git commit -m "feat: add Prisma schema with full data model"
```

---

### Task 3: 公共层 — 错误码 + 响应 DTO

**Files:**
- Create: `src/common/constants/error-codes.ts`
- Create: `src/common/dto/response.dto.ts`

**Produces:** `ErrorCode` 枚举和 `ApiResponse<T>` 响应类

- [ ] **Step 1: 创建错误码常量**

```typescript
// src/common/constants/error-codes.ts
export enum ErrorCode {
  SUCCESS = 0,
  VALIDATION_ERROR = 1001,
  UNAUTHORIZED = 1002,
  NOT_FOUND = 1003,
  BUSINESS_ERROR = 2001,
  UNKNOWN_ERROR = 9999,
}

export const ErrorMessage: Record<number, string> = {
  [ErrorCode.SUCCESS]: 'success',
  [ErrorCode.VALIDATION_ERROR]: '参数校验失败',
  [ErrorCode.UNAUTHORIZED]: '未授权',
  [ErrorCode.NOT_FOUND]: '资源不存在',
  [ErrorCode.BUSINESS_ERROR]: '业务规则限制',
  [ErrorCode.UNKNOWN_ERROR]: '服务器内部错误',
};
```

- [ ] **Step 2: 创建统一响应 DTO**

```typescript
// src/common/dto/response.dto.ts
import { ErrorCode } from '../constants/error-codes';

export class ApiResponse<T = unknown> {
  code: number;
  message: string;
  data: T;

  static ok<T>(data: T, message = 'success'): ApiResponse<T> {
    return { code: ErrorCode.SUCCESS, message, data };
  }

  static fail(code: number, message: string): ApiResponse<null> {
    return { code, message, data: null };
  }
}
```

- [ ] **Step 3: 提交**

```bash
git add src/common/
git commit -m "feat: add error codes and unified response DTO"
```

---

### Task 4: 公共层 — 全局异常过滤器

**Files:**
- Create: `src/common/filters/global-exception.filter.ts`

**Produces:** 全局异常过滤器，统一错误输出格式

**Consumes:** `ErrorCode`, `ApiResponse` (Task 3)

- [ ] **Step 1: 创建异常过滤器**

```typescript
// src/common/filters/global-exception.filter.ts
import {
  ExceptionFilter, Catch, ArgumentsHost,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorCode } from '../constants/error-codes';
import { ApiResponse } from '../dto/response.dto';

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse();

    let code = ErrorCode.UNKNOWN_ERROR;
    let message = '服务器内部错误';
    let httpStatus = HttpStatus.INTERNAL_SERVER_ERROR;

    if (exception instanceof HttpException) {
      httpStatus = exception.getStatus();
      const res = exception.getResponse();
      message = typeof res === 'string' ? res : (res as any).message || message;
      if (Array.isArray(message)) message = message.join('; ');

      if (httpStatus === HttpStatus.BAD_REQUEST) code = ErrorCode.VALIDATION_ERROR;
      else if (httpStatus === HttpStatus.UNAUTHORIZED) code = ErrorCode.UNAUTHORIZED;
      else if (httpStatus === HttpStatus.NOT_FOUND) code = ErrorCode.NOT_FOUND;
      else code = ErrorCode.BUSINESS_ERROR;
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      if (exception.code === 'P2002') {
        httpStatus = HttpStatus.BAD_REQUEST;
        code = ErrorCode.BUSINESS_ERROR;
        message = '数据重复，请检查唯一字段';
      } else if (exception.code === 'P2025') {
        httpStatus = HttpStatus.NOT_FOUND;
        code = ErrorCode.NOT_FOUND;
        message = '记录不存在';
      } else {
        httpStatus = HttpStatus.BAD_REQUEST;
        code = ErrorCode.BUSINESS_ERROR;
        message = exception.message;
      }
    } else if (exception instanceof Error) {
      this.logger.error(exception.message, exception.stack);
    }

    response.status(httpStatus).json(ApiResponse.fail(code, message));
  }
}
```

- [ ] **Step 2: 提交**

```bash
git add src/common/filters/
git commit -m "feat: add global exception filter"
```

---

### Task 5: PrismaService + 响应拦截器 + 装饰器

**Files:**
- Create: `src/prisma/prisma.service.ts`
- Create: `src/prisma/prisma.module.ts`
- Create: `src/common/interceptors/response.interceptor.ts`
- Create: `src/common/decorators/public.decorator.ts`

**Produces:** Prisma 全局服务、响应包装拦截器、@Public 装饰器

- [ ] **Step 1: 创建 PrismaService**

```typescript
// src/prisma/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

```typescript
// src/prisma/prisma.module.ts
import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}
```

- [ ] **Step 2: 创建响应拦截器**

```typescript
// src/common/interceptors/response.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable, map } from 'rxjs';
import { ApiResponse } from '../dto/response.dto';

@Injectable()
export class ResponseInterceptor<T> implements NestInterceptor<T, ApiResponse<T>> {
  intercept(_context: ExecutionContext, next: CallHandler): Observable<ApiResponse<T>> {
    return next.handle().pipe(
      map((data) => {
        if (data instanceof ApiResponse) return data;
        return ApiResponse.ok(data);
      }),
    );
  }
}
```

- [ ] **Step 3: 创建 @Public 装饰器**

```typescript
// src/common/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common';
export const IS_PUBLIC_KEY = 'isPublic';
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
```

- [ ] **Step 4: 提交**

```bash
git add src/prisma/ src/common/
git commit -m "feat: add PrismaService, response interceptor, and @Public decorator"
```

---

### Task 6: Auth 模块 — JWT 认证

**Files:**
- Create: `src/modules/auth/auth.module.ts`
- Create: `src/modules/auth/auth.service.ts`
- Create: `src/modules/auth/auth.controller.ts`
- Create: `src/modules/auth/dto/register.dto.ts`
- Create: `src/modules/auth/dto/login.dto.ts`
- Create: `src/modules/auth/jwt.strategy.ts`
- Create: `src/modules/auth/jwt-auth.guard.ts`

**Produces:** 用户注册（创建租户+管理员）、登录返回 JWT、token 刷新、全局 JWT Guard

**Consumes:** `IS_PUBLIC_KEY` (Task 5), `PrismaService` (Task 5)

- [ ] **Step 1: 创建 DTO**

```typescript
// src/modules/auth/dto/register.dto.ts
import { IsString, MinLength, MaxLength } from 'class-validator';

export class RegisterDto {
  @IsString() @MinLength(2) @MaxLength(50)
  companyName: string;

  @IsString() @MinLength(3) @MaxLength(30)
  username: string;

  @IsString() @MinLength(6) @MaxLength(50)
  password: string;
}
```

```typescript
// src/modules/auth/dto/login.dto.ts
import { IsString, MinLength } from 'class-validator';

export class LoginDto {
  @IsString() @MinLength(3)
  username: string;

  @IsString() @MinLength(6)
  password: string;
}
```

- [ ] **Step 2: 创建 JWT 策略和 Guard**

```typescript
// src/modules/auth/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

export interface JwtPayload {
  sub: number;
  tenantId: number;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET || 'fastener-saas-secret-key',
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.tenantId) {
      throw new UnauthorizedException('无效的 token');
    }
    return { userId: payload.sub, tenantId: payload.tenantId, role: payload.role };
  }
}
```

```typescript
// src/modules/auth/jwt-auth.guard.ts
import { Injectable, ExecutionContext } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { Reflector } from '@nestjs/core';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator';

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private reflector: Reflector) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) return true;
    return super.canActivate(context);
  }
}
```

- [ ] **Step 3: 创建 AuthService**

```typescript
// src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterDto) {
    const tenant = await this.prisma.tenant.create({
      data: { name: dto.companyName },
    });

    const hashedPassword = await bcrypt.hash(dto.password, 10);
    const user = await this.prisma.user.create({
      data: {
        tenantId: tenant.id,
        username: dto.username,
        password: hashedPassword,
        role: 'admin',
      },
    });

    return { tenantId: tenant.id, userId: user.id };
  }

  async login(dto: LoginDto) {
    const users = await this.prisma.user.findMany({
      where: { username: dto.username },
    });

    if (users.length === 0) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    let matchedUser = null;
    for (const user of users) {
      if (await bcrypt.compare(dto.password, user.password)) {
        matchedUser = user;
        break;
      }
    }

    if (!matchedUser) {
      throw new UnauthorizedException('用户名或密码错误');
    }

    const payload = {
      sub: matchedUser.id,
      tenantId: matchedUser.tenantId,
      role: matchedUser.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      user: {
        id: matchedUser.id,
        username: matchedUser.username,
        role: matchedUser.role,
        tenantId: matchedUser.tenantId,
      },
    };
  }

  async refresh(userId: number) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new UnauthorizedException('用户不存在');

    const payload = { sub: user.id, tenantId: user.tenantId, role: user.role };
    return { accessToken: this.jwtService.sign(payload) };
  }
}
```

- [ ] **Step 4: 创建 AuthController**

```typescript
// src/modules/auth/auth.controller.ts
import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { Public } from '../../common/decorators/public.decorator';
import { JwtAuthGuard } from './jwt-auth.guard';

@Controller('api/auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('refresh')
  refresh(@Req() req: any) {
    return this.authService.refresh(req.user.userId);
  }
}
```

- [ ] **Step 5: 创建 AuthModule**

```typescript
// src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET || 'fastener-saas-secret-key',
      signOptions: { expiresIn: '24h' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

- [ ] **Step 6: 更新 AppModule**

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [PrismaModule, AuthModule],
})
export class AppModule {}
```

- [ ] **Step 7: 提交**

```bash
git add src/modules/auth/ src/app.module.ts
git commit -m "feat: add auth module with register/login/refresh"
```

---

### Task 7: 多租户上下文 + 全局管线挂载

**Files:**
- Create: `src/common/services/tenant-context.service.ts`
- Create: `src/common/middlewares/tenant.middleware.ts`
- Modify: `src/main.ts`
- Modify: `src/app.module.ts`

**Produces:** 租户上下文服务（AsyncLocalStorage 实现）、租户中间件、全局管线挂载

- [ ] **Step 1: 实现 TenantContextService**

```typescript
// src/common/services/tenant-context.service.ts
import { Injectable } from '@nestjs/common';
import { AsyncLocalStorage } from 'async_hooks';

interface TenantStore {
  tenantId: number;
  userId: number;
  role: string;
  isSuperAdmin?: boolean;
}

@Injectable()
export class TenantContextService {
  private readonly storage = new AsyncLocalStorage<TenantStore>();

  run(store: TenantStore, callback: () => void) {
    this.storage.run(store, callback);
  }

  getStore(): TenantStore | undefined {
    return this.storage.getStore();
  }

  getTenantId(): number | undefined {
    return this.getStore()?.tenantId;
  }

  getTenantIdOrThrow(): number {
    const tenantId = this.getTenantId();
    if (!tenantId) throw new Error('Tenant context not available');
    return tenantId;
  }

  getUserId(): number | undefined {
    return this.getStore()?.userId;
  }

  getRole(): string | undefined {
    return this.getStore()?.role;
  }
}
```

- [ ] **Step 2: 创建租户中间件**

```typescript
// src/common/middlewares/tenant.middleware.ts
import { Injectable, NestMiddleware } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';
import { TenantContextService } from '../services/tenant-context.service';

@Injectable()
export class TenantMiddleware implements NestMiddleware {
  constructor(private readonly tenantCtx: TenantContextService) {}

  use(req: Request, _res: Response, next: NextFunction) {
    const user = (req as any).user;
    if (user) {
      this.tenantCtx.run(
        { tenantId: user.tenantId, userId: user.userId, role: user.role },
        () => next(),
      );
    } else {
      next();
    }
  }
}
```

- [ ] **Step 3: 更新 main.ts 挂载全局管线**

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { GlobalExceptionFilter } from './common/filters/global-exception.filter';
import { ResponseInterceptor } from './common/interceptors/response.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      transformOptions: { enableImplicitConversion: true },
    }),
  );
  app.useGlobalFilters(new GlobalExceptionFilter());
  app.useGlobalInterceptors(new ResponseInterceptor());

  await app.listen(process.env.PORT ?? 3000);
}
bootstrap();
```

- [ ] **Step 4: 更新 AppModule**

```typescript
// src/app.module.ts
import { Module, MiddlewareConsumer, NestModule } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantMiddleware } from './common/middlewares/tenant.middleware';
import { TenantContextService } from './common/services/tenant-context.service';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';

@Module({
  imports: [PrismaModule, AuthModule],
  providers: [
    TenantContextService,
    { provide: APP_GUARD, useClass: JwtAuthGuard },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(TenantMiddleware).forRoutes('*');
  }
}
```

- [ ] **Step 5: 验证启动**

```bash
pnpm start:dev
```
Expected: Nest 启动成功，监听 3000 端口。

- [ ] **Step 6: 测试 Auth API**

```bash
# 注册
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"companyName":"测试工厂","username":"admin","password":"admin123"}'

# 登录
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username":"admin","password":"admin123"}'
```
Expected: 返回 `{"code":0,"message":"success","data":{"accessToken":"eyJ...","user":{...}}}`

- [ ] **Step 7: 提交**

```bash
git add src/common/services/ src/common/middlewares/ src/main.ts src/app.module.ts
git commit -m "feat: add tenant context, middleware, and global pipes"
```

---

## P2: 基础数据

P2 的四个基础 CRUD 模块（Tenant/User/Customer/Supplier）结构一致，以 Customer 为模板详述，其余三个复用。

---

### Task 8: Customer CRUD 模块（模板）

**Files:**
- Create: `src/modules/customer/customer.module.ts`
- Create: `src/modules/customer/customer.service.ts`
- Create: `src/modules/customer/customer.controller.ts`
- Create: `src/modules/customer/dto/create-customer.dto.ts`
- Create: `src/modules/customer/dto/update-customer.dto.ts`
- Create: `src/modules/customer/dto/query-customer.dto.ts`

**Produces:** Customer CRUD 完整模块

**Consumes:** `TenantContextService` (Task 7), `PrismaService` (Task 5)

- [ ] **Step 1: 创建 DTO**

```typescript
// src/modules/customer/dto/create-customer.dto.ts
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class CreateCustomerDto {
  @IsString() @MaxLength(100) name: string;
  @IsOptional() @IsString() @MaxLength(50) contact?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
}
```

```typescript
// src/modules/customer/dto/update-customer.dto.ts
// 所有字段 optional, 模式同 CreateCustomerDto
import { IsString, IsOptional, MaxLength } from 'class-validator';

export class UpdateCustomerDto {
  @IsOptional() @IsString() @MaxLength(100) name?: string;
  @IsOptional() @IsString() @MaxLength(50) contact?: string;
  @IsOptional() @IsString() @MaxLength(30) phone?: string;
  @IsOptional() @IsString() @MaxLength(200) address?: string;
}
```

```typescript
// src/modules/customer/dto/query-customer.dto.ts
import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryCustomerDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) pageSize?: number = 20;
  @IsOptional() @IsString() keyword?: string;
}
```

- [ ] **Step 2: 创建 CustomerService**

```typescript
// src/modules/customer/customer.service.ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';

@Injectable()
export class CustomerService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findAll(query: QueryCustomerDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const { page = 1, pageSize = 20, keyword } = query;

    const where: any = { tenantId };
    if (keyword) {
      where.OR = [
        { name: { contains: keyword } },
        { contact: { contains: keyword } },
        { phone: { contains: keyword } },
      ];
    }

    const [list, total] = await Promise.all([
      this.prisma.customer.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customer.count({ where }),
    ]);

    return { list, total, page, pageSize };
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.customer.findFirst({ where: { id, tenantId } });
  }

  async create(dto: CreateCustomerDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.customer.create({ data: { ...dto, tenantId } });
  }

  async update(id: number, dto: UpdateCustomerDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.findOne(id);
    return this.prisma.customer.updateMany({ where: { id, tenantId }, data: dto });
  }

  async remove(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.prisma.customer.deleteMany({ where: { id, tenantId } });
  }
}
```

- [ ] **Step 3: 创建 CustomerController**

```typescript
// src/modules/customer/customer.controller.ts
import { Controller, Get, Post, Patch, Delete, Param, Body, Query, ParseIntPipe } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CreateCustomerDto } from './dto/create-customer.dto';
import { UpdateCustomerDto } from './dto/update-customer.dto';
import { QueryCustomerDto } from './dto/query-customer.dto';

@Controller('api/customers')
export class CustomerController {
  constructor(private readonly customerService: CustomerService) {}

  @Get()
  findAll(@Query() query: QueryCustomerDto) {
    return this.customerService.findAll(query);
  }

  @Get(':id')
  findOne(@Param('id', ParseIntPipe) id: number) {
    return this.customerService.findOne(id);
  }

  @Post()
  create(@Body() dto: CreateCustomerDto) {
    return this.customerService.create(dto);
  }

  @Patch(':id')
  update(@Param('id', ParseIntPipe) id: number, @Body() dto: UpdateCustomerDto) {
    return this.customerService.update(id, dto);
  }

  @Delete(':id')
  remove(@Param('id', ParseIntPipe) id: number) {
    return this.customerService.remove(id);
  }
}
```

- [ ] **Step 4: 创建 CustomerModule 并注册到 AppModule**

```typescript
// src/modules/customer/customer.module.ts
import { Module } from '@nestjs/common';
import { CustomerService } from './customer.service';
import { CustomerController } from './customer.controller';

@Module({
  controllers: [CustomerController],
  providers: [CustomerService],
})
export class CustomerModule {}
```

AppModule imports 中添加 `CustomerModule`。

- [ ] **Step 5: 验证**

```bash
curl -X POST http://localhost:3000/api/customers \
  -H "Authorization: Bearer <TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试客户","contact":"张三","phone":"13800138000"}'
```
Expected: `{"code":0,"message":"success","data":{...}}`

- [ ] **Step 6: 提交**

```bash
git add src/modules/customer/ src/app.module.ts
git commit -m "feat: add customer CRUD module"
```

---

### Task 9-11: Tenant, User, Supplier CRUD（复用 Customer 模式）

每个模块创建 `src/modules/<name>/` 下的 module/service/controller/dto 6 个文件。

**关键差异：**
- Tenant: 超级管理员不过滤 tenantId（查所有租户）
- User: create/update 时 `bcrypt.hash(password, 10)` 加密
- Supplier: 字段含 address，模式完全同 Customer

- [ ] **Step 1: 创建 Tenant 模块（`src/modules/tenant/`）**
- [ ] **Step 2: 创建 User 模块（`src/modules/user/`）**
- [ ] **Step 3: 创建 Supplier 模块（`src/modules/supplier/`）**
- [ ] **Step 4: 分别注册到 AppModule**
- [ ] **Step 5: 提交**

```bash
git add src/modules/tenant/ src/modules/user/ src/modules/supplier/ src/app.module.ts
git commit -m "feat: add tenant, user, supplier CRUD modules"
```

---

### Task 12: Category 模块（分类树 + 规格模板）

**Files:**
- Create: `src/modules/product/category.module.ts`
- Create: `src/modules/product/category.service.ts`
- Create: `src/modules/product/category.controller.ts`
- Create: `src/modules/product/dto/category/create-category.dto.ts`
- Create: `src/modules/product/dto/category/update-category.dto.ts`

**Produces:** 无限级分类树，specTemplate JSON 管理

- [ ] **Step 1: 创建 DTO**

```typescript
// src/modules/product/dto/category/create-category.dto.ts
import { IsString, IsOptional, IsInt, IsObject } from 'class-validator';

export class CreateCategoryDto {
  @IsString() name: string;
  @IsOptional() @IsInt() parentId?: number;
  @IsOptional() @IsObject() specTemplate?: Record<string, string[]>;
}
```

- [ ] **Step 2: 创建 CategoryService**

核心：`findTree()` 方法递归构建分类树；`remove()` 检查子分类和商品引用。

```typescript
// src/modules/product/category.service.ts
import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateCategoryDto } from './dto/category/create-category.dto';
import { UpdateCategoryDto } from './dto/category/update-category.dto';

@Injectable()
export class CategoryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  async findTree() {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const all = await this.prisma.category.findMany({
      where: { tenantId },
      orderBy: { createdAt: 'asc' },
    });
    return this.buildTree(all);
  }

  private buildTree(categories: any[], parentId: number | null = null): any[] {
    return categories
      .filter((c) => c.parentId === parentId)
      .map((c) => ({ ...c, children: this.buildTree(categories, c.id) }));
  }

  async findOne(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const cat = await this.prisma.category.findFirst({ where: { id, tenantId } });
    if (!cat) throw new NotFoundException('分类不存在');
    return cat;
  }

  async create(dto: CreateCategoryDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.category.create({ data: { ...dto, tenantId } });
  }

  async update(id: number, dto: UpdateCategoryDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.findOne(id);
    return this.prisma.category.updateMany({ where: { id, tenantId }, data: dto });
  }

  async remove(id: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const [childCount, productCount] = await Promise.all([
      this.prisma.category.count({ where: { parentId: id, tenantId } }),
      this.prisma.product.count({ where: { categoryId: id, tenantId } }),
    ]);
    if (childCount > 0 || productCount > 0) {
      throw new BadRequestException('分类下有子分类或商品，无法删除');
    }
    await this.prisma.category.deleteMany({ where: { id, tenantId } });
  }
}
```

- [ ] **Step 3: 创建 CategoryController**（端点: GET/POST/PATCH/DELETE `/api/categories`）

- [ ] **Step 4: 创建 CategoryModule 并注册**
- [ ] **Step 5: 提交**

```bash
git add src/modules/product/category.* src/modules/product/dto/category/
git commit -m "feat: add category module with tree structure and spec template"
```

---

### Task 13: Product + SKU 模块（SPU 三层结构）

**Files:**
- Create: `src/modules/product/product.service.ts`
- Create: `src/modules/product/product.controller.ts`
- Create: `src/modules/product/sku.service.ts`
- Create: `src/modules/product/sku.controller.ts`
- Create: `src/modules/product/product.module.ts`（统合 Category/Product/SKU）
- Create: `src/modules/product/dto/product/create-product.dto.ts`
- Create: `src/modules/product/dto/product/update-product.dto.ts`
- Create: `src/modules/product/dto/product/query-product.dto.ts`
- Create: `src/modules/product/dto/sku/create-sku.dto.ts`
- Create: `src/modules/product/dto/sku/update-sku.dto.ts`
- Create: `src/modules/product/common/constants/category-abbreviations.ts`

**Produces:** SPU CRUD + SKU CRUD（嵌套路由 `/api/products/:id/skus`），SKU 编码自动生成

- [ ] **Step 1: 创建分类缩写映射**

```typescript
// src/modules/product/common/constants/category-abbreviations.ts
export const CATEGORY_ABBREVIATIONS: Record<string, string> = {
  '螺栓': 'BLT', '螺钉': 'LD', '螺母': 'NUT', '垫圈': 'DQ', '牙条': 'YT', '丝杆': 'SG',
};

export function getCategoryAbbreviation(name: string): string {
  return CATEGORY_ABBREVIATIONS[name] || name.substring(0, 3).toUpperCase();
}
```

- [ ] **Step 2: 创建 ProductService**

跟 Customer CRUD 模式一致，额外功能：
- `findAll` 支持按 categoryId、tag 筛选
- `findOne` include skus
- `remove` 检查是否有 SKU

- [ ] **Step 3: 创建 SkuService（含编码自动生成）**

```typescript
// src/modules/product/sku.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TenantContextService } from '../../common/services/tenant-context.service';
import { CreateSkuDto } from './dto/sku/create-sku.dto';
import { UpdateSkuDto } from './dto/sku/update-sku.dto';
import { getCategoryAbbreviation } from './common/constants/category-abbreviations';

@Injectable()
export class SkuService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly tenantCtx: TenantContextService,
  ) {}

  private async generateSkuCode(productId: number, tenantId: number, attributes: Record<string, string>): Promise<string> {
    const product = await this.prisma.product.findFirst({
      where: { id: productId, tenantId },
      include: { category: true },
    });
    if (!product) throw new NotFoundException('商品不存在');

    const abbrev = getCategoryAbbreviation(product.category.name);
    const spec = attributes['规格'] || '';
    const length = attributes['长度'] || '';
    const material = attributes['材质'] || '';
    const surface = attributes['表面处理'] || '';

    const parts = [abbrev];
    if (spec) parts.push(length ? `${spec}x${length}` : spec);
    if (material) parts.push(material);
    if (surface) parts.push(surface);

    return parts.join('-');
  }

  async findByProduct(productId: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    return this.prisma.sku.findMany({
      where: { productId, tenantId },
      orderBy: { createdAt: 'asc' },
    });
  }

  async create(productId: number, dto: CreateSkuDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const skuCode = await this.generateSkuCode(productId, tenantId, dto.attributes as Record<string, string>);

    const existing = await this.prisma.sku.findFirst({
      where: { productId, skuCode, tenantId },
    });
    if (existing) throw new ConflictException('SKU 编码已存在');

    return this.prisma.sku.create({
      data: {
        productId, tenantId, skuCode,
        attributes: dto.attributes,
        price: dto.price,
        stock: dto.stock ?? 0,
      },
    });
  }

  async update(productId: number, skuId: number, dto: UpdateSkuDto) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    const sku = await this.prisma.sku.findFirst({ where: { id: skuId, productId, tenantId } });
    if (!sku) throw new NotFoundException('SKU 不存在');
    return this.prisma.sku.updateMany({ where: { id: skuId, tenantId }, data: dto });
  }

  async remove(productId: number, skuId: number) {
    const tenantId = this.tenantCtx.getTenantIdOrThrow();
    await this.prisma.sku.deleteMany({ where: { id: skuId, productId, tenantId } });
  }
}
```

- [ ] **Step 4: 创建 SkuController**（嵌套路由 `api/products/:productId/skus`）

- [ ] **Step 5: 创建 ProductModule 统合所有子模块**

```typescript
// src/modules/product/product.module.ts
import { Module } from '@nestjs/common';
import { CategoryModule } from './category.module';
import { ProductService } from './product.service';
import { ProductController } from './product.controller';
import { SkuService } from './sku.service';
import { SkuController } from './sku.controller';

@Module({
  imports: [CategoryModule],
  controllers: [ProductController, SkuController],
  providers: [ProductService, SkuService],
  exports: [ProductService, SkuService],
})
export class ProductModule {}
```

- [ ] **Step 6: 注册到 AppModule 并提交**

```bash
git add src/modules/product/ src/app.module.ts
git commit -m "feat: add product SPU + SKU module with auto code generation"
```

---

### Task 14: 种子数据

**Files:**
- Create: `src/prisma/seed.ts`
- Modify: `package.json` (添加 seed 脚本)

**Produces:** 默认租户 + admin/admin123 + 5 个分类 + 每个分类 2-3 个 SPU + 每个 SPU 4-6 个 SKU（总计 50+ SKU）

- [ ] **Step 1: 编写种子数据脚本**

核心结构：
```typescript
// src/prisma/seed.ts
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcrypt';

const prisma = new PrismaClient();

async function main() {
  // 1. 创建默认租户 "紧固件工厂"
  // 2. 创建管理员 admin/admin123
  // 3. 循环创建 5 个分类（螺栓/螺钉/螺母/垫圈/牙条），每个带 specTemplate
  // 4. 每个分类下创建 2-3 个 SPU
  // 5. 每个 SPU 下创建 4-6 个 SKU（自动生成 skuCode、随机库存和价格）
}
```

完整代码参照 spec 文档中种子数据策略部分实现。

- [ ] **Step 2: 在 package.json 中添加 seed 配置**

```json
"prisma": {
  "seed": "ts-node src/prisma/seed.ts"
}
```

- [ ] **Step 3: 运行种子数据**

```bash
npx prisma db seed
```
Expected: 各分类/SPU/SKU 创建成功日志

- [ ] **Step 4: 提交**

```bash
git add src/prisma/seed.ts package.json
git commit -m "feat: add seed data with 50+ SKU"
```

---

### Task 15: 单号生成工具

**Files:**
- Create: `src/common/utils/no-generator.ts`

**Produces:** 所有单据的统一编号生成函数 `generateNo(prisma, prefix, tenantId)`

- [ ] **Step 1: 实现生成器**

```typescript
// src/common/utils/no-generator.ts
import { PrismaClient } from '@prisma/client';

const prefixMap: Record<string, { model: string; field: string }> = {
  BJ: { model: 'quotation', field: 'quotationNo' },
  SO: { model: 'order', field: 'orderNo' },
  PO: { model: 'purchaseOrder', field: 'purchaseNo' },
  IN: { model: 'inboundOrder', field: 'inboundNo' },
  DO: { model: 'deliveryOrder', field: 'deliveryNo' },
};

export async function generateNo(
  prisma: PrismaClient,
  prefix: string,
  tenantId: number,
): Promise<string> {
  const today = new Date();
  const dateStr = today.toISOString().slice(0, 10).replace(/-/g, '');
  const prefixWithDate = `${prefix}-${dateStr}-`;

  const config = prefixMap[prefix];
  if (!config) throw new Error(`Unknown prefix: ${prefix}`);

  const model = (prisma as any)[config.model];
  const records = await model.findMany({
    where: { tenantId, [config.field]: { startsWith: prefixWithDate } },
    orderBy: { [config.field]: 'desc' },
    take: 1,
  });

  let seq = 1;
  if (records.length > 0) {
    const lastNo: string = records[0][config.field];
    const lastSeq = parseInt(lastNo.split('-').pop() || '0', 10);
    seq = lastSeq + 1;
  }

  return `${prefixWithDate}${String(seq).padStart(3, '0')}`;
}
```

- [ ] **Step 2: 提交**

```bash
git add src/common/utils/
git commit -m "feat: add document number generator"
```

---

## P3: 核心业务

---

### Task 16: Quotation 报价单模块

**Files:**
- Create: `src/modules/quotation/quotation.module.ts`
- Create: `src/modules/quotation/quotation.service.ts`
- Create: `src/modules/quotation/quotation.controller.ts`
- Create: `src/modules/quotation/dto/create-quotation.dto.ts`
- Create: `src/modules/quotation/dto/update-quotation.dto.ts`
- Create: `src/modules/quotation/dto/query-quotation.dto.ts`

**Produces:** 报价单 CRUD + 状态流转 + 接受报价自动生成订单

**Consumes:** `generateNo` (Task 15)

- [ ] **Step 1: 创建 QuotationService 核心逻辑**

```typescript
// 关键方法:
// create(dto) — 校验 skuId 存在, 快照 items, 计算 totalAmount, 生成 quotationNo
// send(id) — draft -> sent
// accept(id) — sent -> accepted, 调用 OrderService.createFromQuotation
// reject(id) — sent -> rejected
// update(id, dto) | remove(id) — 仅 draft 状态可操作
```

- [ ] **Step 2: 创建 Controller**

端点：
```
GET    /api/quotations          — 分页列表
GET    /api/quotations/:id      — 详情
POST   /api/quotations          — 创建
PATCH  /api/quotations/:id      — 更新
PATCH  /api/quotations/:id/send — 发送
PATCH  /api/quotations/:id/accept — 接受（生成订单）
PATCH  /api/quotations/:id/reject — 拒绝
DELETE /api/quotations/:id      — 删除
```

- [ ] **Step 3: QuotationModule 使用 forwardRef 解决循环依赖**

```typescript
// QuotationModule imports: [forwardRef(() => OrderModule)]
// QuotationService injects: OrderService
```

- [ ] **Step 4: 注册并提交**

```bash
git add src/modules/quotation/ src/app.module.ts
git commit -m "feat: add quotation module with status flow and order generation"
```

---

### Task 17: Order 订单模块（核心）

**Files:**
- Create: `src/modules/order/order.module.ts`
- Create: `src/modules/order/order.service.ts`
- Create: `src/modules/order/order.controller.ts`
- Create: `src/modules/order/dto/create-order.dto.ts`
- Create: `src/modules/order/dto/add-item.dto.ts`
- Create: `src/modules/order/dto/update-item.dto.ts`

**Produces:** 订单创建（库存分流）、从报价单生成、增/改/减项 + OrderRevision 记录

- [ ] **Step 1: 实现 OrderService 核心逻辑**

关键业务流程：

```
create(dto):
  1. 生成 orderNo
  2. processItems() — 逐条检查 Sku.stock：
     - stock >= qty → source='stock', stock -= qty
     - 0 < stock < qty → source='custom', stock = 0
     - stock = 0 → source='custom'
  3. 创建 Order + OrderItem[]
  4. 返回完整订单

addItem(orderId, dto):
  1. 同样执行库存分流
  2. 创建 OrderItem
  3. 记录 OrderRevision { type: 'add', afterData }
  4. 重算 totalAmount

updateItem(orderId, itemId, dto):
  1. 记录 beforeData
  2. 更新 OrderItem
  3. 记录 OrderRevision { type: 'modify', beforeData, afterData }
  4. 重算 totalAmount

removeItem(orderId, itemId, reason):
  1. 如果 source='stock', 释放未发货库存 (qty - deliveredQty)
  2. 删除 OrderItem
  3. 记录 OrderRevision { type: 'remove', beforeData }
  4. 重算 totalAmount
```

- [ ] **Step 2: 创建 Controller**

```
GET    /api/orders                        — 分页列表
GET    /api/orders/:id                    — 详情（含 items + revisions）
POST   /api/orders                        — 手动创建
POST   /api/orders/from-quotation/:qid    — 从报价单生成
POST   /api/orders/:id/items              — 增项
PATCH  /api/orders/:id/items/:itemId      — 改项
DELETE /api/orders/:id/items/:itemId      — 减项
PATCH  /api/orders/:id/status             — 更新状态
```

- [ ] **Step 3: OrderModule 使用 forwardRef 解决循环依赖**

```typescript
// OrderModule imports: [forwardRef(() => QuotationModule)]
// OrderService exports to QuotationService
```

- [ ] **Step 4: 注册并提交**

```bash
git add src/modules/order/ src/app.module.ts
git commit -m "feat: add core order module with stock splitting and change tracking"
```

---

### Task 18: Purchase 采购单模块

**Files:**
- Create: `src/modules/purchase/purchase.module.ts`
- Create: `src/modules/purchase/purchase.service.ts`
- Create: `src/modules/purchase/purchase.controller.ts`
- Create: DTOs

**Produces:** 采购单 CRUD + 自动生成（从订单 custom 条目聚合）+ 状态流转

- [ ] **Step 1: 实现 PurchaseService**

核心方法：
```
generateFromOrder(orderId):
  查询 OrderItem 中 source='custom' 的条目
  → 聚合生成 PurchaseOrder + PurchaseOrderItem[]
  → 回写 OrderItem.purchaseOrderId

confirm(id): pending → confirmed
updateStatus(id, status): partial_received / received (由入库单触发)
```

- [ ] **Step 2: 创建 Controller + Module**

```
GET    /api/purchase-orders         — 列表
GET    /api/purchase-orders/:id     — 详情
POST   /api/purchase-orders         — 手动创建
PATCH  /api/purchase-orders/:id/confirm — 确认
PATCH  /api/purchase-orders/:id/status  — 更新状态
```

- [ ] **Step 3: 提交**

```bash
git add src/modules/purchase/ src/app.module.ts
git commit -m "feat: add purchase order module with auto-generation"
```

---

### Task 19: Inventory 模块（入库单 + 发货单）

**Files:**
- Create: `src/modules/inventory/inventory.module.ts`
- Create: `src/modules/inventory/inbound.service.ts`
- Create: `src/modules/inventory/inbound.controller.ts`
- Create: `src/modules/inventory/delivery.service.ts`
- Create: `src/modules/inventory/delivery.controller.ts`
- Create: DTOs

**Produces:** 入库单（确认→更新库存）、发货单（创建/发货/签收/跟踪 deliveredQty）

- [ ] **Step 1: 实现 InboundService**

核心 `confirm(id)` 逻辑：
```
1. 读取 InboundOrder.items [{purchaseItemId, qty}]
2. 逐条更新 PurchaseOrderItem.receivedQty += qty
3. 匹配 skuCode 更新 Sku.stock += qty
4. 更新 InboundOrder status = 'confirmed'
5. 检查 PurchaseOrder 是否全部到货 → 更新其 status
```

- [ ] **Step 2: 实现 DeliveryService**

核心方法：
```
create(dto):
  1. 校验每个 orderItemId 的 deliveredQty + qty <= qty
  2. 生成 deliveryNo
  3. 创建 DeliveryOrder + DeliveryItem[]

ship(id, dto):
  1. 填写物流信息
  2. 逐个更新 OrderItem.deliveredQty += qty
  3. status → 'shipped'
  4. 检查订单是否全部发完 → 更新 Order.status

sign(id): status → 'signed'
```

- [ ] **Step 3: 创建 InventoryModule 统合 Inbound + Delivery**

- [ ] **Step 4: 提交**

```bash
git add src/modules/inventory/ src/app.module.ts
git commit -m "feat: add inventory module with inbound and delivery orders"
```

---

## P4: 收尾

---

### Task 20: Settlement 对账模块

**Files:**
- Create: `src/modules/settlement/settlement.module.ts`
- Create: `src/modules/settlement/settlement.service.ts`
- Create: `src/modules/settlement/settlement.controller.ts`
- Create: DTOs

**Produces:** 条目级对账 + 收款确认 + 应收/已收/未收汇总

- [ ] **Step 1: 实现 SettlementService**

```
getSummary(query): 按订单/客户汇总应收/已收/未收
reconcile(dto): 按 OrderItem 逐条记录收款
findByOrder(orderId): 查看某订单的对账明细（按条目展开）
```

- [ ] **Step 2: 创建 Controller + Module**

```
GET    /api/settlements/order/:orderId  — 订单对账明细
GET    /api/settlements/summary         — 汇总
POST   /api/settlements/reconcile       — 确认收款
```

- [ ] **Step 3: 提交**

```bash
git add src/modules/settlement/ src/app.module.ts
git commit -m "feat: add settlement module with item-level reconciliation"
```

---

### Task 21: 种子数据完善 + Docker Compose

**Files:**
- Modify: `src/prisma/seed.ts`（添加示例客户/供应商）
- Create: `Dockerfile`
- Create: `docker-compose.yml`

- [ ] **Step 1: 补充种子数据**（2-3 个客户 + 1-2 个供应商）
- [ ] **Step 2: 创建 Dockerfile**（node:20-alpine, pnpm install, build, start）
- [ ] **Step 3: 创建 docker-compose.yml**（postgres:16 + app, 环境变量注入）
- [ ] **Step 4: 提交**

```bash
git add src/prisma/seed.ts Dockerfile docker-compose.yml
git commit -m "feat: finalize seed data and add Docker Compose"
```

---

### Task 22: 最终验证

- [ ] **Step 1: 重置数据库**

```bash
npx prisma migrate reset --force
```

- [ ] **Step 2: 启动服务**

```bash
pnpm start:dev
```

- [ ] **Step 3: 端到端流程测试**

```bash
# 1. 登录获取 token
# 2. 创建报价单
# 3. 接受报价 → 自动生成订单
# 4. 验证订单 items source 分流（stock vs custom）
# 5. custom 条目自动生成采购单
# 6. 创建入库单 → 确认入库 → 验证 Sku.stock 增加
# 7. 创建发货单 → 发货 → 验证 OrderItem.deliveredQty
# 8. 签收 → 对账 → 验证 Settlement
```

Expected: 全链路返回 `code: 0`

- [ ] **Step 4: 最终提交**

```bash
git add -A
git commit -m "chore: final verification and cleanup"
```

---

## 模块依赖关系

```
共用层: PrismaService, TenantContextService (所有模块依赖)
Auth: JWT 签发, 独立
Category → Product → Sku
Customer → Quotation → Order
                    Order → Purchase → InboundOrder
                    Order → DeliveryOrder
                    Order → Settlement
Supplier → Purchase
```

Quotation ↔ Order 循环依赖通过 `forwardRef` 解决。

---

## 文件清单总计

| 阶段 | 文件数 | 模块 |
|------|--------|------|
| P1 | 18 | Prisma + Common(6) + Auth(7) + Tenant middleware(2) + main.ts + app.module.ts |
| P2 | 35 | 4 CRUD × 6 + Category(5) + Product/SKU(10) + Seed + Abbreviation + NoGenerator |
| P3 | 25 | Quotation(6) + Order(6) + Purchase(6) + Inventory(8) |
| P4 | 6 | Settlement(4) + Dockerfile + docker-compose |
| **合计** | **~84** | |

