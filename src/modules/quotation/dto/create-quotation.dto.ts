import { IsInt, IsArray, ValidateNested, IsNumber, IsOptional, IsDateString, Min } from 'class-validator';
import { Type } from 'class-transformer';

class QuotationItemDto {
  @IsInt() productId: number;
  @IsInt() skuId: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) unitPrice: number;
  @IsInt() @Min(1) qty: number;
}

export class CreateQuotationDto {
  @IsInt() customerId: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => QuotationItemDto) items: QuotationItemDto[];
  @IsOptional() @IsDateString() validUntil?: string;
}
