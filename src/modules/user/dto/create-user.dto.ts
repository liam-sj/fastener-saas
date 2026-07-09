import {
  IsString,
  MinLength,
  MaxLength,
  IsOptional,
  IsIn,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty({ description: '用户名' })
  @IsString()
  @MinLength(3)
  @MaxLength(30)
  username: string;
  @ApiProperty({ description: '密码' })
  @IsString()
  @MinLength(6)
  @MaxLength(50)
  password: string;
  @ApiPropertyOptional({ description: '角色' })
  @IsOptional()
  @IsString()
  @IsIn(['admin', 'manager', 'staff'])
  role?: string = 'staff';
}
