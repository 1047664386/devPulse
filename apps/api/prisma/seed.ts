import 'dotenv/config';
import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import * as bcrypt from 'bcrypt';
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  SYSTEM_ROLES,
} from '../src/common/constants/permissions';

const connectionString = process.env.DATABASE_URL!;
const adapter = new PrismaPg({ connectionString });
const prisma = new PrismaClient({ adapter });

// Fixed UUIDs for idempotent seeding
const COMMENT_1_ID = 'a1111111-1111-1111-1111-111111111111';
const COMMENT_2_ID = 'a2222222-2222-2222-2222-222222222222';
const NOTIF_1_ID = 'b1111111-1111-1111-1111-111111111111';
const NOTIF_2_ID = 'b2222222-2222-2222-2222-222222222222';

async function main() {
  console.log('🌱 Seeding database...');

  // ── Roles ──────────────────────────────────────

  console.log('  Seeding roles...');
  for (const [, config] of Object.entries(SYSTEM_ROLES)) {
    await prisma.role.upsert({
      where: { name: config.name },
      update: { description: config.description, isSystem: config.isSystem },
      create: {
        name: config.name,
        description: config.description,
        isSystem: config.isSystem,
      },
    });
  }
  console.log(`  ✅ ${Object.keys(SYSTEM_ROLES).length} roles upserted`);

  // ── Permissions & Role Mappings ─────────────────

  console.log('  Seeding permissions...');
  for (const perm of ALL_PERMISSIONS) {
    const [resource, ...actionParts] = perm.split(':');
    const action = actionParts.join(':');
    await prisma.permission.upsert({
      where: { resource_action: { resource, action } },
      update: { description: PERMISSION_DESCRIPTIONS[perm] ?? null },
      create: {
        resource,
        action,
        description: PERMISSION_DESCRIPTIONS[perm] ?? null,
      },
    });
  }
  console.log(`  ✅ ${ALL_PERMISSIONS.length} permissions upserted`);

  const allRoles = await prisma.role.findMany();
  const allPerms = await prisma.permission.findMany();
  const permMap = new Map(allPerms.map((p: any) => [`${p.resource}:${p.action}`, p.id]));

  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = allRoles.find((r) => r.name === roleName);
    if (!role) continue;

    const permIds = perms.map((p) => permMap.get(p)).filter(Boolean) as string[];
    if (permIds.length > 0) {
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      await prisma.rolePermission.createMany({
        data: permIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
      });
    }
  }
  console.log('  ✅ Role-permission mappings seeded');

  // ── Users ────────────────────────────────────────

  // Helper: find role id by name
  const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

  const adminPassword = await bcrypt.hash('Admin123!', 12);
  const admin = await prisma.user.upsert({
    where: { email: 'admin@devpulse.com' },
    update: {},
    create: {
      email: 'admin@devpulse.com',
      username: 'admin',
      passwordHash: adminPassword,
      displayName: 'Admin',
      bio: 'Platform administrator',
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: roleMap.get('ADMIN')! } },
    update: {},
    create: { userId: admin.id, roleId: roleMap.get('ADMIN')! },
  });
  console.log('  ✅ Admin created:', admin.email);

  const authorPassword = await bcrypt.hash('Author123!', 12);
  const author = await prisma.user.upsert({
    where: { email: 'author@devpulse.com' },
    update: {},
    create: {
      email: 'author@devpulse.com',
      username: 'cooldev',
      passwordHash: authorPassword,
      displayName: 'Cool Developer',
      bio: 'Full-stack developer passionate about React and NestJS. Love open source.',
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: author.id, roleId: roleMap.get('AUTHOR')! } },
    update: {},
    create: { userId: author.id, roleId: roleMap.get('AUTHOR')! },
  });
  console.log('  ✅ Author created:', author.email);

  const author2Password = await bcrypt.hash('Author123!', 12);
  const author2 = await prisma.user.upsert({
    where: { email: 'dbexpert@devpulse.com' },
    update: {},
    create: {
      email: 'dbexpert@devpulse.com',
      username: 'dbexpert',
      passwordHash: author2Password,
      displayName: 'DB Expert',
      bio: 'Database engineer specializing in PostgreSQL and Redis.',
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: author2.id, roleId: roleMap.get('AUTHOR')! } },
    update: {},
    create: { userId: author2.id, roleId: roleMap.get('AUTHOR')! },
  });
  console.log('  ✅ Author2 created:', author2.email);

  const readerPassword = await bcrypt.hash('Reader123!', 12);
  const reader = await prisma.user.upsert({
    where: { email: 'reader@devpulse.com' },
    update: {},
    create: {
      email: 'reader@devpulse.com',
      username: 'reader001',
      passwordHash: readerPassword,
      displayName: 'Reader One',
    },
  });
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: reader.id, roleId: roleMap.get('READER')! } },
    update: {},
    create: { userId: reader.id, roleId: roleMap.get('READER')! },
  });
  console.log('  ✅ Reader created:', reader.email);

  // ── Tags ─────────────────────────────────────────

  const tags = await Promise.all([
    prisma.tag.upsert({ where: { name: 'React' }, update: {}, create: { name: 'React', slug: 'react', description: 'React frontend framework for building user interfaces', color: '#61DAFB' } }),
    prisma.tag.upsert({ where: { name: 'NestJS' }, update: {}, create: { name: 'NestJS', slug: 'nestjs', description: 'Progressive Node.js framework for building server-side applications', color: '#E0234E' } }),
    prisma.tag.upsert({ where: { name: 'TypeScript' }, update: {}, create: { name: 'TypeScript', slug: 'typescript', description: 'TypeScript — JavaScript with syntax for types', color: '#3178C6' } }),
    prisma.tag.upsert({ where: { name: 'PostgreSQL' }, update: {}, create: { name: 'PostgreSQL', slug: 'postgresql', description: 'The world\'s most advanced open source relational database', color: '#4169E1' } }),
    prisma.tag.upsert({ where: { name: 'Redis' }, update: {}, create: { name: 'Redis', slug: 'redis', description: 'In-memory data structure store, used as database and cache', color: '#DC382D' } }),
    prisma.tag.upsert({ where: { name: 'Docker' }, update: {}, create: { name: 'Docker', slug: 'docker', description: 'Container platform for building and deploying applications', color: '#2496ED' } }),
  ]);
  console.log('  ✅ Tags created:', tags.map((t: { name: string }) => t.name).join(', '));

  // ── Articles ─────────────────────────────────────

  const articles = [
    {
      title: '深入理解 React Hooks 闭包陷阱',
      slug: 'understanding-react-hooks-closure',
      content: '<h2>什么是闭包陷阱？</h2><p>在 React Hooks 中，闭包陷阱是最常见的 bug 来源之一。当我们在 useEffect 或 useCallback 中引用了 state 变量，但没有正确设置依赖数组时，就会遇到"过期闭包"问题。</p><h2>常见场景</h2><h3>1. useEffect 中的过期 state</h3><p>当 useEffect 的依赖数组为空时，回调函数中的 state 值会被"冻结"在组件初次渲染时的值。这意味着即使 state 已经更新，useEffect 中仍然只能访问到旧值。</p><h3>2. useCallback 中的旧值</h3><p>类似地，useCallback 缓存的函数中引用的 state 也可能是过期的。这在事件处理函数中特别常见。</p><h2>解决方案</h2><p>1. 正确设置依赖数组<br/>2. 使用 useRef 保存最新值<br/>3. 使用函数式更新 setState(prev =&gt; prev + 1)</p><p>通过理解闭包的工作原理，我们可以更好地避免这些陷阱，写出更可靠的 React 代码。</p>',
      summary: '本文深入分析了 React Hooks 中常见的闭包陷阱及其解决方案。',
      authorId: author.id,
      tagIds: [tags[0].id, tags[2].id],
      viewCount: 1234,
      likeCount: 89,
    },
    {
      title: 'NestJS + Prisma 全栈最佳实践',
      slug: 'nestjs-prisma-fullstack-best-practices',
      content: '<h2>项目架构设计</h2><p>NestJS 提供了优秀的模块化架构，结合 Prisma ORM 的类型安全查询，可以构建出高质量的全栈应用。本文将分享在生产项目中的最佳实践。</p><h2>模块划分</h2><p>按业务领域划分模块，每个模块包含 Controller、Service、DTO 三个核心文件。全局共享的服务通过 @Global() 装饰器注册。</p><h2>数据库操作</h2><p>Prisma 的 select 功能可以避免 N+1 查询问题，同时只返回需要的字段。使用 $transaction 确保数据一致性。</p><p>通过合理的架构设计和工具选择，我们可以大幅提升开发效率和代码质量。</p>',
      summary: '分享 NestJS + Prisma 在全栈项目中的架构设计和编码最佳实践。',
      authorId: author.id,
      tagIds: [tags[1].id, tags[2].id],
      viewCount: 856,
      likeCount: 67,
    },
    {
      title: 'PostgreSQL 并发控制：从理论到实践',
      slug: 'postgresql-concurrency-control',
      content: '<h2>为什么需要并发控制？</h2><p>在多用户环境中，多个事务可能同时访问和修改同一份数据。如果没有适当的控制机制，就会产生数据不一致的问题。</p><h2>悲观锁 SELECT FOR UPDATE</h2><p>悲观锁在读取数据时就加锁，其他事务必须等待锁释放。适用于高并发写入的场景。</p><h2>乐观锁 version 字段</h2><p>乐观锁不阻塞读取，而是在更新时检查版本号。如果版本不匹配，说明数据已被其他事务修改。适用于低频冲突的场景。</p><h2>实战建议</h2><p>根据业务特点选择合适的锁策略。对于库存扣减等高频操作使用悲观锁，对于文章编辑等低频冲突使用乐观锁。</p>',
      summary: '深入讲解 PostgreSQL 中的悲观锁、乐观锁等并发控制方案及实际应用。',
      authorId: author2.id,
      tagIds: [tags[3].id],
      viewCount: 543,
      likeCount: 45,
    },
    {
      title: 'Redis 缓存策略：让数据库压力降低 90%',
      slug: 'redis-caching-strategies',
      content: '<h2>缓存的基本原理</h2><p>Redis 作为内存数据库，读写速度极快。将热点数据缓存到 Redis 中，可以大幅减少对 PostgreSQL 的查询压力。</p><h2>缓存穿透与雪崩</h2><p>缓存穿透：查询不存在的数据，导致请求直接打到数据库。解决方案：缓存空值或使用布隆过滤器。</p><p>缓存雪崩：大量缓存同时过期，导致数据库瞬间压力剧增。解决方案：设置随机过期时间。</p><h2>实践案例</h2><p>在我们的社区平台中，文章浏览量使用 Redis 缓冲写入，每 60 秒批量刷写到数据库，将写入频率降低了数百倍。</p>',
      summary: 'Redis 缓存策略详解：缓存穿透、雪崩、击穿的解决方案。',
      authorId: author2.id,
      tagIds: [tags[4].id, tags[3].id],
      viewCount: 789,
      likeCount: 52,
    },
  ];

  for (const articleData of articles) {
    const { tagIds, ...data } = articleData;
    const article = await prisma.article.upsert({
      where: { slug: data.slug },
      update: {},
      create: {
        ...data,
        status: 'PUBLISHED',
        publishedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        readTimeMinutes: Math.max(1, Math.ceil(data.content.replace(/<[^>]*>/g, '').length / 200)),
        tags: { connect: tagIds.map((id) => ({ id })) },
      },
    });
    console.log(`  ✅ Article created: ${article.title}`);
  }

  // Update tag article counts
  for (const tag of tags) {
    const count = await prisma.article.count({
      where: { tags: { some: { id: tag.id } }, status: 'PUBLISHED', deletedAt: null },
    });
    await prisma.tag.update({ where: { id: tag.id }, data: { articleCount: count } });
  }
  console.log('  ✅ Tag article counts updated');

  // ── Interactions ─────────────────────────────────

  // Reader likes an article
  const firstArticle = await prisma.article.findFirst({ where: { slug: 'understanding-react-hooks-closure' } });
  if (firstArticle) {
    await prisma.like.upsert({
      where: { userId_articleId: { userId: reader.id, articleId: firstArticle.id } },
      update: {},
      create: { userId: reader.id, articleId: firstArticle.id },
    });

    // Reader bookmarks an article
    await prisma.bookmark.upsert({
      where: { userId_articleId: { userId: reader.id, articleId: firstArticle.id } },
      update: {},
      create: { userId: reader.id, articleId: firstArticle.id },
    });

    // Reader follows author
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: reader.id, followingId: author.id } },
      update: {},
      create: { followerId: reader.id, followingId: author.id },
    });

    // Reader comments on article
    const comment = await prisma.comment.upsert({
      where: { id: COMMENT_1_ID },
      update: {},
      create: {
        id: COMMENT_1_ID,
        content: '写得太好了，学到了很多！感谢分享。',
        articleId: firstArticle.id,
        authorId: reader.id,
      },
    });

    // Author replies to comment
    await prisma.comment.upsert({
      where: { id: COMMENT_2_ID },
      update: {},
      create: {
        id: COMMENT_2_ID,
        content: '谢谢支持！后续还会更新更多内容。',
        articleId: firstArticle.id,
        authorId: author.id,
        parentId: comment.id,
      },
    });

    // Notifications
    await prisma.notification.upsert({
      where: { id: NOTIF_1_ID },
      update: {},
      create: {
        id: NOTIF_1_ID,
        type: 'COMMENT_RECEIVED',
        recipientId: author.id,
        actorId: reader.id,
        articleId: firstArticle.id,
        content: `${reader.displayName} 评论了你的文章《${firstArticle.title}》`,
      },
    });

    await prisma.notification.upsert({
      where: { id: NOTIF_2_ID },
      update: {},
      create: {
        id: NOTIF_2_ID,
        type: 'USER_FOLLOWED',
        recipientId: author.id,
        actorId: reader.id,
        content: `${reader.displayName} 开始关注你`,
      },
    });

    console.log('  ✅ Interactions created (likes, bookmarks, follows, comments, notifications)');
  }

  console.log('\n✅ Seeding complete!');
  console.log('  admin@devpulse.com / Admin123!   (ADMIN)');
  console.log('  author@devpulse.com / Author123! (AUTHOR)');
  console.log('  dbexpert@devpulse.com / Author123! (AUTHOR)');
  console.log('  reader@devpulse.com / Reader123! (READER)');
}

main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
