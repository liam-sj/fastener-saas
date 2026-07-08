import { IsOptional, IsString, IsInt, Min, Max } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class QueryQuotationDto {
  @ApiPropertyOptional({ description: '页码' })
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @ApiPropertyOptional({ description: '每页条数' })
  @IsOptional() @IsInt() @Min(1) @Max(100) @Type(() => Number) pageSize?: number = 20;
  @ApiPropertyOptional({ description: '状态' })
  @IsOptional() @IsString() status?: string;
  @ApiPropertyOptional({ description: '客户ID' })
  @IsOptional() @IsInt() @Type(() => Number) customerId?: number;
  @ApiPropertyOptional({ description: '关键词搜索' })
  @IsOptional() @IsString() keyword?: string;
}
