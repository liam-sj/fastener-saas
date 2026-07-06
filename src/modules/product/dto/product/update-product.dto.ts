import { IsString, IsOptional, IsInt, IsArray } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProductDto {
  @ApiPropertyOptional({ description: '分类ID' })
  @IsOptional() @IsInt() categoryId?: number;
  @ApiPropertyOptional({ description: '名称' })
  @IsOptional() @IsString() name?: string;
  @ApiPropertyOptional({ description: '描述' })
  @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ description: '图片' })
  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
  @ApiPropertyOptional({ description: '标签' })
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
