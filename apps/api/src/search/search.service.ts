import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Prisma } from '../generated/prisma/client';

interface SearchRow {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  titleHighlight: string;
  rank: number;
  publishedAt: Date;
  author_id: string;
  author_username: string;
  author_displayName: string;
  author_avatar: string | null;
  author_bio: string | null;
  author_roles: string;
  author_createdAt: Date;
}

interface CountRow {
  total: bigint;
}

interface SuggestRow {
  title: string;
  slug: string;
}

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  // ─── Full-text search ──────────────────────────────
  async search(query: string, page: number, pageSize: number) {
    const offset = (page - 1) * pageSize;

    const [rows, countRows] = await Promise.all([
      this.prisma.$queryRaw<SearchRow[]>`
        SELECT
          a.id,
          a.title,
          a.slug,
          a.summary,
          ts_headline('simple', a.title, plainto_tsquery('simple', ${query})) AS "titleHighlight",
          ts_rank(a.search_vector, plainto_tsquery('simple', ${query})) AS rank,
          a.published_at AS "publishedAt",
          u.id AS "author_id",
          u.username AS "author_username",
          u.display_name AS "author_displayName",
          u.avatar AS "author_avatar",
          u.bio AS "author_bio",
          (SELECT STRING_AGG(r.name, ',') FROM user_roles ur JOIN roles r ON r.id = ur.role_id WHERE ur.user_id = u.id) AS "author_roles",
          u.created_at AS "author_createdAt"
        FROM articles a
        JOIN users u ON a.author_id = u.id
        WHERE a.search_vector @@ plainto_tsquery('simple', ${query})
          AND a.status = 'PUBLISHED'
          AND a.deleted_at IS NULL
        ORDER BY rank DESC
        LIMIT ${pageSize} OFFSET ${offset}
      `,
      this.prisma.$queryRaw<CountRow[]>`
        SELECT COUNT(*) AS total
        FROM articles a
        WHERE a.search_vector @@ plainto_tsquery('simple', ${query})
          AND a.status = 'PUBLISHED'
          AND a.deleted_at IS NULL
      `,
    ]);

    const total = Number(countRows[0]?.total ?? 0);
    const totalPages = Math.ceil(total / pageSize);

    const data = rows.map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      summary: row.summary,
      titleHighlight: row.titleHighlight,
      rank: row.rank,
      publishedAt: row.publishedAt,
      author: {
        id: row.author_id,
        username: row.author_username,
        displayName: row.author_displayName,
        avatar: row.author_avatar,
        bio: row.author_bio,
        roles: row.author_roles
          ? row.author_roles.split(',').map((name) => ({ role: { name } }))
          : [],
        createdAt: row.author_createdAt,
      },
    }));

    return {
      data,
      meta: { page, pageSize, total, totalPages },
    };
  }

  // ─── Suggest (quick title-only) ───────────────────
  async suggest(query: string) {
    const rows = await this.prisma.$queryRaw<SuggestRow[]>`
      SELECT title, slug
      FROM articles
      WHERE title ILIKE ${'%' + query + '%'}
        AND status = 'PUBLISHED'
        AND deleted_at IS NULL
      ORDER BY published_at DESC
      LIMIT 5
    `;

    return rows.map((row) => ({
      title: row.title,
      slug: row.slug,
    }));
  }
}
