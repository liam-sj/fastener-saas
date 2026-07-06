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
