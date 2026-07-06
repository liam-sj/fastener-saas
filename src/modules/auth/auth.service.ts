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

    let matchedUser: typeof users[number] | null = null;
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
