import { IsObject, IsNumber, IsOptional, IsInt, Min } from 'class-validator';

export class CreateSkuDto {
  @IsObject() attributes: Record<string, string>;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price: number;
  @IsOptional() @IsInt() @Min(0) stock?: number = 0;
}
