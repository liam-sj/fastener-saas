import { IsOptional, IsString, IsInt, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryProductDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) pageSize?: number = 20;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsInt() @Type(() => Number) categoryId?: number;
  @IsOptional() @IsString() tag?: string;
}
