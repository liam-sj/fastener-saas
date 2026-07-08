import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../../prisma/prisma.service';

export interface JwtPayload {
  sub: number;
  tenantId: number;
  role: string;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly prisma: PrismaService) {
    // JWT_SECRET 的存在性和长度已由 env.validation.ts 统一校验,此处直接使用
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET!,
    });
  }

  async validate(payload: JwtPayload) {
    if (!payload.sub || !payload.tenantId) {
      throw new UnauthorizedException('无效的 token');
    }

    // 校验用户仍存在且未被封禁/删除(封禁用户后旧 token 即时失效)
    const user = await this.prisma.user.findFirst({
      where: { id: payload.sub, tenantId: payload.tenantId },
      select: { id: true, role: true },
    });
    if (!user) throw new UnauthorizedException('用户不存在或已禁用');

    return { userId: user.id, tenantId: payload.tenantId, role: user.role };
  }
}
