import { IsOptional, IsInt, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';

export class MatchSkuDto {
  @ApiPropertyOptional({ description: '匹配的 SKU ID' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  skuId?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
