import {
  Injectable,
  Inject,
  HttpStatus,
} from '@nestjs/common';
import { Prisma } from '../generated/prisma/client';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';
import { CreateArticleDto } from './dto/create-article.dto';
import { UpdateArticleDto } from './dto/update-article.dto';
import { SaveDraftDto } from './dto/save-draft.dto';
import { ArticleListQueryDto } from './dto/article-list-query.dto';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrArticleNotFound, ErrArticleNoPerm, ErrArticleConflict } from '../common/constants/error-codes';

function generateSlug(title: string): string {
  const base = title
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '');
  const suffix = Math.random().toString(36).substring(2, 8);
  return `${base}-${suffix}`;
}

function calculateReadTime(html: string): number {
  const text = html.replace(/<[^>]*>/g, '');
  return Math.max(1, Math.ceil(text.length / 200));
}

const AUTHOR_PUBLIC_FIELDS = {
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
};

@Injectable()
export class ArticleService {
  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async findAll(query: ArticleListQueryDto, userId?: string) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;
    const sortBy = (query.sortBy ?? 'publishedAt') as
      | 'publishedAt'
      | 'viewCount'
      | 'likeCount';
    const sortOrder = (query.sortOrder ?? 'desc') as 'asc' | 'desc';
    const skip = (page - 1) * pageSize;

    const where: Prisma.ArticleWhereInput = {
      status: 'PUBLISHED',
      deletedAt: null,
    };

    if (query.tag) {
      where.tags = { some: { slug: query.tag } };
    }

    if (query.authorId) {
      where.authorId = query.authorId;
    }

    const [data, total] = await Promise.all([
      this.prisma.article.findMany({
        where,
        select: {
          id: true,
          title: true,
          slug: true,
          summary: true,
          coverImage: true,
          status: true,
          viewCount: true,
          likeCount: true,
          commentCount: true,
          readTimeMinutes: true,
          publishedAt: true,
          createdAt: true,
          author: { select: AUTHOR_PUBLIC_FIELDS },
          tags: true,
        },
        orderBy: { [sortBy]: sortOrder },
        skip,
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

  async findById(id: string, userId?: string) {
    const article = await this.prisma.article.findFirst({
      where: { id, deletedAt: null },
      include: {
        author: { select: AUTHOR_PUBLIC_FIELDS },
        tags: true,
      },
    });

    if (!article) {
      throw new BusinessException(ErrArticleNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    let isLiked = false;
    let isBookmarked = false;

    if (userId) {
      const [like, bookmark] = await Promise.all([
        this.prisma.like.findUnique({
          where: { userId_articleId: { userId, articleId: article.id } },
        }),
        this.prisma.bookmark.findUnique({
          where: { userId_articleId: { userId, articleId: article.id } },
        }),
      ]);
      isLiked = !!like;
      isBookmarked = !!bookmark;
    }

    return { ...article, isLiked, isBookmarked };
  }

  async findBySlug(slug: string, userId?: string) {
    const article = await this.prisma.article.findFirst({
      where: {
        slug,
        status: 'PUBLISHED',
        deletedAt: null,
      },
      include: {
        author: { select: AUTHOR_PUBLIC_FIELDS },
        tags: true,
      },
    });

    if (!article) {
      throw new BusinessException(ErrArticleNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    // Buffer view count in Redis (flushed to DB every 60s by ViewCountProcessor)
    await this.redis.incr(`view_buffer:${article.id}`);

    let isLiked = false;
    let isBookmarked = false;

    if (userId) {
      const [like, bookmark] = await Promise.all([
        this.prisma.like.findUnique({
          where: {
            userId_articleId: { userId, articleId: article.id },
          },
        }),
        this.prisma.bookmark.findUnique({
          where: {
            userId_articleId: { userId, articleId: article.id },
          },
        }),
      ]);
      isLiked = !!like;
      isBookmarked = !!bookmark;
    }

    return {
      ...article,
      viewCount: article.viewCount + 1,
      isLiked,
      isBookmarked,
    };
  }

  async create(dto: CreateArticleDto, userId: string) {
    const slug = generateSlug(dto.title);
    const readTimeMinutes = calculateReadTime(dto.content);
    const isPublished = dto.status === 'PUBLISHED';

    const article = await this.prisma.article.create({
      data: {
        title: dto.title,
        slug,
        content: dto.content,
        summary: dto.summary,
        coverImage: dto.coverImage,
        status: (dto.status as any) ?? 'DRAFT',
        readTimeMinutes,
        authorId: userId,
        publishedAt: isPublished ? new Date() : null,
        tags: dto.tagIds?.length
          ? { connect: dto.tagIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        author: { select: AUTHOR_PUBLIC_FIELDS },
        tags: true,
      },
    });

    // Increment articleCount on connected tags
    if (dto.tagIds?.length) {
      await this.prisma.$executeRaw`
        UPDATE tags
        SET article_count = article_count + 1
        WHERE id IN (${Prisma.join(dto.tagIds.map((id) => Prisma.sql`${id}::uuid`))})
      `;
    }

    // Auto-promote READER to AUTHOR on first article
    const author = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (author) {
      const roleNames = author.roles.map((ur) => ur.role.name);
      if (roleNames.includes('READER') && !roleNames.includes('AUTHOR')) {
        const authorRole = await this.prisma.role.findUnique({
          where: { name: 'AUTHOR' },
        });
        if (authorRole) {
          await this.prisma.userRole.create({
            data: { userId, roleId: authorRole.id },
          });
        }
      }
    }

    return article;
  }

  async update(id: string, dto: UpdateArticleDto, userId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: { tags: true },
    });

    if (!article || article.deletedAt) {
      throw new BusinessException(ErrArticleNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    // Check ownership or admin
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    const isAdmin =
      user?.roles?.some((ur) => ur.role.name === 'ADMIN') ?? false;

    if (article.authorId !== userId && !isAdmin) {
      throw new BusinessException(ErrArticleNoPerm, {
        httpStatus: HttpStatus.FORBIDDEN,
        detail: 'You do not have permission to update this article',
      });
    }

    const newTitle = dto.title ?? article.title;
    const newContent = dto.content ?? article.content;
    const newSummary = dto.summary !== undefined ? dto.summary : article.summary;
    const newCoverImage =
      dto.coverImage !== undefined ? dto.coverImage : article.coverImage;
    const newReadTime = dto.content
      ? calculateReadTime(dto.content)
      : article.readTimeMinutes;

    // Handle status transition: DRAFT → PUBLISHED sets publishedAt
    const newStatus = (dto.status ?? article.status) as string;
    const wasPublished = article.status === 'PUBLISHED';
    const willPublish = newStatus === 'PUBLISHED';
    const publishedAt = willPublish && !wasPublished ? new Date() : article.publishedAt;

    // Optimistic lock update
    const result = await this.prisma.$executeRawUnsafe(
      `UPDATE articles
       SET title = $1, content = $2, summary = $3, cover_image = $4,
           read_time_minutes = $5, version = version + 1, updated_at = NOW(),
           status = $8, published_at = $9
       WHERE id = $6::uuid AND version = $7 AND deleted_at IS NULL`,
      newTitle,
      newContent,
      newSummary,
      newCoverImage,
      newReadTime,
      id,
      dto.version,
      newStatus,
      publishedAt,
    );

    if (result === 0) {
      throw new BusinessException(ErrArticleConflict, {
        httpStatus: HttpStatus.CONFLICT,
        detail: 'Article was modified by another user',
      });
    }

    // Handle tag changes
    if (dto.tagIds !== undefined) {
      const oldTagIds = article.tags.map((t) => t.id);
      const newTagIds = dto.tagIds;

      const removedTagIds = oldTagIds.filter((id) => !newTagIds.includes(id));
      const addedTagIds = newTagIds.filter((id) => !oldTagIds.includes(id));

      // Disconnect old tags
      if (removedTagIds.length) {
        await this.prisma.article.update({
          where: { id },
          data: {
            tags: { disconnect: removedTagIds.map((tagId) => ({ id: tagId })) },
          },
        });
        await this.prisma.$executeRaw`
          UPDATE tags
          SET article_count = GREATEST(0, article_count - 1)
          WHERE id IN (${Prisma.join(removedTagIds.map((tid) => Prisma.sql`${tid}::uuid`))})
        `;
      }

      // Connect new tags
      if (addedTagIds.length) {
        await this.prisma.article.update({
          where: { id },
          data: {
            tags: { connect: addedTagIds.map((tagId) => ({ id: tagId })) },
          },
        });
        await this.prisma.$executeRaw`
          UPDATE tags
          SET article_count = article_count + 1
          WHERE id IN (${Prisma.join(addedTagIds.map((tid) => Prisma.sql`${tid}::uuid`))})
        `;
      }
    }

    return this.prisma.article.findUnique({
      where: { id },
      include: {
        author: { select: AUTHOR_PUBLIC_FIELDS },
        tags: true,
      },
    });
  }

  async remove(id: string, userId: string) {
    const article = await this.prisma.article.findUnique({ where: { id } });

    if (!article || article.deletedAt) {
      throw new BusinessException(ErrArticleNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    const isAdmin =
      user?.roles?.some((ur) => ur.role.name === 'ADMIN') ?? false;

    if (article.authorId !== userId && !isAdmin) {
      throw new BusinessException(ErrArticleNoPerm, {
        httpStatus: HttpStatus.FORBIDDEN,
        detail: 'You do not have permission to delete this article',
      });
    }

    return this.prisma.article.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
  }

  async toggleLike(articleId: string, userId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article || article.deletedAt) {
      throw new BusinessException(ErrArticleNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const existingLike = await this.prisma.like.findUnique({
      where: { userId_articleId: { userId, articleId } },
    });

    if (existingLike) {
      // Unlike
      await this.prisma.$transaction([
        this.prisma.like.delete({
          where: { userId_articleId: { userId, articleId } },
        }),
        this.prisma.$executeRaw`
          UPDATE articles
          SET like_count = GREATEST(0, like_count - 1)
          WHERE id = ${articleId}::uuid
        `,
      ]);

      const updated = await this.prisma.article.findUnique({
        where: { id: articleId },
        select: { likeCount: true },
      });

      return { liked: false, likeCount: updated!.likeCount };
    } else {
      // Like
      await this.prisma.$transaction([
        this.prisma.like.create({
          data: { userId, articleId },
        }),
        this.prisma.$executeRaw`
          UPDATE articles
          SET like_count = like_count + 1
          WHERE id = ${articleId}::uuid
        `,
      ]);

      const updated = await this.prisma.article.findUnique({
        where: { id: articleId },
        select: { likeCount: true },
      });

      // Notify article author
      const actor = await this.prisma.user.findUnique({
        where: { id: userId },
        select: { displayName: true },
      });
      this.notificationService.dispatch({
        type: 'ARTICLE_LIKED',
        recipientId: article.authorId,
        actorId: userId,
        articleId,
        content: `${actor?.displayName ?? 'Someone'} 赞了你的文章「${article.title}」`,
      });

      return { liked: true, likeCount: updated!.likeCount };
    }
  }

  async toggleBookmark(articleId: string, userId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id: articleId },
    });

    if (!article || article.deletedAt) {
      throw new BusinessException(ErrArticleNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const existingBookmark = await this.prisma.bookmark.findUnique({
      where: { userId_articleId: { userId, articleId } },
    });

    if (existingBookmark) {
      await this.prisma.bookmark.delete({
        where: { userId_articleId: { userId, articleId } },
      });
      return { bookmarked: false };
    } else {
      await this.prisma.bookmark.create({
        data: { userId, articleId },
      });
      return { bookmarked: true };
    }
  }

  // ─── Draft: Save (Create New) ────────────────────────

  async saveDraft(dto: SaveDraftDto, userId: string) {
    const title = dto.title?.trim() || '无标题草稿';
    const slug = generateSlug(title);
    const content = dto.content ?? '';

    const article = await this.prisma.article.create({
      data: {
        title,
        slug,
        content,
        summary: dto.summary,
        coverImage: dto.coverImage,
        status: 'DRAFT',
        readTimeMinutes: calculateReadTime(content),
        authorId: userId,
        publishedAt: null,
        tags: dto.tagIds?.length
          ? { connect: dto.tagIds.map((id) => ({ id })) }
          : undefined,
      },
      include: {
        author: { select: AUTHOR_PUBLIC_FIELDS },
        tags: true,
      },
    });

    // Increment articleCount on connected tags
    if (dto.tagIds?.length) {
      await this.prisma.$executeRaw`
        UPDATE tags
        SET article_count = article_count + 1
        WHERE id IN (${Prisma.join(dto.tagIds.map((id) => Prisma.sql`${id}::uuid`))})
      `;
    }

    return article;
  }

  // ─── Draft: Update Existing (No Validation) ─────────

  async updateDraft(id: string, dto: SaveDraftDto, userId: string) {
    const article = await this.prisma.article.findUnique({
      where: { id },
      include: { tags: true },
    });

    if (!article || article.deletedAt) {
      throw new BusinessException(ErrArticleNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    // Check ownership or admin
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    const isAdmin =
      user?.roles?.some((ur) => ur.role.name === 'ADMIN') ?? false;

    if (article.authorId !== userId && !isAdmin) {
      throw new BusinessException(ErrArticleNoPerm, {
        httpStatus: HttpStatus.FORBIDDEN,
        detail: 'You do not have permission to update this article',
      });
    }

    // Update without strict validation — draft can be partial
    const newTitle = dto.title !== undefined ? (dto.title.trim() || '无标题草稿') : article.title;
    const newContent = dto.content !== undefined ? dto.content : article.content;
    const newSummary = dto.summary !== undefined ? dto.summary : article.summary;
    const newCoverImage = dto.coverImage !== undefined ? dto.coverImage : article.coverImage;

    await this.prisma.article.update({
      where: { id },
      data: {
        title: newTitle,
        content: newContent,
        summary: newSummary,
        coverImage: newCoverImage,
        readTimeMinutes: calculateReadTime(newContent),
      },
    });

    // Handle tag changes
    if (dto.tagIds !== undefined) {
      const oldTagIds = article.tags.map((t) => t.id);
      const newTagIds = dto.tagIds;

      const removedTagIds = oldTagIds.filter((id) => !newTagIds.includes(id));
      const addedTagIds = newTagIds.filter((id) => !oldTagIds.includes(id));

      if (removedTagIds.length) {
        await this.prisma.article.update({
          where: { id },
          data: {
            tags: { disconnect: removedTagIds.map((tagId) => ({ id: tagId })) },
          },
        });
        await this.prisma.$executeRaw`
          UPDATE tags
          SET article_count = GREATEST(0, article_count - 1)
          WHERE id IN (${Prisma.join(removedTagIds.map((tid) => Prisma.sql`${tid}::uuid`))})
        `;
      }

      if (addedTagIds.length) {
        await this.prisma.article.update({
          where: { id },
          data: {
            tags: { connect: addedTagIds.map((tagId) => ({ id: tagId })) },
          },
        });
        await this.prisma.$executeRaw`
          UPDATE tags
          SET article_count = article_count + 1
          WHERE id IN (${Prisma.join(addedTagIds.map((tid) => Prisma.sql`${tid}::uuid`))})
        `;
      }
    }

    return this.prisma.article.findUnique({
      where: { id },
      include: {
        author: { select: AUTHOR_PUBLIC_FIELDS },
        tags: true,
      },
    });
  }

  // ─── Draft: List Current User's Drafts ──────────────

  async getMyDrafts(userId: string, page: number, pageSize: number) {
    const where = {
      authorId: userId,
      status: 'DRAFT' as const,
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
          status: true,
          viewCount: true,
          likeCount: true,
          commentCount: true,
          readTimeMinutes: true,
          publishedAt: true,
          createdAt: true,
          updatedAt: true,
          author: { select: AUTHOR_PUBLIC_FIELDS },
          tags: {
            select: {
              id: true,
              name: true,
              slug: true,
              color: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
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
}
