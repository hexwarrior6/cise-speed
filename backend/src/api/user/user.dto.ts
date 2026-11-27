import { IsEmail, IsEnum, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';
import { UserRole } from './user.schema';
export class CreateUserDto {
  @IsString() @Length(1, 80)
  username: string;
  @IsEmail() @MaxLength(254)
  email: string;
  @IsString() @MinLength(8) @MaxLength(72)
  password: string;
  @IsOptional() @IsEnum(UserRole)
  role?: UserRole;
  @IsOptional() @IsString() @MaxLength(80)
  firstName?: string;
  @IsOptional() @IsString() @MaxLength(80)
  lastName?: string;
}
export class LoginUserDto {
  @IsEmail() @MaxLength(254)
  email: string;
  @IsString() @Length(1, 72)
  password: string;
}
export class UpdateRoleDto {
  @IsEnum(UserRole)
  role: UserRole;
}
export class LoginResponseDto {
  access_token: string;
  user: { id: string; username: string; email: string; role: UserRole };
}
