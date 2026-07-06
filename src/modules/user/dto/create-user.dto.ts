import { IsString, MinLength, MaxLength, IsOptional, IsIn } from 'class-validator';

export class CreateUserDto {
  @IsString() @MinLength(3) @MaxLength(30) username: string;
  @IsString() @MinLength(6) @MaxLength(50) password: string;
  @IsOptional() @IsString() @IsIn(['admin', 'manager', 'staff']) role?: string = 'staff';
}
