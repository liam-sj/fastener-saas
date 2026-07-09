import { IsInt, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateQuotationDto {
  @ApiPropertyOptional({ description: '客户ID' })
  @IsOptional()
  @IsInt()
  customerId?: number;
}
