## DevPulse 后端 API 接口文档

> 本文档供后端开发参考实现。前端所有页面已就绪（使用 Mock 数据），对接时只需按以下规范实现各接口即可。
> 前端 API 客户端位于 `apps/web/src/lib/api.ts`，baseURL 为 `/api/v1`，Vite dev server 已配置代理到 `localhost:3000`。

---

### 通用约定

**Base URL**: `/api/v1`

**认证方式**: Bearer Token（请求头 `Authorization: Bearer <accessToken>`）

**AccessToken (JWT) Payload 结构**:
```jsonc
{
  "sub": "uuid",            // 用户 ID
  "email": "user@example.com",
  "tokenVersion": 3,        // 令牌版本号，与数据库 users.token_version 字段对应
  "iat": 1735689600,        // 签发时间
  "exp": 1735690500         // 过期时间（15分钟后）
}
```

> **tokenVersion 全局失效机制**: `tokenVersion` 是用户维度的整数计数器（存储在 `users.token_version` 字段，默认值为 0）。每次需要使所有已签发 token 立即失效时（如：全部登出、修改密码），将该字段递增 +1。JwtStrategy 在每次请求验证时，会从数据库读取用户当前的 `tokenVersion` 并与 token payload 中的值比对——不一致则拒绝认证（返回 401），即使 token 本身尚未过期。这样无需逐个撤销 JWT，即可实现"一键作废全部令牌"的效果。

**统一响应格式**:
```jsonc
// 成功
{ "data": <T>, "meta": { "page": 1, "pageSize": 20, "total": 100, "totalPages": 5 } }

// 失败
{ "error": { "code": "INVALID_INPUT", "message": "邮箱格式不正确", "details": [{ "field": "email", "message": "..." }] } }
```

**分页参数**: 所有列表接口支持 `?page=1&pageSize=20`，默认 page=1, pageSize=20。

**错误码对照**:

| code | HTTP Status | 说明 |
|---|---|---|
| INVALID_INPUT | 400 | 参数校验失败（class-validator 抛出） |
| UNAUTHORIZED | 401 | 未登录或 token 过期 |
| FORBIDDEN | 403 | 权限不足（如非 ADMIN 访问管理接口） |
| NOT_FOUND | 404 | 资源不存在 |
| CONFLICT | 409 | 唯一约束冲突（如邮箱/用户名已存在） |
| OPTIMISTIC_LOCK | 409 | 乐观锁版本冲突（文章更新时 version 不匹配） |
| RATE_LIMIT | 429 | 请求过于频繁（ThrottlerModule） |
| INTERNAL_ERROR | 500 | 服务器内部错误 |

**角色权限**: `READER` < `AUTHOR` < `ADMIN`。写文章需要 AUTHOR 及以上，管理接口需要 ADMIN。

---

### 1. 认证模块 — AuthController (`/auth`)

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| POST | `/auth/register` | 否 | 注册 |
| POST | `/auth/login` | 否 | 登录（支持多设备） |
| POST | `/auth/refresh` | 否 | 刷新 token |
| POST | `/auth/logout` | 是 | 登出（默认单设备，传 refreshToken） |
| POST | `/auth/logout-all` | 是 | 强制所有设备下线 |
| GET  | `/auth/me` | 是 | 获取当前用户信息 |
| GET  | `/auth/sessions` | 是 | 获取所有活跃设备会话 |
| DELETE | `/auth/sessions/:deviceId` | 是 | 注销指定设备会话 |

**POST /auth/register**

请求体:
```json
{ "email": "user@example.com", "username": "cooldev", "password": "P@ssw0rd!", "displayName": "Cool Dev" }
```
校验规则: email 合法且唯一，username 3-20字符且唯一，password 8+位含大小写和数字，displayName 2-30字符。

响应 `data`: `AuthResponse`
```json
{ "user": { /* User */ }, "accessToken": "eyJ...", "refreshToken": "eyJ..." }
```
实现要点: 密码用 bcrypt hash（saltRounds=12），accessToken 有效期 15min，refreshToken 有效期 7d。每次登录生成唯一 `deviceId`，refreshToken 哈希 + 设备元数据存入 Redis HASH `rt:{userId}:{deviceId}`，并加入设备索引集合 `rt:{userId}:_devices`。

**POST /auth/login**

请求体:
```json
{ "email": "user@example.com", "password": "P@ssw0rd!", "deviceName": "Chrome on macOS" }
```
`deviceName` 可选，不传则从 User-Agent 自动解析平台。

响应: 同上 `AuthResponse`。

实现要点: 先按 email 查找用户，bcrypt.compare 验证密码。检查 `isBanned` 状态，若封禁返回 403。登录前检查设备数量上限（最多 10 个），超限自动淘汰最早登录的设备。

> **tokenVersion 说明**: 签发的 AccessToken（JWT）payload 中包含 `tokenVersion` 字段（从用户数据库记录中读取）。该字段用于实现全局令牌失效机制——当 `tokenVersion` 被递增时，所有已签发的 AccessToken 将立即失效（详见下方认证方式说明）。

**POST /auth/refresh**

请求体:
```json
{ "refreshToken": "eyJ..." }
```
响应 `data`:
```json
{ "accessToken": "eyJ...新", "refreshToken": "eyJ...新" }
```
实现要点: 解析 refreshToken 获取 `userId` 和 `deviceId`，从 Redis `rt:{userId}:{deviceId}` 取出存储的 hash 比对。验证通过后签发新 token 对（新 `deviceId`），写入新设备会话，删除旧设备会话（Token Rotation）。Token 重用检测：hash 不匹配时仅撤销该设备，不影响其他设备。

> **tokenVersion 说明**: 新签发的 AccessToken payload 中同样包含当前用户的 `tokenVersion`。如果在 refresh 时发现数据库中用户的 `tokenVersion` 与旧 token 中的值不一致，说明用户已在其他设备执行了全局登出或修改了密码，此时应拒绝刷新并返回 401。

**POST /auth/logout**

Header: `Authorization: Bearer <accessToken>`

请求体（可选）:
```json
{ "refreshToken": "eyJ..." }
```
- 传 `refreshToken` → 服务端解码出 `deviceId`，仅注销该设备会话
- 不传或解码失败 → 保守策略：注销所有设备

响应: `{ "success": true, "scope": "device" | "all" }`

**POST /auth/logout-all**

Header: `Authorization: Bearer <accessToken>`

强制撤销当前用户所有设备会话。修改密码后会自动触发。同时递增用户的 `tokenVersion`，使所有已签发的 AccessToken 立即失效（即使 token 尚未过期，JwtStrategy 验证时也会因 `tokenVersion` 不匹配而拒绝）。

响应: `{ "success": true }`

**GET /auth/me**

Header: `Authorization: Bearer <accessToken>`

响应 `data`: `User` 对象（不含 passwordHash）。

**GET /auth/sessions**

Header: `Authorization: Bearer <accessToken>`

响应 `data`: 活跃设备会话列表（按 `lastActiveAt` 降序）
```json
[
  {
    "deviceId": "uuid-1",
    "deviceName": "Chrome on macOS",
    "platform": "macOS",
    "ip": "192.168.1.100",
    "loginAt": "2026-01-01T00:00:00.000Z",
    "lastActiveAt": "2026-01-01T10:00:00.000Z"
  }
]
```

**DELETE /auth/sessions/:deviceId**

Header: `Authorization: Bearer <accessToken>`

响应: `{ "success": true }`。若 `deviceId` 不存在返回 404 `ErrSessionNotFound`。

---

### 2. 文章模块 — ArticleController (`/articles`)

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET    | `/articles` | 否 | 文章列表（分页+筛选+排序） |
| GET    | `/articles/:slug` | 否 | 文章详情 |
| POST   | `/articles` | AUTHOR+ | 创建文章 |
| PUT    | `/articles/:id` | AUTHOR+ | 更新文章（乐观锁） |
| DELETE | `/articles/:id` | AUTHOR+ | 删除文章（软删除） |
| POST   | `/articles/:id/like` | 是 | 点赞/取消点赞（Toggle） |
| POST   | `/articles/:id/bookmark` | 是 | 收藏/取消收藏（Toggle） |

**GET /articles**

查询参数:
```
page=1                    # 页码
pageSize=20               # 每页数量
tag=react                 # 按标签 slug 筛选
authorId=uuid             # 按作者 ID 筛选
sortBy=publishedAt        # 排序字段: publishedAt | viewCount | likeCount
sortOrder=desc            # asc | desc
```
响应 `data`: `ArticleListItem[]`，附带 `meta` 分页信息。

实现要点: 只返回 `status=PUBLISHED` 且 `deletedAt IS NULL` 的文章。关联查询 author（UserPublic）和 tags。如果使用 tag 筛选，需要通过 `articles` 和 `tags` 的多对多关系 JOIN 查询。

**GET /articles/:slug**

响应 `data`: `ArticleDetail`（包含 content HTML、version、当前用户的 isLiked/isBookmarked 状态）。

实现要点: slug 查找文章，关联查询 author + tags。如果请求携带 token，额外查询 Like 和 Bookmark 表判断当前用户是否已点赞/收藏。每次访问 `viewCount` 原子递增（`UPDATE articles SET view_count = view_count + 1 WHERE id = $1` — 这就是原子操作练习点）。

**POST /articles**

请求体:
```json
{
  "title": "深入理解 React Hooks",
  "content": "<h2>标题</h2><p>正文HTML...</p>",
  "summary": "可选的摘要",
  "coverImage": "https://...",
  "tagIds": ["uuid1", "uuid2"],
  "status": "DRAFT"          // DRAFT | PUBLISHED，默认 DRAFT
}
```
响应 `data`: `ArticleDetail`

实现要点:
- slug 从 title 生成（转小写、空格转连字符、追加随机后缀避免冲突）
- `readTimeMinutes` = Math.ceil(纯文本字数 / 200)（按中文约200字/分钟）
- tagIds 关联到 Tag 表（多对多 connect）
- 发布时（status=PUBLISHED）设置 `publishedAt = now()`，并触发通知队列（BullMQ：通知关注者有新文章）
- `article_count` 在关联 Tag 上原子递增

**PUT /articles/:id** ⭐ 乐观锁练习

请求体:
```json
{
  "title": "更新后的标题",
  "content": "...",
  "summary": "...",
  "tagIds": ["uuid1"],
  "version": 3               // 必须携带当前版本号
}
```
响应 `data`: `ArticleDetail`（version+1）

乐观锁实现:
```sql
UPDATE articles
SET title=$1, content=$2, ..., version = version + 1, updated_at = now()
WHERE id = $3 AND version = $4 AND deleted_at IS NULL
```
如果 affected rows = 0，说明有其他请求先一步修改了，返回 409 `OPTIMISTIC_LOCK` 错误。前端收到后会提示用户"文章已被他人修改，请刷新后重试"。

**DELETE /articles/:id**

实现: 软删除 `UPDATE articles SET deleted_at = now() WHERE id = $1`。只有作者本人或 ADMIN 可删除。

**POST /articles/:id/like** ⭐ 并发练习

Toggle 逻辑: 如果已点赞则取消，如果未点赞则添加。

响应 `data`:
```json
{ "liked": true, "likeCount": 90 }
```

实现要点（并发安全）:
```sql
-- 用事务 + 原子操作
BEGIN;
-- 尝试插入
INSERT INTO likes (id, user_id, article_id, created_at) VALUES (gen_random_uuid(), $1, $2, now())
ON CONFLICT (user_id, article_id) DO NOTHING;

-- 检查是否成功插入
SELECT COUNT(*) FROM likes WHERE user_id = $1 AND article_id = $2;

-- 根据结果更新计数
UPDATE articles SET like_count = like_count + 1 WHERE id = $2 AND <inserted>;
-- 或
UPDATE articles SET like_count = GREATEST(like_count - 1, 0) WHERE id = $2 AND <removed>;
COMMIT;
```

**POST /articles/:id/bookmark**

Toggle 逻辑，同 like。

响应 `data`:
```json
{ "bookmarked": true }
```

---

### 3. 评论模块 — CommentController (`/articles/:articleId/comments`)

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET    | `/articles/:articleId/comments` | 否 | 评论列表（分页） |
| POST   | `/articles/:articleId/comments` | 是 | 发表评论/回复 |
| DELETE | `/articles/:articleId/comments/:id` | 是 | 删除评论 |
| POST   | `/articles/:articleId/comments/:id/like` | 是 | 评论点赞 Toggle |

**GET /articles/:articleId/comments**

查询参数: `page=1&pageSize=50`

响应 `data`: `Comment[]`（每条包含 replies 子评论数组）

实现要点: 只查 `parentId IS NULL` 的顶级评论，对每条顶级评论再查其 replies（最多返回前5条）。关联查询 author。如果携带 token，判断 isLiked。

**POST /articles/:articleId/comments**

请求体:
```json
{
  "content": "写得很好！",
  "parentId": null             // null = 顶级评论，uuid = 回复某条评论
}
```
响应 `data`: `Comment`

实现要点:
- 原子递增 `articles.comment_count += 1`
- 如果 parentId 不为 null，递增父评论的 `replyCount`（需在 Comment 模型加此字段，或用 _count 聚合）
- 触发通知: COMMENT_RECEIVED（通知文章作者）、COMMENT_REPLIED（通知父评论作者）

**DELETE /articles/:articleId/comments/:id**

只有评论作者或文章作者或 ADMIN 可删除。原子递减 `articles.comment_count`。

**POST /articles/:articleId/comments/:id/like**

响应 `data`:
```json
{ "liked": true, "likeCount": 5 }
```
同文章点赞的 Toggle 模式，操作 `comment_likes` 表。

---

### 4. 标签模块 — TagController (`/tags`)

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET  | `/tags` | 否 | 全部标签列表 |
| GET  | `/tags/:slug` | 否 | 单个标签详情 |
| POST | `/tags` | ADMIN | 创建标签 |

**GET /tags**

响应 `data`: `Tag[]`（全量返回，标签数量通常不大）

实现要点: 按 `articleCount` 降序排列。

**GET /tags/:slug**

响应 `data`: `Tag` 对象。

**POST /tags**

请求体:
```json
{ "name": "Vue.js", "description": "Vue 框架相关", "color": "#42B883" }
```
校验: name 唯一，slug 自动从 name 生成。

---

### 5. 用户模块 — UserController (`/users`)

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET  | `/users/:id` | 否 | 用户公开主页信息 |
| GET  | `/users/:id/articles` | 否 | 用户的文章列表 |
| GET  | `/users/:id/followers` | 否 | 粉丝列表 |
| GET  | `/users/:id/following` | 否 | 关注列表 |
| POST | `/users/:id/follow` | 是 | 关注/取消关注 Toggle |

**GET /users/:id**

响应 `data`: `UserProfile`
```json
{
  "id": "uuid",
  "username": "cooldev",
  "displayName": "Cool Developer",
  "avatar": null,
  "bio": "Full-stack dev",
  "role": "AUTHOR",
  "createdAt": "2025-01-15T00:00:00Z",
  "stats": {
    "articleCount": 15,
    "totalLikes": 230,
    "followerCount": 42,
    "followingCount": 18
  }
}
```
实现要点: `articleCount` 从 articles 表 COUNT（PUBLISHED 且未删除），`totalLikes` 从 likes 表 COUNT 该用户所有文章的点赞总数，`followerCount/followingCount` 从 follows 表 COUNT。

**GET /users/:id/articles**

查询参数: `page=1&pageSize=20&status=published`

响应 `data`: `ArticleListItem[]` + 分页 meta

只返回 PUBLISHED 且未删除的文章。

**GET /users/:id/followers**

响应 `data`: `FollowUser[]`（含 isFollowing 互相关系判断）

**GET /users/:id/following**

同上。

**POST /users/:id/follow**

Toggle 逻辑。不能关注自己。

响应 `data`:
```json
{ "followed": true }
```
关注时触发 USER_FOLLOWED 通知。

---

### 6. 个人中心 — ProfileController (`/profile`)

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET  | `/profile` | 是 | 获取当前用户完整信息 |
| PUT  | `/profile` | 是 | 更新个人资料 |
| PUT  | `/profile/password` | 是 | 修改密码 |
| GET  | `/profile/bookmarks` | 是 | 我的收藏列表 |

**GET /profile**

响应 `data`: `User`（含 email 等私密字段）

**PUT /profile**

请求体:
```json
{ "displayName": "新昵称", "bio": "新的个人简介", "avatar": "https://..." }
```
所有字段可选，只传要修改的。

**PUT /profile/password**

请求体:
```json
{ "currentPassword": "旧密码", "newPassword": "新密码" }
```
实现: bcrypt.compare 验证旧密码，bcrypt.hash 新密码。修改成功后自动调用 `AuthService.logoutAll(userId)` 强制所有设备下线（安全事件），并递增用户的 `tokenVersion`，使所有已签发的 AccessToken 立即失效——即使攻击者持有未过期的 token，也会因 `tokenVersion` 不匹配而被 JwtStrategy 拒绝。

**GET /profile/bookmarks**

查询参数: `page=1&pageSize=20`

响应 `data`: `BookmarkItem[]`
```json
[
  {
    "id": "bookmark_uuid",
    "article": { /* ArticleListItem */ },
    "createdAt": "2025-06-01T00:00:00Z"
  }
]
```
按收藏时间倒序。

---

### 7. 通知模块 — NotificationController (`/notifications`)

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET  | `/notifications` | 是 | 通知列表 |
| PUT  | `/notifications/:id/read` | 是 | 标记单条已读 |
| PUT  | `/notifications/read-all` | 是 | 全部标记已读 |
| GET  | `/notifications/unread-count` | 是 | 未读数量 |

**GET /notifications**

查询参数: `page=1&pageSize=30`

响应 `data`: `Notification[]`
```json
[
  {
    "id": "uuid",
    "type": "ARTICLE_LIKED",
    "actor": { /* UserPublic */ },
    "articleId": "uuid",
    "commentId": null,
    "content": "Cool Dev 赞了你的文章《深入理解 React Hooks》",
    "isRead": false,
    "createdAt": "2025-06-10T12:00:00Z"
  }
]
```
按创建时间倒序，关联查询 actor（UserPublic）。

**PUT /notifications/:id/read**

响应 `data`: `{ "isRead": true }`

**PUT /notifications/read-all**

```sql
UPDATE notifications SET is_read = true WHERE recipient_id = $1 AND is_read = false
```
响应 `data`: `{ "updatedCount": 5 }`

**GET /notifications/unread-count**

响应 `data`: `{ "count": 3 }`

---

### 8. 搜索模块 — SearchController (`/search`)

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET | `/search` | 否 | 全文搜索文章 |
| GET | `/search/suggest` | 否 | 搜索建议（自动补全） |

**GET /search**

查询参数:
```
q=react hooks              # 搜索关键词
page=1
pageSize=20
```
响应 `data`: `SearchResult[]`
```json
[
  {
    "id": "uuid",
    "title": "深入理解 React Hooks 闭包陷阱",
    "slug": "understanding-react-hooks-closure",
    "summary": "本文深入分析了...",
    "titleHighlight": "深入理解 <mark>React</mark> <mark>Hooks</mark> 闭包陷阱",
    "rank": 0.95,
    "author": { /* UserPublic */ },
    "publishedAt": "2025-06-10T08:00:00Z"
  }
]
```

实现要点: 使用 PostgreSQL 全文搜索。`searchVector` 字段（tsvector 类型）存储文章标题+内容的搜索向量。查询时使用 `to_tsquery` 和 `@@` 匹配运算符，`ts_rank` 计算相关度排序。高亮使用 `ts_headline` 函数。

```sql
SELECT *, ts_rank(search_vector, query) AS rank
FROM articles, to_tsquery('simple', $1) AS query
WHERE search_vector @@ query AND status = 'PUBLISHED' AND deleted_at IS NULL
ORDER BY rank DESC
LIMIT $2 OFFSET $3;
```

需要在 migration 中添加触发器或手动更新 search_vector:
```sql
UPDATE articles SET search_vector = to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,''));
```

**GET /search/suggest**

查询参数: `q=rea`

响应 `data`: `SearchSuggestion[]`（最多5条，只返回 title 和 slug）

---

### 9. 管理后台 — AdminController (`/admin`)

所有接口需要 ADMIN 角色。建议用 `@Roles('ADMIN')` 自定义守卫。

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| GET    | `/admin/dashboard` | ADMIN | 仪表盘统计 |
| GET    | `/admin/users` | ADMIN | 用户管理列表 |
| PUT    | `/admin/users/:id/role` | ADMIN | 修改用户角色 |
| POST   | `/admin/users/:id/ban` | ADMIN | 封禁/解封用户 |
| GET    | `/admin/articles` | ADMIN | 文章管理列表 |
| DELETE | `/admin/articles/:id` | ADMIN | 永久删除文章 |
| GET    | `/admin/tags` | ADMIN | 标签管理列表 |
| DELETE | `/admin/tags/:id` | ADMIN | 删除标签 |

**GET /admin/dashboard**

响应 `data`: `DashboardStats`
```json
{
  "totalUsers": 1500,
  "totalArticles": 320,
  "todayNewUsers": 12,
  "todayNewArticles": 5,
  "activeUsers7d": 230,
  "topTags": [
    { "name": "React", "articleCount": 42 },
    { "name": "TypeScript", "articleCount": 38 }
  ],
  "articleGrowth": [
    { "date": "2025-06-08", "count": 3 },
    { "date": "2025-06-09", "count": 7 }
  ]
}
```

实现要点:
- `todayNewUsers`: `COUNT(*) FROM users WHERE created_at >= CURRENT_DATE`
- `activeUsers7d`: 可以用 Redis 的 HyperLogLog 统计近7天活跃用户（每次用户登录/请求时 `PFADD active:7d:<date> userId`），或直接 COUNT DISTINCT
- `articleGrowth`: 最近30天每天的文章数，用 `DATE_TRUNC('day', published_at)` 分组

**GET /admin/users**

查询参数: `page=1&pageSize=20&search=keyword`

响应 `data`: `UserAdmin[]`（包含 email、isBanned 等管理字段）

search 模糊匹配 email/username/displayName。

**PUT /admin/users/:id/role**

请求体:
```json
{ "role": "AUTHOR" }
```
不能修改自己的角色，不能将用户降为 READER 如果该用户有已发布文章（可选校验）。

**POST /admin/users/:id/ban**

请求体:
```json
{ "action": "ban", "reason": "违反社区规则" }
// 或
{ "action": "unban" }
```
ban 时设置 `isBanned=true, bannedAt=now(), banReason=reason`。unban 时清除这三个字段。

**GET /admin/articles**

查询参数: `page=1&pageSize=20&search=keyword&status=PUBLISHED`

返回所有文章（包括 DRAFT/ARCHIVED），附带作者信息。

**DELETE /admin/articles/:id**

ADMIN 可永久删除（硬删除），或仅标记为 ARCHIVED。建议实现为硬删除。

**GET /admin/tags**

响应 `data`: `Tag[]`

**DELETE /admin/tags/:id**

删除标签时需要处理多对多关系: 先从 `_ArticleToTag` 中间表移除所有关联，再删标签。同时递减相关文章的 tag 计数。

---

### 10. 文件上传 — UploadController (`/upload`)

| 方法 | 路径 | 认证 | 说明 |
|---|---|---|---|
| POST | `/upload/image` | 是 | 上传图片 |

请求: `multipart/form-data`，字段名 `file`，限制 5MB，仅允许 jpg/png/webp/gif。

响应 `data`:
```json
{ "url": "/uploads/abc123.webp" }
```

实现要点: 用 Sharp 压缩和转换为 WebP 格式，文件保存到 `uploads/` 目录（或未来接入 OSS）。NestJS 用 `@UseInterceptors(FileInterceptor('file'))` + `MulterModule`。

---

### 11. 后台任务队列（BullMQ）

在 `app.module.ts` 中配置 `BullModule.forRoot({ connection: { host, port } })`，然后注册以下队列:

**notification 队列** — 处理通知创建

```typescript
// Producer (在 like/comment/follow 等操作中)
await notificationQueue.add('create', {
  type: 'ARTICLE_LIKED',
  recipientId: articleAuthorId,
  actorId: currentUserId,
  articleId: article.id,
  content: `${actor.displayName} 赞了你的文章《${article.title}》`,
});

// Consumer
@Process('create')
async handleCreate(job: Job) {
  const { type, recipientId, actorId, ...rest } = job.data;
  // 写入 notifications 表
  // 不要给自己发通知（recipientId !== actorId）
}
```

**view-count 队列** — 缓冲浏览量写入（写入合并练习）

```typescript
// 每次访问文章详情，不直接写 DB，而是推入队列
await viewCountQueue.add('increment', { articleId: slug });

// Consumer 每 30 秒批量合并一次
@Process({ name: 'flush', repeat: { every: 30000 } })
async flushViews() {
  // 从 Redis hash 中读取累积的浏览量
  // HINCRBY views:<articleId> 1
  // 批量 UPDATE articles SET view_count = <redis_value>
}
```

**search-index 队列** — 更新搜索索引

```typescript
// 文章创建/更新时
await searchIndexQueue.add('update', { articleId });

// Consumer
@Process('update')
async updateIndex(job: Job) {
  // 重新计算该文章的 search_vector
  await prisma.$executeRaw`
    UPDATE articles SET search_vector = to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(content,''))
    WHERE id = ${job.data.articleId}
  `;
}
```

---

### 12. NestJS 模块结构建议

```
src/
├── main.ts
├── app.module.ts
├── prisma/
│   ├── prisma.module.ts      (global)
│   └── prisma.service.ts
├── common/
│   ├── decorators/
│   │   ├── roles.decorator.ts       @Roles('ADMIN')
│   │   └── current-user.decorator.ts @CurrentUser()
│   ├── guards/
│   │   ├── jwt-auth.guard.ts        验证 JWT
│   │   ├── roles.guard.ts           检查角色
│   │   └── optional-auth.guard.ts   有 token 就解析，没有也放行
│   ├── filters/
│   │   └── all-exception.filter.ts  统一错误格式
│   ├── interceptors/
│   │   └── transform.interceptor.ts 统一 { data, meta } 格式
│   └── pipes/
│       └── zod-validation.pipe.ts   (如果用 zod 替代 class-validator)
├── auth/
│   ├── auth.module.ts
│   ├── auth.controller.ts
│   ├── auth.service.ts
│   ├── jwt.strategy.ts              Passport JWT 策略
│   └── dto/
│       ├── register.dto.ts
│       ├── login.dto.ts
│       └── refresh.dto.ts
├── article/
│   ├── article.module.ts
│   ├── article.controller.ts
│   ├── article.service.ts
│   └── dto/
├── comment/
│   ├── comment.module.ts
│   ├── comment.controller.ts
│   ├── comment.service.ts
│   └── dto/
├── tag/
│   ├── tag.module.ts
│   ├── tag.controller.ts
│   ├── tag.service.ts
│   └── dto/
├── user/
│   ├── user.module.ts
│   ├── user.controller.ts
│   ├── user.service.ts
├── profile/
│   ├── profile.module.ts
│   ├── profile.controller.ts
│   ├── profile.service.ts
│   └── dto/
├── notification/
│   ├── notification.module.ts
│   ├── notification.controller.ts
│   ├── notification.service.ts
│   └── queues/
│       └── notification.processor.ts
├── search/
│   ├── search.module.ts
│   ├── search.controller.ts
│   └── search.service.ts
├── admin/
│   ├── admin.module.ts
│   ├── admin.controller.ts
│   └── admin.service.ts
├── upload/
│   ├── upload.module.ts
│   ├── upload.controller.ts
│   └── upload.service.ts
└── queues/
    ├── view-count.processor.ts
    └── search-index.processor.ts
```

---

### 13. 并发控制练习清单

以下是在实现后端时可以刻意练习的并发/性能模式:

**悲观锁 (SELECT FOR UPDATE)**: 管理后台批量封禁用户时，先锁住用户行再操作。

**乐观锁 (version field)**: 文章更新接口 `PUT /articles/:id`，通过 version 字段防止丢失更新。

**原子操作**: 文章点赞/收藏/评论数变更，全部用 SQL 原子递增/递减（`SET count = count + 1`），不在应用层做 count 再写回。

**唯一约束兜底**: Like/Bookmark/Follow 的 Toggle 用 `INSERT ... ON CONFLICT DO NOTHING` 避免竞态条件产生重复记录。

**Redis 缓冲写**: 浏览量不直接写 DB，先 HINCRBY 到 Redis，定时批量 flush 回 PostgreSQL。

**分布式锁**: BullMQ 消费者防止多 worker 重复处理同一任务，用 Redis SETNX 实现。
