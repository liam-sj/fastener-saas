import { IsInt, IsNumber, Min } from 'class-validator';

export class AddItemDto {
  @IsInt() skuId: number;
  @IsInt() @Min(1) qty: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) price: number;
}
