import {
  Injectable,
  HttpStatus,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../common/permission/permission.service';
import { BusinessException } from '../common/exceptions/business.exception';
import {
  ErrCannotModifySelf,
  ErrCannotBanSelf,
  ErrLastAdmin,
  ErrUserNotFound,
  ErrRoleNotFound,
  ErrArticleNotFound,
  ErrTagNotFound,
} from '../common/constants/error-codes';

interface DateCountRow {
  date: string;
  count: bigint;
}

interface ActiveUsersRow {
  count: bigint;
}

const rolesInclude = {
  select: {
    role: { select: { id: true, name: true, isSystem: true } },
  },
};

@Injectable()
export class AdminService {
  constructor(
    private prisma: PrismaService,
    private permissionService: PermissionService,
  ) {}

  // ─── Dashboard statistics ──────────────────────────
  async getDashboard() {
    const [
      totalUsers,
      totalArticles,
      todayNewUsers,
      todayNewArticles,
      topTags,
      articleGrowthRaw,
      activeUsers7dRaw,
    ] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.article.count({ where: { status: 'PUBLISHED', deletedAt: null } }),
      this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count FROM users WHERE created_at >= CURRENT_DATE`,
      ),
      this.prisma.$queryRawUnsafe<{ count: bigint }[]>(
        `SELECT COUNT(*) AS count FROM articles WHERE created_at >= CURRENT_DATE AND status = 'PUBLISHED'`,
      ),
      this.prisma.tag.findMany({ orderBy: { articleCount: 'desc' }, take: 5 }),
      this.prisma.$queryRawUnsafe<DateCountRow[]>(
        `SELECT DATE(published_at) AS date, COUNT(*) AS count
         FROM articles WHERE published_at >= NOW() - INTERVAL '30 days' AND status = 'PUBLISHED'
         GROUP BY DATE(published_at) ORDER BY date`,
      ),
      this.prisma.$queryRawUnsafe<ActiveUsersRow[]>(
        `SELECT COUNT(DISTINCT author_id) AS count FROM articles WHERE published_at >= NOW() - INTERVAL '7 days'`,
      ),
    ]);

    return {
      totalUsers,
      totalArticles,
      todayNewUsers: Number(todayNewUsers[0]?.count ?? 0),
      todayNewArticles: Number(todayNewArticles[0]?.count ?? 0),
      activeUsers7d: Number(activeUsers7dRaw[0]?.count ?? 0),
      topTags,
      articleGrowth: articleGrowthRaw.map((row) => ({
        date: row.date,
        count: Number(row.count),
      })),
    };
  }

  // ─── Get users ─────────────────────────────────────
  async getUsers(page: number, pageSize: number, search?: string) {
    const where = search
      ? {
          OR: [
            { email: { contains: search, mode: 'insensitive' as const } },
            { username: { contains: search, mode: 'insensitive' as const } },
            { displayName: { contains: search, mode: 'insensitive' as const } },
          ],
        }
      : {};

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        select: {
          id: true,
          email: true,
          username: true,
          displayName: true,
          avatar: true,
          bio: true,
          roles: rolesInclude,
          isBanned: true,
          bannedAt: true,
          banReason: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.user.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return { data, meta: { page, pageSize, total, totalPages } };
  }

  // ─── Update user roles (multi-role) ────────────────
  async updateUserRoles(userId: string, roleIds: string[], adminId: string) {
    if (userId === adminId) {
      throw new BusinessException(ErrCannotModifySelf, { httpStatus: HttpStatus.FORBIDDEN });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      throw new BusinessException(ErrUserNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    // Validate all roleIds exist
    const roles = await this.prisma.role.findMany({ where: { id: { in: roleIds } } });
    if (roles.length !== roleIds.length) {
      throw new BusinessException(ErrRoleNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const currentRoleNames = user.roles.map((ur) => ur.role.name);
    const newRoleNames = roles.map((r) => r.name);

    // Prevent demoting the last admin
    if (currentRoleNames.includes('ADMIN') && !newRoleNames.includes('ADMIN')) {
      const adminRole = await this.prisma.role.findUnique({ where: { name: 'ADMIN' } });
      if (adminRole) {
        const adminUserCount = await this.prisma.userRole.count({
          where: { roleId: adminRole.id },
        });
        if (adminUserCount <= 1) {
          throw new BusinessException(ErrLastAdmin, {
            httpStatus: HttpStatus.FORBIDDEN,
            detail: 'Cannot remove the last admin. Promote another user first.',
          });
        }
      }
    }

    // Replace user roles
    await this.prisma.$transaction(async (tx) => {
      await tx.userRole.deleteMany({ where: { userId } });
      if (roleIds.length > 0) {
        await tx.userRole.createMany({
          data: roleIds.map((roleId) => ({ userId, roleId })),
        });
      }
    });

    // Invalidate permission cache for this user
    await this.permissionService.invalidateCache(userId);

    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        roles: rolesInclude,
        isBanned: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ─── Ban / unban user ─────────────────────────────
  async banUser(userId: string, action: 'ban' | 'unban', reason?: string, adminId?: string) {
    if (userId === adminId) {
      throw new BusinessException(ErrCannotBanSelf, { httpStatus: HttpStatus.FORBIDDEN });
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BusinessException(ErrUserNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const data =
      action === 'ban'
        ? { isBanned: true, bannedAt: new Date(), banReason: reason ?? null }
        : { isBanned: false, bannedAt: null, banReason: null };

    return this.prisma.user.update({
      where: { id: userId },
      data,
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        roles: rolesInclude,
        isBanned: true,
        bannedAt: true,
        banReason: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  // ─── Get all roles ─────────────────────────────────
  async getAllRoles() {
    return this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { users: true } } },
    });
  }

  // ─── Get articles ──────────────────────────────────
  async getArticles(page: number, pageSize: number, search?: string, status?: string) {
    const where: any = {};
    if (search) where.title = { contains: search, mode: 'insensitive' };
    if (status) where.status = status;

    const [data, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              bio: true,
              roles: rolesInclude,
              createdAt: true,
            },
          },
          tags: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.article.count({ where }),
    ]);

    const totalPages = Math.ceil(total / pageSize);
    return { data, meta: { page, pageSize, total, totalPages } };
  }

  // ─── Delete article (hard delete) ─────────────────
  async deleteArticle(articleId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      include: { tags: { select: { id: true } } },
    });
    if (!article) throw new BusinessException(ErrArticleNotFound, { httpStatus: HttpStatus.NOT_FOUND });

    const tagIds = article.tags.map((t) => t.id);

    await this.prisma.$transaction(async (tx) => {
      // Disconnect tags first (for explicit control)
      if (tagIds.length > 0) {
        await tx.$executeRaw`DELETE FROM "_ArticleToTag" WHERE "A" = ${articleId}::uuid`;
        // Decrement articleCount for affected tags
        await tx.$executeRaw`
          UPDATE tags SET "articleCount" = GREATEST("articleCount" - 1, 0)
          WHERE id = ANY(${tagIds}::uuid[])
        `;
      }
      await tx.article.delete({ where: { id: articleId } });
    });

    return { success: true };
  }

  // ─── Tags ──────────────────────────────────────────
  async getTags() {
    return this.prisma.tag.findMany({ orderBy: { articleCount: 'desc' } });
  }

  async deleteTag(tagId: string) {
    const tag = await this.prisma.tag.findUnique({ where: { id: tagId } });
    if (!tag) throw new BusinessException(ErrTagNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    await this.prisma.$transaction(async (tx) => {
      await tx.$executeRaw`DELETE FROM "_ArticleToTag" WHERE "B" = ${tagId}::uuid`;
      await tx.tag.delete({ where: { id: tagId } });
    });
    return { success: true };
  }
}
