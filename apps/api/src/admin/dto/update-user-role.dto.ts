import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserRoleDto {
  @ApiProperty({
    type: [String],
    description: 'Array of role UUIDs to assign to the user',
  })
  @IsArray()
  @IsUUID('all', { each: true })
  roleIds: string[];
}
