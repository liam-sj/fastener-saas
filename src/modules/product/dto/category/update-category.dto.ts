import { IsString, IsOptional, IsInt, IsObject } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCategoryDto {
  @ApiPropertyOptional({ description: '名称' })
  @IsOptional()
  @IsString()
  name?: string;
  @ApiPropertyOptional({ description: '父级ID' })
  @IsOptional()
  @IsInt()
  parentId?: number;
  @ApiPropertyOptional({ description: '规格模板' })
  @IsOptional()
  @IsObject()
  specTemplate?: Record<string, string[]>;
}
