// 加载.env环境变量，读取DATABASE_URL等数据库配置
import 'dotenv/config';
// Prisma 客户端生成文件，提供完整数据库CRUD类型化API
import { PrismaClient } from '../src/generated/prisma/client';
// PostgreSQL适配器，分离驱动与Prisma核心，适配pg原生驱动
import { PrismaPg } from '@prisma/adapter-pg';
// 密码哈希加密工具，用于生成用户加密密码
import * as bcrypt from 'bcrypt';
// 权限系统常量：全部权限标识、角色权限映射、权限描述、系统内置角色配置
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  SYSTEM_ROLES,
} from '../src/common/constants/permissions';

/**
 * 数据库连接字符串，从环境变量读取，非空断言确保启动时配置存在
 */
const connectionString = process.env.DATABASE_URL!;
/**
 * 初始化PostgreSQL适配器，传入数据库连接地址
 */
const adapter = new PrismaPg({ connectionString });
/**
 * 实例化Prisma客户端，绑定Postgres适配器，用于所有数据库操作
 */
const prisma = new PrismaClient({ adapter });

/**
 * 固定静态UUID
 * 用于评论、通知等演示数据，保证每次执行seed主键不变，实现幂等填充
 * 重复执行脚本不会因为主键冲突报错
 */
const COMMENT_1_ID = 'a1111111-1111-1111-1111-111111111111';
const COMMENT_2_ID = 'a2222222-2222-2222-2222-222222222222';
const NOTIF_1_ID = 'b1111111-1111-1111-1111-111111111111';
const NOTIF_2_ID = 'b2222222-2222-2222-2222-222222222222';

/**
 * 数据库初始化填充主函数
 * 幂等设计：全部使用upsert，重复执行不会产生重复数据、不会报错
 * 填充顺序：角色 → 权限 → 角色权限关联 → 测试用户 → 标签 → 文章 → 互动数据(点赞/收藏/评论/关注/通知)
 */
async function main() {
  console.log('🌱 Seeding database...');

  // ── 1. 初始化系统内置角色 ──────────────────────────────────────
  console.log('  Seeding roles...');
  // 遍历系统角色常量，幂等插入/更新角色
  for (const [, config] of Object.entries(SYSTEM_ROLES)) {
    await prisma.role.upsert({
      // 根据角色唯一名称匹配已有数据
      where: { name: config.name },
      // 存在则更新描述、系统角色标识
      update: { description: config.description, isSystem: config.isSystem },
      // 不存在则新建角色
      create: {
        name: config.name,
        description: config.description,
        isSystem: config.isSystem,
      },
    });
  }
  console.log(`  ✅ ${Object.keys(SYSTEM_ROLES).length} roles upserted`);

  // ── 2. 初始化权限集合 & 绑定角色权限关联 ─────────────────
  console.log('  Seeding permissions...');
  // 批量插入/更新全部权限定义
  for (const perm of ALL_PERMISSIONS) {
    // 权限格式 resource:action，拆分资源与操作
    const [resource, ...actionParts] = perm.split(':');
    const action = actionParts.join(':');
    await prisma.permission.upsert({
      // 联合唯一键 resource + action 匹配权限
      where: { resource_action: { resource, action } },
      // 更新权限描述文案
      update: { description: PERMISSION_DESCRIPTIONS[perm] ?? null },
      // 新建权限记录
      create: {
        resource,
        action,
        description: PERMISSION_DESCRIPTIONS[perm] ?? null,
      },
    });
  }
  console.log(`  ✅ ${ALL_PERMISSIONS.length} permissions upserted`);

  // 查询全部角色、全部权限，构建映射表方便快速匹配ID
  const allRoles = await prisma.role.findMany();
  const allPerms = await prisma.permission.findMany();
  // key: resource:action 权限标识，value: 权限ID
  const permMap = new Map(allPerms.map((p) => [`${p.resource}:${p.action}`, p.id]));

  // 给每个系统角色绑定对应权限（先清空旧关联，再批量创建）
  for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
    const role = allRoles.find((r) => r.name === roleName);
    // 不存在该角色则跳过
    if (!role) continue;

    // 根据权限标识数组转换为权限ID数组，过滤空值
    const permIds = perms.map((p) => permMap.get(p)).filter(Boolean) as string[];
    if (permIds.length > 0) {
      // 删除当前角色所有旧权限关联
      await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
      // 批量插入新权限关联
      await prisma.rolePermission.createMany({
        data: permIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
      });
    }
  }
  console.log('  ✅ Role-permission mappings seeded');

  // ── 3. 初始化测试用户：管理员、作者、读者 ────────────────────────────────────────
  // 角色名称→角色ID映射工具，快速分配用户角色
  const roleMap = new Map(allRoles.map((r) => [r.name, r.id]));

  // 1. 超级管理员账号 admin@devpulse.com
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
  // 给管理员绑定ADMIN角色（多对多关联幂等创建）
  await prisma.userRole.upsert({
    where: { userId_roleId: { userId: admin.id, roleId: roleMap.get('ADMIN')! } },
    update: {},
    create: { userId: admin.id, roleId: roleMap.get('ADMIN')! },
  });
  console.log('  ✅ Admin created:', admin.email);

  // 2. 作者账号 author@devpulse.com
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

  // 3. 第二位作者 dbexpert@devpulse.com
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

  // 4. 普通读者账号 reader@devpulse.com
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

  // ── 4. 初始化文章标签 Tag ─────────────────────────────────────────
  // 批量创建技术标签，包含名称、路由别名、描述、主题色
  const tags = await Promise.all([
    prisma.tag.upsert({ where: { name: 'React' }, update: {}, create: { name: 'React', slug: 'react', description: 'React frontend framework for building user interfaces', color: '#61DAFB' } }),
    prisma.tag.upsert({ where: { name: 'NestJS' }, update: {}, create: { name: 'NestJS', slug: 'nestjs', description: 'Progressive Node.js framework for building server-side applications', color: '#E0234E' } }),
    prisma.tag.upsert({ where: { name: 'TypeScript' }, update: {}, create: { name: 'TypeScript', slug: 'typescript', description: 'TypeScript — JavaScript with syntax for types', color: '#3178C6' } }),
    prisma.tag.upsert({ where: { name: 'PostgreSQL' }, update: {}, create: { name: 'PostgreSQL', slug: 'postgresql', description: 'The world\'s most advanced open source relational database', color: '#4169E1' } }),
    prisma.tag.upsert({ where: { name: 'Redis' }, update: {}, create: { name: 'Redis', slug: 'redis', description: 'In-memory data structure store, used as database and cache', color: '#DC382D' } }),
    prisma.tag.upsert({ where: { name: 'Docker' }, update: {}, create: { name: 'Docker', slug: 'docker', description: 'Container platform for building and deploying applications', color: '#2496ED' } }),
  ]);
  console.log('  ✅ Tags created:', tags.map((t) => t.name).join(', '));

  // ── 5. 初始化演示文章 Article ─────────────────────────────────────
  // 演示文章数组：标题、路由、HTML正文、摘要、作者ID、关联标签、浏览点赞统计
  const articles = [
    {
      title: '深入理解 React Hooks 闭包陷阱',
      slug: 'understanding-react-hooks-closure',
      content: '<h2>什么是闭包陷阱？</h2><p>在 React Hooks 中，闭包陷阱是最常见的 bug 来源之一。当我们在 useEffect 或 useCallback 中引用了 state 变量，但没有正确设置依赖数组时，就会遇到"过期闭包"问题。</p><h2>常见场景</h2><h3>1. useEffect 中的过期 state</h3><p>当 useEffect 的依赖数组为空时，回调函数中的 state 值会被"冻结"在组件初次渲染时的值。这意味着即使 state 已经更新，useEffect 中仍然只能访问到旧值。</p><h3>2. useCallback 中的旧值</h3><p>类似地，useCallback 缓存的函数中引用的 state 也可能是过期的。这在事件处理函数中特别常见。</p><h2>解决方案</h2><p>1. 正确设置依赖数组<br/>2. 使用 useRef 保存最新值<br/>3. 使用函数式更新 setState(prev => prev + 1)</p><p>通过理解闭包的工作原理，我们可以更好地避免这些陷阱，写出更可靠的 React 代码。</p>',
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

  // 循环创建每一篇文章，关联对应标签
  for (const articleData of articles) {
    // 拆分标签ID数组，剩余字段为文章基础信息
    const { tagIds, ...data } = articleData;
    const article = await prisma.article.upsert({
      // 根据唯一路由slug匹配文章
      where: { slug: data.slug },
      update: {},
      create: {
        ...data,
        // 文章默认发布状态
        status: 'PUBLISHED',
        // 随机发布时间：7天内随机时间戳
        publishedAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        // 估算阅读时长：纯文字每200字1分钟，最少1分钟
        readTimeMinutes: Math.max(1, Math.ceil(data.content.replace(/<[^>]*>/g, '').length / 200)),
        // 关联多标签
        tags: { connect: tagIds.map((id) => ({ id })) },
      },
    });
    console.log(`  ✅ Article created: ${article.title}`);
  }

  // 重新计算每个标签下已发布、未删除文章数量，同步更新tag.articleCount
  for (const tag of tags) {
    const count = await prisma.article.count({
      where: { tags: { some: { id: tag.id } }, status: 'PUBLISHED', deletedAt: null },
    });
    await prisma.tag.update({ where: { id: tag.id }, data: { articleCount: count } });
  }
  console.log('  ✅ Tag article counts updated');

  // ── 6. 用户互动演示数据：点赞、收藏、关注、评论、通知 ─────────────────────────────────
  // 读取第一篇文章作为互动载体
  const firstArticle = await prisma.article.findFirst({ where: { slug: 'understanding-react-hooks-closure' } });
  if (firstArticle) {
    // 读者点赞文章
    await prisma.like.upsert({
      where: { userId_articleId: { userId: reader.id, articleId: firstArticle.id } },
      update: {},
      create: { userId: reader.id, articleId: firstArticle.id },
    });

    // 读者收藏文章
    await prisma.bookmark.upsert({
      where: { userId_articleId: { userId: reader.id, articleId: firstArticle.id } },
      update: {},
      create: { userId: reader.id, articleId: firstArticle.id },
    });

    // 读者关注作者
    await prisma.follow.upsert({
      where: { followerId_followingId: { followerId: reader.id, followingId: author.id } },
      update: {},
      create: { followerId: reader.id, followingId: author.id },
    });

    // 读者一级评论，使用固定UUID保证幂等
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

    // 作者回复评论，二级评论，parentId关联上级评论
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

    // 通知1：收到评论通知
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

    // 通知2：新增粉丝关注通知
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
  // 输出所有测试账号登录信息，方便开发调试
  console.log('  admin@devpulse.com / Admin123!   (ADMIN)');
  console.log('  author@devpulse.com / Author123! (AUTHOR)');
  console.log('  dbexpert@devpulse.com / Author123! (AUTHOR)');
  console.log('  reader@devpulse.com / Reader123! (READER)');
}

/**
 * 执行填充脚本入口
 * 异常捕获：打印错误码并退出进程
 * finally：无论成功失败，断开Prisma数据库连接，释放连接池
 */
main()
  .catch((e) => {
    console.error('❌ Seed failed:', e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());