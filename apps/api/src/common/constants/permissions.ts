/**
 * RBAC Permission & Role Constants
 *
 * Roles are now stored in the database (Role table), not as Prisma enums.
 * These constants define the system-level role names and their default permissions.
 */

// ─── System role names ──────────────────────────────────────
export const SYSTEM_ROLES = {
  ADMIN: {
    name: 'ADMIN',
    description: '系统管理员，拥有全部权限',
    isSystem: true,
  },
  AUTHOR: {
    name: 'AUTHOR',
    description: '内容创作者，可发布和管理自己的文章',
    isSystem: true,
  },
  READER: {
    name: 'READER',
    description: '读者，可评论和管理自己的内容',
    isSystem: true,
  },
} as const;

// ─── Permission constants ───────────────────────────────────
export const PERMISSIONS = {
  // Article permissions
  ARTICLE_CREATE: 'article:create',
  ARTICLE_UPDATE_OWN: 'article:update:own',
  ARTICLE_UPDATE_ANY: 'article:update:any',
  ARTICLE_DELETE_OWN: 'article:delete:own',
  ARTICLE_DELETE_ANY: 'article:delete:any',

  // Comment permissions
  COMMENT_CREATE: 'comment:create',
  COMMENT_DELETE_OWN: 'comment:delete:own',
  COMMENT_DELETE_ANY: 'comment:delete:any',

  // Tag permissions
  TAG_MANAGE: 'tag:manage',

  // User management permissions
  USER_MANAGE: 'user:manage',
  USER_BAN: 'user:ban',

  // Role & Permission management
  ROLE_MANAGE: 'role:manage',
  PERMISSION_MANAGE: 'permission:manage',

  // Admin dashboard access
  ADMIN_ACCESS: 'admin:access',
} as const;

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

/** All unique permission values */
export const ALL_PERMISSIONS = Object.values(PERMISSIONS);

/** Default role name → permission values mapping (for seeding) */
export const ROLE_PERMISSIONS: Record<string, string[]> = {
  READER: [
    PERMISSIONS.COMMENT_CREATE,
    PERMISSIONS.COMMENT_DELETE_OWN,
  ],
  AUTHOR: [
    PERMISSIONS.ARTICLE_CREATE,
    PERMISSIONS.ARTICLE_UPDATE_OWN,
    PERMISSIONS.ARTICLE_DELETE_OWN,
    PERMISSIONS.COMMENT_CREATE,
    PERMISSIONS.COMMENT_DELETE_OWN,
  ],
  ADMIN: ALL_PERMISSIONS,
};

/**
 * Permission descriptions (for seeding and admin UI display)
 */
export const PERMISSION_DESCRIPTIONS: Record<string, string> = {
  'article:create': '发布文章',
  'article:update:own': '编辑自己的文章',
  'article:update:any': '编辑任意文章',
  'article:delete:own': '删除自己的文章',
  'article:delete:any': '删除任意文章',
  'comment:create': '发表评论',
  'comment:delete:own': '删除自己的评论',
  'comment:delete:any': '删除任意评论',
  'tag:manage': '管理标签（创建/编辑/删除）',
  'user:manage': '管理用户（修改角色等）',
  'user:ban': '封禁/解封用户',
  'role:manage': '管理角色',
  'permission:manage': '管理权限分配',
  'admin:access': '访问管理后台',
};
