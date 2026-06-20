import { IsString, MinLength, Matches } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class ResetPasswordDto {
  @ApiProperty({ example: 'eyJhbGciOiJIUzI1NiIs...' })
  @IsString()
  @MinLength(1)
  token!: string;

  @ApiProperty({ example: 'NewPassword123!' })
  @IsString()
  @MinLength(8, { message: '密码至少 8 位' })
  @Matches(/[A-Z]/, { message: '密码需包含大写字母' })
  @Matches(/[a-z]/, { message: '密码需包含小写字母' })
  @Matches(/[0-9]/, { message: '密码需包含数字' })
  newPassword!: string;
}
