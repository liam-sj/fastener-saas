import { IsString, IsOptional } from 'class-validator';

export class ShipDto {
  @IsOptional() @IsString() logisticsCompany?: string;
  @IsOptional() @IsString() trackingNo?: string;
}
