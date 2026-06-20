import { IsEmail, IsString, MinLength, MaxLength, Matches, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class RegisterDto {
  @ApiProperty({ example: 'dev@example.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'cooldev', minLength: 3, maxLength: 20 })
  @IsString()
  @MinLength(3)
  @MaxLength(20)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: 'Username can only contain letters, numbers, and underscores' })
  username!: string;

  @ApiProperty({ example: 'MyStr0ng!Pass' })
  @IsString()
  @MinLength(8)
  @Matches(/[A-Z]/, { message: 'Password must contain at least one uppercase letter' })
  @Matches(/[a-z]/, { message: 'Password must contain at least one lowercase letter' })
  @Matches(/[0-9]/, { message: 'Password must contain at least one digit' })
  password!: string;

  @ApiProperty({ example: 'Cool Dev' })
  @IsString()
  @MinLength(2)
  @MaxLength(30)
  displayName!: string;

  /**
   * 前端设备指纹（FNV-1a 哈希）
   * 用于识别同一浏览器的重复登录，实现会话 UPDATE 而非 INSERT。
   */
  @ApiProperty({ example: 'a3f1c9b2', required: false })
  @IsOptional()
  @IsString()
  fingerprint?: string;
}
