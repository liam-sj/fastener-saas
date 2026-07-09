import { IsString, IsOptional } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class ShipDto {
  @ApiPropertyOptional({ description: '物流公司' })
  @IsOptional()
  @IsString()
  logisticsCompany?: string;
  @ApiPropertyOptional({ description: '运单号' })
  @IsOptional()
  @IsString()
  trackingNo?: string;
}
