import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateProcessStepDto {
  @ApiPropertyOptional({ description: '实际产出量' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  actualQty?: number;

  @ApiPropertyOptional({ description: '损耗量' })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  lossQty?: number;

  @ApiPropertyOptional({ description: '备注' })
  @IsOptional()
  @IsString()
  remark?: string;
}
