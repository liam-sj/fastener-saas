import { IsInt, IsOptional } from 'class-validator';

export class UpdateQuotationDto {
  @IsOptional() @IsInt() customerId?: number;
}
