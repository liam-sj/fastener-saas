import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class UpdateItemDto {
  @IsOptional() @IsInt() @Min(1) qty?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) price?: number;
  @IsOptional() @IsString() reason?: string;
}
