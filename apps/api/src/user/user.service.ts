import {
  Injectable,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrUserNotFound, ErrCannotFollowSelf } from '../common/constants/error-codes';

const userPublicSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  bio: true,
  roles: {
    select: {
      role: { select: { id: true, name: true, isSystem: true } },
    },
  },
  createdAt: true,
} as const;

@Injectable()
export class UserService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {}

  // ─── Get User Profile with Stats ─────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: userPublicSelect,
    });

    if (!user) {
      throw new BusinessException(ErrUserNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const stats = await this.prisma.$queryRaw<
      {
        articleCount: bigint;
        totalLikes: bigint;
        followerCount: bigint;
        followingCount: bigint;
      }[]
    >(
      Prisma.sql`
        SELECT
          (SELECT COUNT(*) FROM articles WHERE author_id = ${userId} AND status = 'PUBLISHED' AND deleted_at IS NULL) AS "articleCount",
          (SELECT COALESCE(SUM(like_count), 0) FROM articles WHERE author_id = ${userId} AND status = 'PUBLISHED' AND deleted_at IS NULL) AS "totalLikes",
          (SELECT COUNT(*) FROM follows WHERE following_id = ${userId}) AS "followerCount",
          (SELECT COUNT(*) FROM follows WHERE follower_id = ${userId}) AS "followingCount"
      `,
    );

    return {
      ...user,
      stats: {
        articleCount: Number(stats[0].articleCount),
        totalLikes: Number(stats[0].totalLikes),
        followerCount: Number(stats[0].followerCount),
        followingCount: Number(stats[0].followingCount),
      },
    };
  }

  // ─── Get User's Published Articles ───────────────────

  async getUserArticles(userId: string, page: number, pageSize: number) {
    // Verify user exists
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new BusinessException(ErrUserNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const where = {
      authorId: userId,
      status: 'PUBLISHED' as const,
      deletedAt: null,
    };

    const [data, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          coverImage: true,
          viewCount: true,
          likeCount: true,
          commentCount: true,
          readTimeMinutes: true,
          publishedAt: true,
          createdAt: true,
          author: { select: userPublicSelect },
          tags: {
            select: {
              id: true,
              name: true,
              slug: true,
              color: true,
            },
          },
        },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.article.count({ where }),
    ]);

    return {
      data,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ─── Get Followers ───────────────────────────────────

  async getFollowers(
    userId: string,
    page: number,
    pageSize: number,
    currentUserId?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new BusinessException(ErrUserNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const [data, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followingId: userId },
        select: {
          follower: { select: userPublicSelect },
          ...(currentUserId
            ? {
                follower: {
                  select: {
                    ...userPublicSelect,
                    followers: {
                      where: { followerId: currentUserId },
                      select: { id: true },
                    },
                  },
                },
              }
            : {}),
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.follow.count({ where: { followingId: userId } }),
    ]);

    const followers = data.map((f) => {
      const { followers: isFollowingCheck, ...userPublic } = f.follower as any;
      return {
        ...userPublic,
        ...(currentUserId ? { isFollowing: isFollowingCheck.length > 0 } : {}),
      };
    });

    return {
      data: followers,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ─── Get Following ───────────────────────────────────

  async getFollowing(
    userId: string,
    page: number,
    pageSize: number,
    currentUserId?: string,
  ) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true },
    });
    if (!user) {
      throw new BusinessException(ErrUserNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const [data, total] = await Promise.all([
      this.prisma.follow.findMany({
        where: { followerId: userId },
        select: {
          following: { select: userPublicSelect },
          ...(currentUserId
            ? {
                following: {
                  select: {
                    ...userPublicSelect,
                    followers: {
                      where: { followerId: currentUserId },
                      select: { id: true },
                    },
                  },
                },
              }
            : {}),
          createdAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.follow.count({ where: { followerId: userId } }),
    ]);

    const following = data.map((f) => {
      const { followers: isFollowingCheck, ...userPublic } = f.following as any;
      return {
        ...userPublic,
        ...(currentUserId ? { isFollowing: isFollowingCheck.length > 0 } : {}),
      };
    });

    return {
      data: following,
      meta: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    };
  }

  // ─── Toggle Follow ───────────────────────────────────

  async toggleFollow(targetUserId: string, currentUserId: string) {
    if (targetUserId === currentUserId) {
      throw new BusinessException(ErrCannotFollowSelf, { httpStatus: HttpStatus.BAD_REQUEST });
    }

    // Verify target user exists
    const targetUser = await this.prisma.user.findUnique({
      where: { id: targetUserId },
      select: { id: true },
    });
    if (!targetUser) {
      throw new BusinessException(ErrUserNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const existing = await this.prisma.follow.findUnique({
      where: {
        followerId_followingId: {
          followerId: currentUserId,
          followingId: targetUserId,
        },
      },
    });

    if (existing) {
      await this.prisma.follow.delete({
        where: { id: existing.id },
      });
      return { followed: false };
    }

    await this.prisma.follow.create({
      data: {
        followerId: currentUserId,
        followingId: targetUserId,
      },
    });

    // Notify target user
    const actor = await this.prisma.user.findUnique({
      where: { id: currentUserId },
      select: { displayName: true },
    });
    this.notificationService.dispatch({
      type: 'USER_FOLLOWED',
      recipientId: targetUserId,
      actorId: currentUserId,
      content: `${actor?.displayName ?? 'Someone'} 关注了你`,
    });

    return { followed: true };
  }
}
