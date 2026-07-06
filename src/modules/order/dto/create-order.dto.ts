import { IsInt, IsArray, ValidateNested, IsNumber, IsOptional, Min } from 'class-validator';
import { Type } from 'class-transformer';

class CreateOrderItemDto {
  @IsInt() skuId: number;
  @IsInt() @Min(1) qty: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) price: number;
}

export class CreateOrderDto {
  @IsInt() customerId: number;
  @IsOptional() @IsInt() quotationId?: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => CreateOrderItemDto) items: CreateOrderItemDto[];
}
