import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { CommonModule } from './common/common.module';
import { AuthModule } from './modules/auth/auth.module';
import { TenantModule } from './modules/tenant/tenant.module';
import { UserModule } from './modules/user/user.module';
import { CustomerModule } from './modules/customer/customer.module';
import { SupplierModule } from './modules/supplier/supplier.module';
import { ProductModule } from './modules/product/product.module';
import { QuotationModule } from './modules/quotation/quotation.module';
import { OrderModule } from './modules/order/order.module';
import { PurchaseModule } from './modules/purchase/purchase.module';
import { InventoryModule } from './modules/inventory/inventory.module';
import { SettlementModule } from './modules/settlement/settlement.module';
import { TenantInterceptor } from './common/interceptors/tenant.interceptor';
import { JwtAuthGuard } from './modules/auth/jwt-auth.guard';

@Module({
  imports: [PrismaModule, CommonModule, AuthModule, TenantModule, UserModule, CustomerModule, SupplierModule, ProductModule, QuotationModule, OrderModule, PurchaseModule, InventoryModule, SettlementModule],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_INTERCEPTOR, useClass: TenantInterceptor },
  ],
})
export class AppModule {}
