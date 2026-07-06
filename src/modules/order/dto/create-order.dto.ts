import { IsInt, IsArray, ValidateNested, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class CreateOrderItemDto {
  @ApiProperty({ description: 'SKU ID' })
  @IsInt() skuId: number;
  @ApiProperty({ description: '数量' })
  @IsInt() @Min(1) qty: number;
  @ApiProperty({ description: '单价' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) price: number;
}

export class CreateOrderDto {
  @ApiProperty({ description: '客户ID' })
  @IsInt() customerId: number;
  @ApiPropertyOptional({ description: '报价单ID' })
  @IsOptional() @IsInt() quotationId?: number;
  @ApiProperty({ description: '条目列表' })
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateOrderItemDto) items: CreateOrderItemDto[];
}
