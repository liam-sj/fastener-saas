import { IsObject, IsNumber, IsOptional, IsInt, Min } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateSkuDto {
  @ApiProperty({ description: '属性' })
  @IsObject()
  attributes: Record<string, string>;
  @ApiProperty({ description: '单价' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;
  @ApiPropertyOptional({ description: '库存' })
  @IsOptional()
  @IsInt()
  @Min(0)
  stock?: number = 0;
}
