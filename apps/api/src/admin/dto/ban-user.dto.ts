import { IsString, IsIn, IsOptional } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class BanUserDto {
  @ApiProperty({ enum: ['ban', 'unban'] })
  @IsString()
  @IsIn(['ban', 'unban'])
  action: 'ban' | 'unban';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}
