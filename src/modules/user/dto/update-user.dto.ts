import { IsString, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';

export class UpdateUserDto {
  @IsOptional() @IsString() @MinLength(3) @MaxLength(30) username?: string;
  @IsOptional() @IsString() @MinLength(6) @MaxLength(50) password?: string;
  @IsOptional() @IsString() @IsIn(['admin', 'manager', 'staff']) role?: string;
}
