import {
  Injectable,
  NestInterceptor,
  ExecutionContext,
  CallHandler,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { TenantContextService } from '../services/tenant-context.service';

@Injectable()
export class TenantInterceptor implements NestInterceptor {
  constructor(private readonly tenantCtx: TenantContextService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest();
    const user = req.user;
    if (!user) {
      return next.handle();
    }

    return new Observable((subscriber) => {
      this.tenantCtx.run(
        {
          tenantId: user.tenantId,
          userId: user.userId,
          role: user.role,
        },
        () => {
          next.handle().subscribe({
            next: (value) => subscriber.next(value),
            error: (err) => subscriber.error(err),
            complete: () => subscriber.complete(),
          });
        },
      );
    });
  }
}
