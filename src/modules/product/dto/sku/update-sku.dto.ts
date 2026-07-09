import { IsObject, IsNumber, IsOptional, IsInt, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateSkuDto {
  @ApiPropertyOptional({ description: '属性' })
  @IsOptional()
  @IsObject()
  attributes?: Record<string, string>;
  @ApiPropertyOptional({ description: '单价' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price?: number;
  @ApiPropertyOptional({ description: '库存' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number;
}
