import { IsObject, IsNumber, IsOptional, IsInt, Min } from 'class-validator';

export class UpdateSkuDto {
  @IsOptional() @IsObject() attributes?: Record<string, string>;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) price?: number;
  @IsOptional() @IsInt() @Min(0) stock?: number;
}
