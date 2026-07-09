import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../decorators/roles.decorator';

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(
      ROLES_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requiredRoles || requiredRoles.length === 0) {
      return true;
    }
    const { user } = context.switchToHttp().getRequest();
    if (!user) {
      // 标了 @Roles 但 req.user 为空 = JwtAuthGuard 未执行或守卫顺序配置错误
      throw new Error(
        '接口需角色但用户上下文为空 —— 检查 @Public 是否误与 @Roles 共存',
      );
    }
    return requiredRoles.includes(user.role);
  }
}
