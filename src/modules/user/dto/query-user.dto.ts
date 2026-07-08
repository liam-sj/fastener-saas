import { IsOptional, IsString, IsInt, Min, Max, IsIn } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryUserDto {
  @ApiPropertyOptional({ description: '页码' })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @ApiPropertyOptional({ description: '每页条数' })
  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) pageSize?: number = 20;
  @ApiPropertyOptional({ description: '关键词搜索' })
  @IsOptional() @IsString() keyword?: string;
  @ApiPropertyOptional({ description: '角色' })
  @IsOptional() @IsString() @IsIn(['admin', 'manager', 'staff']) role?: string;
}
