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
