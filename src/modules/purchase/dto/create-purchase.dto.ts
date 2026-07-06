import { IsInt, IsArray, ValidateNested, IsNumber, IsOptional, IsDateString, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

class PurchaseItemDto {
  @IsString() productName: string;
  @IsString() skuCode: string;
  @IsInt() @Min(1) qty: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) unitPrice: number;
}

export class CreatePurchaseDto {
  @IsInt() supplierId: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseItemDto) items: PurchaseItemDto[];
  @IsOptional() @IsDateString() expectedDate?: string;
}
