import {
  IsInt,
  IsArray,
  ValidateNested,
  IsNumber,
  IsOptional,
  IsDateString,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class QuotationItemDto {
  @ApiProperty({ description: '商品ID' })
  @IsInt()
  productId: number;
  @ApiProperty({ description: 'SKU ID' })
  @IsInt()
  skuId: number;
  @ApiProperty({ description: '单价' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  unitPrice: number;
  @ApiProperty({ description: '数量' })
  @IsInt()
  @Min(1)
  qty: number;
}

export class CreateQuotationDto {
  @ApiProperty({ description: '客户ID' })
  @IsInt()
  customerId: number;

  @ApiPropertyOptional({
    description: '关联订购单ID(多版本报价属于同一订购单)',
  })
  @IsOptional()
  @IsInt()
  purchaseRequestId?: number;

  @ApiProperty({ description: '条目列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => QuotationItemDto)
  items: QuotationItemDto[];

  @ApiPropertyOptional({ description: '有效期至' })
  @IsOptional()
  @IsDateString()
  validUntil?: string;
}
