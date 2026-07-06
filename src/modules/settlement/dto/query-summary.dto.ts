import { IsOptional, IsInt, Min, IsString } from 'class-validator';
import { Type } from 'class-transformer';

export class QuerySummaryDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) pageSize?: number = 20;
  @IsOptional() @IsInt() @Type(() => Number) customerId?: number;
  @IsOptional() @IsString() status?: string;
}
