import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class LoginDto {
  @ApiProperty({ example: 'admin@devpulse.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'Admin123!' })
  @IsString()
  @MinLength(1)
  password!: string;

  @ApiProperty({ example: 'MacBook Pro', required: false })
  @IsOptional()
  @IsString()
  deviceName?: string;

  /**
   * 前端设备指纹（FNV-1a 哈希）
   * 用于识别同一浏览器的重复登录，实现会话 UPDATE 而非 INSERT，
   * 避免手动清除 token 后重新登录产生孤儿会话。
   */
  @ApiProperty({ example: 'a3f1c9b2', required: false })
  @IsOptional()
  @IsString()
  fingerprint?: string;
}
