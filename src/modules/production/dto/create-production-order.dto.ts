import {
  IsInt,
  IsArray,
  ValidateNested,
  IsOptional,
  IsString,
  IsDateString,
  IsEnum,
  Min,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class ProcessStepDto {
  @ApiProperty({ description: '顺序号(按实际工艺排序)', example: 1 })
  @IsInt()
  @Min(1)
  sequence: number;

  @ApiProperty({
    description: '阶段',
    enum: ['preparation', 'forming', 'threading', 'post_treatment'],
  })
  @IsEnum(['preparation', 'forming', 'threading', 'post_treatment'])
  stage: string;

  @ApiProperty({
    description: '工序类型',
    enum: [
      'feeding',
      'turning',
      'milling',
      'grinding',
      'drilling',
      'rolling',
      'heat_treatment',
      'surface_treatment',
    ],
  })
  @IsEnum([
    'feeding',
    'turning',
    'milling',
    'grinding',
    'drilling',
    'rolling',
    'heat_treatment',
    'surface_treatment',
  ])
  stepType: string;

  @ApiProperty({ description: '工序名' })
  @IsString()
  name: string;

  @ApiProperty({ description: '加工方式', enum: ['self', 'outsource'] })
  @IsEnum(['self', 'outsource'])
  type: string;

  @ApiPropertyOptional({ description: '外协供应商ID' })
  @IsOptional()
  @IsInt()
  supplierId?: number;

  @ApiPropertyOptional({ description: '表面处理方式(镀锌/镀彩/达克罗/热镀锌)' })
  @IsOptional()
  @IsString()
  surfaceMethod?: string;

  @ApiProperty({ description: '计划投入量' })
  @IsInt()
  @Min(0)
  plannedQty: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}

export class CreateProductionOrderDto {
  @ApiProperty({ description: '订单条目ID(定制件)' })
  @IsInt()
  orderItemId: number;

  @ApiPropertyOptional({ description: '计划完工日' })
  @IsOptional()
  @IsDateString()
  plannedFinishDate?: string;

  @ApiProperty({ description: '工序链', type: [ProcessStepDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ProcessStepDto)
  steps: ProcessStepDto[];
}
