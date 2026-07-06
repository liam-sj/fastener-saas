import { IsInt, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty } from '@nestjs/swagger';

class InboundItemDto {
  @ApiProperty({ description: '采购条目ID' })
  @IsInt() purchaseItemId: number;
  @ApiProperty({ description: '数量' })
  @IsInt() @Min(1) qty: number;
}

export class CreateInboundDto {
  @ApiProperty({ description: '采购单ID' })
  @IsInt() purchaseOrderId: number;
  @ApiProperty({ description: '条目列表' })
  @IsArray() @ValidateNested({ each: true }) @Type(() => InboundItemDto) items: InboundItemDto[];
}
