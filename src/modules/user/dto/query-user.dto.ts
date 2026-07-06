import { IsOptional, IsString, IsInt, Min, IsIn } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryUserDto {
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) page?: number = 1;
  @IsOptional() @IsInt() @Min(1) @Type(() => Number) pageSize?: number = 20;
  @IsOptional() @IsString() keyword?: string;
  @IsOptional() @IsString() @IsIn(['admin', 'manager', 'staff']) role?: string;
}
