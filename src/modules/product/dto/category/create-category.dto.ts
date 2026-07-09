import { IsString, IsOptional, IsInt, IsObject } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class CreateCategoryDto {
  @ApiProperty({ description: '名称' })
  @IsString()
  name: string;
  @ApiPropertyOptional({ description: '父级ID' })
  @IsOptional()
  @IsInt()
  parentId?: number;
  @ApiPropertyOptional({ description: '规格模板' })
  @IsOptional()
  @IsObject()
  specTemplate?: Record<string, string[]>;
}
