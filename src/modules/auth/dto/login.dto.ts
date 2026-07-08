import { IsString, IsInt, MinLength } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ description: '租户ID' })
  @IsInt()
  tenantId: number;

  @ApiProperty({ description: '用户名' })
  @IsString()
  @MinLength(3)
  username: string;

  @ApiProperty({ description: '密码' })
  @IsString()
  @MinLength(6)
  password: string;
}
