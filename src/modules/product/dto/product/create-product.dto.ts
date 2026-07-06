import { IsString, IsOptional, IsInt, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateProductDto {
  @ApiProperty({ description: '分类ID' })
  @IsInt() categoryId: number;
  @ApiProperty({ description: '名称' })
  @IsString() name: string;
  @ApiPropertyOptional({ description: '描述' })
  @IsOptional() @IsString() description?: string;
  @ApiPropertyOptional({ description: '图片' })
  @IsOptional() @IsArray() @IsString({ each: true }) images?: string[];
  @ApiPropertyOptional({ description: '标签' })
  @IsOptional() @IsArray() @IsString({ each: true }) tags?: string[];
}
