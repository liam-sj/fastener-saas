import { IsInt, IsNumber, IsOptional, IsString, Min } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateItemDto {
  @ApiPropertyOptional({ description: '数量' })
  @IsOptional()
  @IsInt()
  @Min(1)
  qty?: number;
  @ApiPropertyOptional({ description: '单价' })
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  price?: number;
  @ApiPropertyOptional({ description: '原因' })
  @IsOptional()
  @IsString()
  reason?: string;
}
