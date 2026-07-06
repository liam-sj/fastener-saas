import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryProductDto {
  @ApiPropertyOptional({ description: '页码' })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @ApiPropertyOptional({ description: '每页条数' })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) pageSize?: number = 20;
  @ApiPropertyOptional({ description: '关键词搜索' })
  @IsOptional() @IsString() keyword?: string;
  @ApiPropertyOptional({ description: '分类ID' })
  @IsOptional() @IsInt() @Type(() => Number) categoryId?: number;
  @ApiPropertyOptional({ description: '标签' })
  @IsOptional() @IsString() tag?: string;
}
