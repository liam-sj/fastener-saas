import { IsInt, IsArray, ValidateNested, Min } from 'class-validator';
import { Type } from 'class-transformer';

class InboundItemDto {
  @IsInt() purchaseItemId: number;
  @IsInt() @Min(1) qty: number;
}

export class CreateInboundDto {
  @IsInt() purchaseOrderId: number;
  @IsArray() @ValidateNested({ each: true }) @Type(() => InboundItemDto) items: InboundItemDto[];
}
