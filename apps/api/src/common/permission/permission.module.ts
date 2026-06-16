import { Global, Module } from '@nestjs/common';
import { PermissionService } from './permission.service';
import { PermissionsGuard } from './permissions.guard';
import { PrismaModule } from '../../prisma/prisma.module';

@Global()
@Module({
  imports: [PrismaModule],
  providers: [PermissionService, PermissionsGuard],
  exports: [PermissionService, PermissionsGuard],
})
export class PermissionModule {}
