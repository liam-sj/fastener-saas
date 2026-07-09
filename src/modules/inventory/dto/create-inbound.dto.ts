import {
  IsInt,
  IsArray,
  ValidateNested,
  Min,
  IsString,
  IsOptional,
  IsNumber,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

class InboundItemDto {
  @ApiPropertyOptional({ description: '采购条目ID(关联采购单明细时传入)' })
  @IsOptional()
  @IsInt()
  purchaseOrderItemId?: number;

  @ApiProperty({ description: 'SKU编码' })
  @IsString()
  skuCode: string;

  @ApiProperty({ description: '产品名称' })
  @IsString()
  productName: string;

  @ApiPropertyOptional({ description: '规格属性' })
  @IsOptional()
  skuAttrs?: Record<string, any>;

  @ApiProperty({ description: '入库数量' })
  @IsInt()
  @Min(1)
  qty: number;

  @ApiProperty({ description: '入库单价(成本)' })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  unitCost: number;
}

export class CreateInboundDto {
  @ApiProperty({ description: '采购单ID' })
  @IsInt()
  purchaseOrderId: number;

  @ApiProperty({ description: '入库条目列表' })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => InboundItemDto)
  items: InboundItemDto[];
}
