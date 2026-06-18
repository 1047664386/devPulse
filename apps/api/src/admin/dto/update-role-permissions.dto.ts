import { IsArray, IsUUID } from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateRolePermissionsDto {
  @ApiProperty({ type: [String], description: 'Array of permission IDs' })
  @IsArray()
  @IsUUID('4', { each: true })
  permissionIds: string[];
}
