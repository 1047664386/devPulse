import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  SYSTEM_ROLES,
} from '../constants/permissions';

/** Cache entry: aggregated permissions for a single user */
interface CachedUserPermissions {
  permissions: Set<string>;
  roleNames: string[];
  cachedAt: number;
}

@Injectable()
export class PermissionService {
  private readonly logger = new Logger(PermissionService.name);
  private cache = new Map<string, CachedUserPermissions>();
  private readonly CACHE_TTL = 60_000; // 1 minute

  constructor(private prisma: PrismaService) {}

  // ─── User-level permission checks ───────────────────────

  /**
   * Get all permissions for a user (aggregated across all their roles).
   * Uses an in-memory cache keyed by userId (60s TTL).
   */
  async getUserPermissions(userId: string): Promise<{
    permissions: Set<string>;
    roleNames: string[];
  }> {
    const cached = this.cache.get(userId);
    if (cached && Date.now() - cached.cachedAt < this.CACHE_TTL) {
      return { permissions: cached.permissions, roleNames: cached.roleNames };
    }
    return this.loadUserPermissions(userId);
  }

  /**
   * Check whether a user has a specific permission (across all their roles).
   */
  async userHasPermission(userId: string, permission: string): Promise<boolean> {
    const { permissions } = await this.getUserPermissions(userId);
    return permissions.has(permission);
  }

  /**
   * Check whether a user has a specific role.
   */
  async userHasRole(userId: string, roleName: string): Promise<boolean> {
    const { roleNames } = await this.getUserPermissions(userId);
    return roleNames.includes(roleName);
  }

  /**
   * Clear cache for a specific user (or all users if none specified).
   */
  invalidateCache(userId?: string): void {
    if (userId) {
      this.cache.delete(userId);
    } else {
      this.cache.clear();
    }
  }

  // ─── Role CRUD (for admin panel) ────────────────────────

  /**
   * Get all roles with their permission assignments and metadata.
   */
  async getAllRolesWithPermissions() {
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: {
        permissions: {
          include: { permission: true },
        },
      },
    });

    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem,
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        resource: rp.permission.resource,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
    }));
  }

  /**
   * Set permissions for a role (replaces existing assignments).
   */
  async setRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });

    if (permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: permissionIds.map((pid) => ({ roleId, permissionId: pid })),
      });
    }

    // Invalidate all user caches (any user with this role is affected)
    this.invalidateCache();
  }

  /**
   * Create a new custom role.
   */
  async createRole(name: string, description?: string) {
    return this.prisma.role.create({
      data: {
        name: name.toUpperCase(),
        description: description ?? null,
        isSystem: false,
      },
    });
  }

  /**
   * Delete a custom (non-system) role.
   */
  async deleteRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) throw new NotFoundException('Role not found');
    if (role.isSystem) throw new ForbiddenException('Cannot delete system roles');

    await this.prisma.role.delete({ where: { id: roleId } });
    this.invalidateCache();
  }

  // ─── Permission queries ─────────────────────────────────

  /**
   * Get all defined permissions in the system.
   */
  async getAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  // ─── Seeding ────────────────────────────────────────────

  /**
   * Seed roles, permissions, and role-permission mappings.
   * Idempotent — safe to call multiple times.
   */
  async seedRolesAndPermissions(): Promise<void> {
    // 1. Upsert system roles
    for (const [, config] of Object.entries(SYSTEM_ROLES)) {
      await this.prisma.role.upsert({
        where: { name: config.name },
        update: { description: config.description, isSystem: config.isSystem },
        create: {
          name: config.name,
          description: config.description,
          isSystem: config.isSystem,
        },
      });
    }
    this.logger.log(`Upserted ${Object.keys(SYSTEM_ROLES).length} system roles`);

    // 2. Upsert all permission records
    for (const perm of ALL_PERMISSIONS) {
      const [resource, ...actionParts] = perm.split(':');
      const action = actionParts.join(':');
      await this.prisma.permission.upsert({
        where: { resource_action: { resource, action } },
        update: { description: PERMISSION_DESCRIPTIONS[perm] ?? null },
        create: {
          resource,
          action,
          description: PERMISSION_DESCRIPTIONS[perm] ?? null,
        },
      });
    }
    this.logger.log(`Upserted ${ALL_PERMISSIONS.length} permissions`);

    // 3. Seed default role → permission mappings
    const allRoles = await this.prisma.role.findMany();
    const allPerms = await this.prisma.permission.findMany();
    const permMap = new Map(allPerms.map((p) => [`${p.resource}:${p.action}`, p.id]));

    for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
      const role = allRoles.find((r) => r.name === roleName);
      if (!role) continue;

      const permIds = perms.map((p) => permMap.get(p)).filter(Boolean) as string[];
      if (permIds.length > 0) {
        await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
        await this.prisma.rolePermission.createMany({
          data: permIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
        });
      }
    }
    this.logger.log('Default role-permission mappings seeded');

    this.invalidateCache();
  }

  // ─── Private ────────────────────────────────────────────

  /**
   * Load a user's aggregated permissions from DB and cache them.
   * Single query with nested includes for efficiency.
   */
  private async loadUserPermissions(userId: string): Promise<{
    permissions: Set<string>;
    roleNames: string[];
  }> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        roles: {
          include: {
            role: {
              include: {
                permissions: {
                  include: { permission: true },
                },
              },
            },
          },
        },
      },
    });

    const permissions = new Set<string>();
    const roleNames: string[] = [];

    if (user) {
      for (const userRole of user.roles) {
        roleNames.push(userRole.role.name);
        for (const rp of userRole.role.permissions) {
          permissions.add(`${rp.permission.resource}:${rp.permission.action}`);
        }
      }
    }

    const entry: CachedUserPermissions = {
      permissions,
      roleNames,
      cachedAt: Date.now(),
    };
    this.cache.set(userId, entry);

    return { permissions, roleNames };
  }
}
