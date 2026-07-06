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
