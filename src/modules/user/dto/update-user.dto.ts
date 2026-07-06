import { IsString, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional({ description: '用户名' })
  @IsOptional() @IsString() @MinLength(3) @MaxLength(30) username?: string;
  @ApiPropertyOptional({ description: '密码' })
  @IsOptional() @IsString() @MinLength(6) @MaxLength(50) password?: string;
  @ApiPropertyOptional({ description: '角色' })
  @IsOptional() @IsString() @IsIn(['admin', 'manager', 'staff']) role?: string;
}
