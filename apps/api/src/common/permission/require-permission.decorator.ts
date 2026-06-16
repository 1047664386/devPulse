import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'permissions';

/**
 * Mark a route as requiring specific permission(s).
 *
 * Usage:
 *   @RequirePermission('article:create')
 *   @RequirePermission('article:update:any')
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
