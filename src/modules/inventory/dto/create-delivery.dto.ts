import { IsInt, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class DeliveryItemDto {
  @IsInt() orderItemId: number;
  @IsInt() @Min(1) qty: number;
}

export class CreateDeliveryDto {
  @IsInt() orderId: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => DeliveryItemDto) items: DeliveryItemDto[];
}
