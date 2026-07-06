import { IsInt, IsNumber, Min } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class AddItemDto {
  @ApiProperty({ description: 'SKU ID' })
  @IsInt() skuId: number;
  @ApiProperty({ description: '数量' })
  @IsInt() @Min(1) qty: number;
  @ApiProperty({ description: '单价' })
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) price: number;
}
