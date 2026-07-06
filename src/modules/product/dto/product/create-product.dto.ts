import { IsString, IsOptional, IsInt, IsArray } from 'class-validator';

export class CreateProductDto {
  @IsInt() categoryId: number;
  @IsString() name: string;
  @IsOptional() @IsString() description?: string;
  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
