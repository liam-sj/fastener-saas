import { IsNumber, IsArray, ValidateNested, IsOptional, IsDateString } from 'class-validator';
import { Type } from 'class-transformer';

export class ReconcileItemDto {
  @IsNumber()
  orderItemId: number;

  @IsNumber()
  amount: number;
}

export class ReconcileDto {
  @IsNumber()
  orderId: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ReconcileItemDto)
  items: ReconcileItemDto[];

  @IsOptional()
  @IsDateString()
  paidAt?: string;
}
