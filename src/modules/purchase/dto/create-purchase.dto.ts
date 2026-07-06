import { IsInt, IsArray, ValidateNested, IsNumber, IsOptional, IsDateString, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PurchaseItemDto {
  @ApiProperty({ description: '商品名称' })
  @IsString() productName: string;
  @ApiProperty({ description: 'SKU编码' })
  @IsString() skuCode: string;
  @ApiProperty({ description: '数量' })
  @IsInt() @Min(1) qty: number;
  @ApiProperty({ description: '单价' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) unitPrice: number;
}

export class CreatePurchaseDto {
  @ApiProperty({ description: '供应商ID' })
  @IsInt() supplierId: number;
  @ApiProperty({ description: '条目列表' })
  @IsArray() @ValidateNested({ each: true }) @Type(() => PurchaseItemDto) items: PurchaseItemDto[];
  @ApiPropertyOptional({ description: '预计到货日期' })
  @IsOptional() @IsDateString() expectedDate?: string;
}
