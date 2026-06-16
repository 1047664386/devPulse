import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from './require-permission.decorator';
import { PermissionService } from './permission.service';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private reflector: Reflector,
    private permissionService: PermissionService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    // No permission required — pass through
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException('Authentication required');
    }

    const userId: string = user.id ?? user.sub;

    // Load user's aggregated permissions (cached, 60s TTL)
    const { permissions, roleNames } = await this.permissionService.getUserPermissions(userId);

    // ADMIN superuser bypass — ADMIN role has all permissions
    if (roleNames.includes('ADMIN')) {
      return true;
    }

    for (const permission of requiredPermissions) {
      // Direct permission check
      if (permissions.has(permission)) {
        return true;
      }

      // Ownership-based fallback for :any → :own
      // e.g. if route requires 'article:update:any' but user only has
      // 'article:update:own', allow through — service layer does final
      // ownership check (e.g., comparing article.authorId with userId).
      if (permission.endsWith(':any')) {
        const ownPermission = permission.replace(':any', ':own');
        if (permissions.has(ownPermission)) {
          return true;
        }
      }
    }

    throw new ForbiddenException(
      `Missing required permission: ${requiredPermissions.join(', ')}`,
    );
  }
}
