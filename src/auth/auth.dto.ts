import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString, MinLength, MaxLength, IsPhoneNumber, Length, Matches } from 'class-validator';

export class SignupDto {
  @ApiProperty()
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^(?!.*\.\.)(?!.*\.$)(?!.*_$)[a-zA-Z0-9._]+$/)
  username: string;

  @ApiProperty()
  @IsEmail()
  email: string;

  @ApiProperty()
  @IsPhoneNumber('RU')
  phone: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  fullName: string;

  @ApiProperty()
  @IsString()
  @MinLength(8)
  password: string;
}

export class VerifyDto {
  @ApiProperty()
  @IsString()
  login: string;

  @ApiProperty()
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  code: string;
}

export class SigninDto {
  @ApiProperty()
  @IsString()
  login: string;

  @ApiProperty()
  @IsString()
  password: string;
}

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  @IsNotEmpty()
  refreshToken: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  @ApiProperty()
  email: string;
}

export class RestorePasswordDto {
  @IsEmail()
  @ApiProperty()
  email: string;

  @IsString()
  @Length(6, 6)
  @ApiProperty()
  code: string;

  @IsString()
  @ApiProperty()
  newPassword: string;
}

export class ResendVerifyDto {
  @IsEmail()
  @ApiProperty()
  email: string;
}

export class TokenVerifyDto {
  @IsString()
  @ApiProperty()
  token: string;
}

