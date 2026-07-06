import { IsString, IsOptional, IsInt, IsObject } from 'class-validator';

export class UpdateCategoryDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsInt() parentId?: number;
  @IsOptional() @IsObject() specTemplate?: Record<string, string[]>;
}
