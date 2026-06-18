import {
  Injectable,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { PermissionService } from '../common/permission/permission.service';
import { NotificationService } from '../notification/notification.service';
import { CreateCommentDto } from './dto/create-comment.dto';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrCommentNotFound, ErrCommentNoPerm, ErrCommentParentWrong, ErrArticleNotPublished } from '../common/constants/error-codes';

const userPublicSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
} as const;

@Injectable()
export class CommentService {
  constructor(
    private prisma: PrismaService,
    private permissionService: PermissionService,
    private notificationService: NotificationService,
  ) {}

  // ─── Find Comments by Article ────────────────────────

  async findByArticle(
    articleId: string,
    page: number,
    pageSize: number,
    userId?: string,
  ) {
    const where = { articleId, parentId: null };

    const [topLevelComments, total] = await Promise.all([
      this.prisma.comment.findMany({
        where,
        select: {
          id: true,
          content: true,
          createdAt: true,
          updatedAt: true,
          author: { select: userPublicSelect },
          _count: { select: { replies: true, likes: true } },
          ...(userId
            ? {
                likes: {
                  where: { userId },
                  select: { id: true },
                },
              }
            : {}),
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.comment.count({ where }),
    ]);

    // Fetch up to 5 replies per top-level comment
    const parentIds = topLevelComments.map((c) => c.id);
    const replies = parentIds.length
      ? await this.prisma.comment.findMany({
          where: {
            parentId: { in: parentIds },
          },
          select: {
            id: true,
            content: true,
            parentId: true,
            createdAt: true,
            updatedAt: true,
            author: { select: userPublicSelect },
            _count: { select: { likes: true } },
            ...(userId
              ? {
                  likes: {
                    where: { userId },
                    select: { id: true },
                  },
                }
              : {}),
          },
          orderBy: { createdAt: 'asc' },
          take: parentIds.length * 5,
        })
      : [];

    // Group replies by parentId (limit 5 per parent)
    const repliesByParent = new Map<string, typeof replies>();
    for (const reply of replies) {
      if (!reply.parentId) continue;
      const group = repliesByParent.get(reply.parentId) ?? [];
      if (group.length < 5) {
        group.push(reply);
      }
      repliesByParent.set(reply.parentId, group);
    }

    // Assemble result
    const data = topLevelComments.map((comment) => {
      const { likes: userLikes, _count, ...rest } = comment as any;
      const parentReplies = repliesByParent.get(comment.id) ?? [];

      const formattedReplies = parentReplies.map((reply) => {
        const { likes: replyUserLikes, _count: replyCount, ...replyRest } =
          reply as any;
        return {
          ...replyRest,
          likeCount: replyCount.likes as number,
          ...(userId ? { isLiked: replyUserLikes.length > 0 } : {}),
        };
      });

      return {
        ...rest,
        replyCount: _count.replies as number,
        likeCount: _count.likes as number,
        ...(userId ? { isLiked: userLikes.length > 0 } : {}),
        replies: formattedReplies,
      };
    });

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

  // ─── Create Comment ──────────────────────────────────

  async create(articleId: string, dto: CreateCommentDto, userId: string) {
    // Verify article exists and is published
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
      select: { id: true, status: true, deletedAt: true },
    });

    if (!article || article.status !== 'PUBLISHED' || article.deletedAt) {
      throw new BusinessException(ErrArticleNotPublished, { httpStatus: HttpStatus.NOT_FOUND });
    }

    // If parentId provided, verify parent comment
    if (dto.parentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { id: true, articleId: true },
      });

      if (!parentComment) {
        throw new BusinessException(ErrCommentParentWrong, { httpStatus: HttpStatus.NOT_FOUND });
      }

      if (parentComment.articleId !== articleId) {
        throw new BusinessException(ErrCommentParentWrong, {
          httpStatus: HttpStatus.BAD_REQUEST,
          detail: 'Parent comment does not belong to this article',
        });
      }
    }

    // Create comment and increment count atomically
    const [comment] = await this.prisma.$transaction([
      this.prisma.comment.create({
        data: {
          content: dto.content,
          articleId,
          authorId: userId,
          parentId: dto.parentId ?? null,
        },
        select: {
          id: true,
          content: true,
          articleId: true,
          authorId: true,
          parentId: true,
          createdAt: true,
          updatedAt: true,
          author: { select: userPublicSelect },
        },
      }),
      this.prisma.$executeRaw(
        Prisma.sql`UPDATE articles SET comment_count = comment_count + 1 WHERE id = ${articleId}`,
      ),
    ]);

    // Dispatch notifications
    const [articleAuthor, actor] = await Promise.all([
      this.prisma.article.findUnique({
        where: { id: articleId },
        select: { authorId: true, title: true },
      }),
      this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      }),
    ]);

    // Notify article author (COMMENT_RECEIVED)
    if (articleAuthor) {
      this.notificationService.dispatch({
        type: 'COMMENT_RECEIVED',
        recipientId: articleAuthor.authorId,
        actorId: userId,
        articleId,
        commentId: comment.id,
        content: `${actor?.displayName ?? 'Someone'} 评论了你的文章「${articleAuthor.title}」`,
      });
    }

    // Notify parent comment author (COMMENT_REPLIED)
    if (dto.parentId) {
      const parentComment = await this.prisma.comment.findUnique({
        where: { id: dto.parentId },
        select: { authorId: true },
      });
      if (parentComment) {
        this.notificationService.dispatch({
          type: 'COMMENT_REPLIED',
          recipientId: parentComment.authorId,
          actorId: userId,
          articleId,
          commentId: comment.id,
          content: `${actor?.displayName ?? 'Someone'} 回复了你的评论`,
        });
      }
    }

    return comment;
  }

  // ─── Remove Comment ──────────────────────────────────

  async remove(commentId: string, userId: string) {
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        authorId: true,
        articleId: true,
        article: { select: { authorId: true } },
        _count: { select: { replies: true } },
      },
    });

    if (!comment) {
      throw new BusinessException(ErrCommentNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const isCommentAuthor = comment.authorId === userId;
    const isArticleAuthor = comment.article.authorId === userId;
    const isAdmin = await this.permissionService.userHasRole(userId, 'ADMIN');

    if (!isCommentAuthor && !isArticleAuthor && !isAdmin) {
      throw new BusinessException(ErrCommentNoPerm, {
        httpStatus: HttpStatus.FORBIDDEN,
        detail: 'You do not have permission to delete this comment',
      });
    }

    // Count direct replies before delete (cascade will remove them)
    const replyCount = comment._count.replies;
    const totalDeleted = replyCount + 1;

    // Delete comment (cascade deletes replies) and decrement count
    await this.prisma.$transaction([
      this.prisma.comment.delete({ where: { id: commentId } }),
      this.prisma.$executeRaw(
        Prisma.sql`
          UPDATE articles
          SET comment_count = GREATEST(0, comment_count - ${totalDeleted})
          WHERE id = ${comment.articleId}
        `,
      ),
    ]);

    return { success: true };
  }

  // ─── Toggle Like ─────────────────────────────────────

  async toggleLike(commentId: string, userId: string) {
    // Verify comment exists
    const comment = await this.prisma.comment.findUnique({
      where: { id: commentId },
      select: { id: true },
    });
    if (!comment) {
      throw new BusinessException(ErrCommentNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const existing = await this.prisma.commentLike.findUnique({
      where: { userId_commentId: { userId, commentId } },
    });

    if (existing) {
      await this.prisma.commentLike.delete({
        where: { userId_commentId: { userId, commentId } },
      });
    } else {
      await this.prisma.commentLike.create({
        data: { userId, commentId },
      });

      // Notify comment author
      const [commentAuthor, actor] = await Promise.all([
        this.prisma.comment.findUnique({
          where: { id: commentId },
          select: { authorId: true, articleId: true },
        }),
        this.prisma.user.findUnique({
          where: { id: userId },
          select: { displayName: true },
        }),
      ]);
      if (commentAuthor) {
        this.notificationService.dispatch({
          type: 'COMMENT_LIKED',
          recipientId: commentAuthor.authorId,
          actorId: userId,
          articleId: commentAuthor.articleId,
          commentId,
          content: `${actor?.displayName ?? 'Someone'} 赞了你的评论`,
        });
      }
    }

    const countResult = await this.prisma.$queryRaw<[{ count: bigint }]>(
      Prisma.sql`SELECT COUNT(*) as count FROM comment_likes WHERE comment_id = ${commentId}`,
    );

    return {
      liked: !existing,
      likeCount: Number(countResult[0].count),
    };
  }
}
