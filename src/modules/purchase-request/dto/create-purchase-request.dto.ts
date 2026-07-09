import {
  IsInt,
  IsArray,
  ValidateNested,
  IsOptional,
  IsString,
  IsDateString,
  IsNumber,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class PurchaseRequestItemDto {
  @ApiProperty({ description: '产品名称(客户原始描述)' })
  @IsString()
  productName: string;

  @ApiPropertyOptional({ description: '规格材质长度的裸文本' })
  @IsOptional()
  @IsString()
  specText?: string;

  @ApiPropertyOptional({ description: '结构化属性(规格/材质/表面处理)' })
  @IsOptional()
  attributes?: Record<string, unknown>;

  @ApiProperty({ description: '需求数量' })
  @IsInt()
  @Min(1)
  qty: number;

  @ApiPropertyOptional({ description: '客户期望单价(议价锚点)' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  targetPrice?: number;

  @ApiPropertyOptional({ description: '商户后期匹配的 SKU ID' })
  @IsOptional()
  @IsInt()
  skuId?: number;
}

export class CreatePurchaseRequestDto {
  @ApiProperty({ description: '客户ID' })
  @IsInt()
  customerId: number;

  @ApiPropertyOptional({ description: '客户期望交期' })
  @IsOptional()
  @IsDateString()
  expectedDate?: string;

  @ApiPropertyOptional({ description: '客户特殊要求/用途' })
  @IsOptional()
  @IsString()
  remark?: string;

  @ApiProperty({ description: '条目列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => PurchaseRequestItemDto)
  items: PurchaseRequestItemDto[];
}
