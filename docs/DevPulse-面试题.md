# DevPulse 项目面试题 — 全栈版

> 所有答案均基于 DevPulse 项目的真实实现代码，结合行业最佳实践进行深度解析。涵盖前端架构、后端设计、数据库优化等全栈面试场景。适合中高级全栈岗位模拟面试。

---

## 一、NestJS 架构设计

### Q1：请介绍一下你项目的整体架构，以及为什么选择 NestJS？

**回答：**

DevPulse 是一个 pnpm monorepo 项目，后端用 NestJS 11，前端用 React 19，数据库是 PostgreSQL 16 + Redis 7，ORM 使用 Prisma 7。后端架构采用 NestJS 的模块化设计，按业务领域拆分为 14 个模块：PrismaModule、PermissionModule、AuthModule、UserModule、ProfileModule、ArticleModule、TagModule、CommentModule、NotificationModule、SearchModule、AdminModule、UploadModule、QueueModule，每个模块包含 Controller、Service、DTO 三件套。

选择 NestJS 的核心理由有三个。第一是它的依赖注入（DI）容器让模块间的依赖关系显式化，每个 Service 通过构造函数注入依赖，不需要手动 `new` 或者用全局变量，这在高并发场景下天然支持单例模式。第二是 Guard、Pipe、Interceptor、Filter 四层中间件机制将认证、校验、响应转换、异常处理这四个横切关注点完全解耦，不需要在每个 Controller 里重复写 try-catch 和参数校验逻辑。第三是它的模块化 `@Module` 设计让团队协作时代码边界非常清晰，每个模块自包含，import 关系一目了然。

在 DevPulse 中，有两个 `@Global()` 全局模块：PrismaModule 提供数据库连接（所有模块都需要），PermissionModule 提供 RBAC 守卫和权限服务（大部分模块都需要）。其余模块按业务领域平铺在 `src/` 下，不需要通过 `src/modules/` 嵌套。

**追问 1：NestJS 的依赖注入和 Spring 的 IoC 容器有什么区别？**

原理非常相似，都是控制反转。区别在于 NestJS 用 TypeScript 的装饰器（`@Injectable()`、`@Inject()`）声明依赖，而 Spring 用 Java 注解。NestJS 的 DI 容器底层用的是 TypeScript 反射元数据（`emitDecoratorMetadata`），通过 `design:paramtypes` 自动推导构造函数参数类型来决定注入什么。Spring 则依赖 Java 反射 API。另一个区别是 NestJS 的模块作用域更严格——默认情况下 provider 是模块私有的，必须通过 `exports` 显式暴露，其他模块通过 `imports` 才能使用。Spring 的 Bean 默认是全局可见的。

**追问 2：`@Global()` 模块有什么风险？你怎么控制它的使用？**

`@Global()` 模块的 provider 会被注册到全局容器，任何模块都能直接注入，不需要显式 import。风险是滥用会导致模块间的隐式依赖——你觉得某个 Service 只在 A 模块用，但实际上 B 模块也能注入它，造成耦合扩散。我的控制策略是：只有真正所有模块都需要的才标 `@Global()`。DevPulse 中只有 PrismaModule（数据库连接）和 PermissionModule（权限守卫）两个全局模块。其他如 NotificationService 虽然被 ArticleService、CommentService、UserService 三个模块使用，但仍然通过 `NotificationModule` 的 exports + 使用方 modules imports 显式声明。

**追问 3：NestJS 中 Provider 的默认生命周期是什么？如果需要每次请求创建一个新实例怎么办？**

默认是单例（Singleton），整个应用生命周期内只有一个实例。如果需要请求级别的实例，可以用 `@Scope(Scope.REQUEST)` 装饰器，这样每次 HTTP 请求都会创建新的 provider 实例。但这有性能代价——如果 REQUEST-scoped 的 provider 被注入到 10 个 Controller 中，每个请求会创建 10 个实例。在 DevPulse 中没有使用 REQUEST scope，所有 Service 都是单例。如果某些状态需要请求级别隔离，应该用 `AsyncLocalStorage` 或者把状态放到请求上下文（`request.user`）中，而不是改变 provider 生命周期。

---

### Q2：你项目中的 AllExceptionFilter 和 TransformInterceptor 分别做什么？为什么不直接在 Controller 里 try-catch？

**回答：**

AllExceptionFilter 是全局异常过滤器，用 `@Catch()` 装饰器捕获所有异常，按异常类型分四层处理，统一转换为 `{ code: 数字, message: "脱敏中文消息", requestId: "uuid" }` 格式返回：

1. **BusinessException（自定义业务异常）**：提取 `code`（5 位数字错误码，如 20010 邮箱密码错误、40001 文章不存在）和自动脱敏的 `message`，HTTP 状态码从 `ERROR_HTTP_STATUS` 映射表获取（如 401、404、409 等）。`detail` 字段只写入内部日志，不返回给前端。
2. **NestJS HttpException（内置异常 + class-validator 校验）**：class-validator 数组错误转为 `{ code: 1001, message: "参数校验失败", details: [{ field, message }] }`，HTTP 200。其他 HttpException 通过 `mapHttpStatusToCode()` 映射为对应的业务错误码。
3. **Prisma 错误**：通过鸭子类型检测（`code` 属性以 `'P'` 开头），P2002 映射为 `code: 1010`（数据冲突），P2025 映射为兜底错误码，其他 Prisma 错误映射为 `code: 99001`（数据库异常）。HTTP 统一 200。
4. **未知异常（兜底）**：`code: 1`，HTTP 500，对外只返回"服务异常，请稍后重试"，完整堆栈只进内部日志。

每个响应都携带 `requestId`（由 `RequestIdMiddleware` 生成的 UUID，同时写入响应头 `X-Request-Id`），前端遇到异常可以把 requestId 反馈给后端，grep 日志即可定位全链路。

TransformInterceptor 是全局响应拦截器，用 RxJS 的 `map` 操作符将所有 Controller 的成功返回值统一包装为 `{ code: 0, message: "操作成功", data: result, requestId }` 格式。如果 Service 已经返回了 `{ data, meta }` 的分页结构，它检测到 `data` 和 `meta` 同时存在时会直接透传不做二次包装，同时附加 `code: 0` 和 `requestId`。

不在 Controller 里 try-catch 的原因：第一，try-catch 会导致每个方法都写重复代码，违反 DRY 原则。第二，异常来源是多样的——BusinessException 自带错误码，class-validator 返回数组错误，Prisma 运行时异常带 Prisma 专有的 `code` 字段（P2002/P2025），普通 Error 没有任何结构。AllExceptionFilter 在一个地方处理所有分支，确保客户端收到的错误格式始终一致。第三，拦截器是在框架层面运行的，Controller 甚至不需要知道自己返回的数据会被包装，这保持了业务代码的纯净。

**追问：如果我想对某个特定接口返回不同的格式怎么办？**

有几种方案。第一种是让 Service 返回包含特定标记的对象，Interceptor 检测后做不同处理——DevPulse 的 TransformInterceptor 已经在这么做了（检测 `data` + `meta` 键来判断是否是分页响应）。第二种是在 Controller 方法上用 `@Interceptors()` 装饰器覆盖全局拦截器。第三种是用 `@Header()` 自定义 Content-Type，让客户端根据 Content-Type 解析。推荐第一种，保持全局拦截器的简单性。

---

### Q3：ValidationPipe 的配置 `whitelist: true` 和 `forbidNonWhitelisted: true` 分别是什么意思？

**回答：**

`whitelist: true` 的意思是自动过滤掉 DTO 中未声明的字段。比如注册 DTO 只有 `email`、`username`、`password`、`displayName` 四个字段，如果客户端多传了一个 `isAdmin: true`，ValidationPipe 会默默忽略它，Service 层根本看不到这个字段。这是防止"质量攻击"（mass assignment attack）的关键配置。

`forbidNonWhitelisted: true` 在此基础上更严格——不仅过滤，还会返回 400 错误告诉客户端"你传了不允许的字段"。DevPulse 同时启用了这两个选项，意味着非法字段既不会被处理，也会让客户端知道传错了。

`transform: true` 配合 `transformOptions: { enableImplicitConversion: true }` 让 class-transformer 自动根据 DTO 的类型注解做类型转换。比如 `page` 字段声明为 `@IsNumber()`，客户端传 `"1"` 字符串会被自动转为数字 1。这在 GET 请求的 query 参数中特别有用，因为 URL query 参数天然都是字符串。

**追问：`transform` 自动转换有什么安全隐患？**

如果不小心在 DTO 中声明了敏感字段为数字类型，攻击者可能传入 `"true"` 或 `"1"` 被转为布尔值 `true`。另外，`enableImplicitConversion` 比较激进——它甚至会把空字符串 `""` 转为 `NaN`（对于数字类型）或 `null`。生产环境中建议对关键字段用显式装饰器（如 `@Type(() => Number)`）而不是依赖隐式转换，并且在 DTO 中用 `@IsOptional()` + `@IsBoolean()` 等严格校验每个可选字段。

---

## 二、JWT 认证与安全

### Q4：请详细说说你项目的 JWT 双令牌机制。

**回答：**

DevPulse 使用 accessToken + refreshToken 双令牌方案。accessToken 有效期 15 分钟，payload 包含 `{ sub: userId, email, tokenVersion }`（`tokenVersion` 用于实现 AccessToken 的主动失效机制，详见追问 5），用 `JWT_SECRET` 签名。refreshToken 有效期 7 天，payload 包含 `{ sub: userId, deviceId: crypto.randomUUID() }`，用独立的 `JWT_REFRESH_SECRET` 签名。

**登录流程（多设备）：** 用户提交邮箱+密码 → AuthService 验证 bcrypt 密码 → 检查设备数量上限（最多 10 个，超限淘汰最早登录的设备）→ 生成唯一 `deviceId`（UUID）→ 签发双令牌 → refreshToken 用 bcrypt(cost=12) 哈希后存入 Redis HASH `rt:{userId}:{deviceId}`（含 tokenHash + deviceName + platform + ip + loginAt），同时加入设备索引集合 `rt:{userId}:_devices`，TTL 7 天 → 返回双令牌给前端。

**请求流程：** 前端 Axios 拦截器在每次请求时从 sessionStorage 读取 accessToken 放到 `Authorization: Bearer <token>` 请求头。后端 JwtStrategy（Passport）从请求头提取 token → 验证签名和有效期 → 从数据库查用户（同时 select `tokenVersion` 字段）→ **对比 payload 中的 `tokenVersion` 与数据库当前值，不匹配立即拒绝** → 检查是否被封禁 → 将用户对象挂载到 `request.user`。这意味着即使 accessToken 签名合法且未过 15 分钟有效期，只要 `tokenVersion` 已递增（例如改密码或全设备登出），旧令牌立即失效。

**刷新流程：** 当 accessToken 过期返回 401 时，前端 Axios 拦截器自动用 refreshToken 调 `POST /auth/refresh`。后端验证 refreshToken 签名 → 从 JWT payload 提取 `deviceId` → 从 Redis HASH `rt:{userId}:{deviceId}` 取 `tokenHash` → bcrypt.compare 比对 → 通过后生成新的 `deviceId`，签发新双令牌，写入新设备会话，删除旧设备会话。如果 Redis 中找不到会话（可能已过期/已撤销），返回 401。如果 bcrypt 比对失败（Token 重用），仅撤销该设备会话，不影响其他设备的正常会话。

**注销流程：** 前端传 `refreshToken` 到 `POST /auth/logout`，服务端用 `jwtService.decode` 提取 `deviceId`，仅注销该设备会话。前端不需要管理 `deviceId`，只需把本地存储的 refreshToken 传回来。不传或解码失败则保守策略全部下线。另有显式的 `POST /auth/logout-all` 用于安全中心"退出所有设备"。修改密码时 ProfileService 自动调用 `AuthService.logoutAll()` 强制全部下线，同时递增 User 表的 `tokenVersion` 字段——这确保了所有已签发的 accessToken 立即失效（详见追问 5），而不必等待 15 分钟自然过期。

**追问 1：为什么用两个不同的 secret 签名 accessToken 和 refreshToken？**

这是安全纵深防御的核心原则。如果 accessToken 的 secret 泄露（比如被日志记录），攻击者可以伪造 accessToken 但不能伪造 refreshToken，因为没有 `JWT_REFRESH_SECRET`。反过来，如果 refreshToken 被偷但 access secret 没泄露，攻击者只能在 refresh 时获得新的短期 token，而且一旦原用户刷新令牌就会导致 Redis 中的哈希不匹配从而触发该设备撤销。两个 secret 独立签名让攻击面最小化。

**追问 2：为什么把 refreshToken 存在 Redis 而不是数据库？**

三个原因。第一是性能——refresh 请求需要频繁读写，Redis 的内存操作延迟是微秒级，PostgreSQL 是毫秒级。第二是 TTL 自动过期——Redis 的 `EX` 参数可以让 token 7 天后自动删除，不需要写定时清理任务。第三是原子操作——`HSET`、`DEL` 都是原子的，不需要担心并发刷新时的竞态条件。如果用数据库存储，需要额外处理过期数据清理和并发刷新的事务隔离。

**追问 3：多设备登录是怎么实现的？**

Redis 采用 `rt:{userId}:{deviceId}` 格式存储每个设备的会话（HASH 结构），其中 `deviceId` 是 refreshToken payload 中的 UUID。每次登录生成一个新的 `deviceId`，每个设备有独立的 refresh token 和 Redis 条目。同时用 `rt:{userId}:_devices`（SET）维护用户的所有设备索引，方便遍历和批量操作。

会话管理通过三个 API 暴露：`GET /auth/sessions` 列出所有活跃设备（通过 SMEMBERS 遍历 SET，再 pipeline 批量 HGETALL 获取每个设备的元数据），`DELETE /auth/sessions/:deviceId` 注销指定设备，`POST /auth/logout` 传 `refreshToken` 由服务端解码 `deviceId` 单设备下线（不传则全部下线）。

设备数量上限为 10 个（`MAX_DEVICES`）。新设备登录时如果达到上限，通过 pipeline 批量读取各设备的 `loginAt` 字段，按时间排序淘汰最早登录的设备。Token 重用检测只影响单个设备——哈希不匹配时仅撤销该设备的会话，其他设备不受影响。

**追问 4：accessToken 存 sessionStorage 有什么安全问题？**

sessionStorage 对 XSS 攻击是不安全的——如果前端有 XSS 漏洞，恶意脚本可以读取 sessionStorage 中的 token。替代方案有：用 httpOnly cookie 存储（防 XSS 但有 CSRF 风险，需要额外配 SameSite + CSRF Token），或者用内存变量存储（页面刷新后丢失，需要配合 silent refresh）。DevPulse 选择 sessionStorage 是权衡了开发复杂度和安全性——社区项目的 XSS 风险较低，且 refreshToken 存储在 Redis 中可以随时撤销。

**追问 5：AccessToken 签发后怎么主动让它失效？**

tokenVersion 机制。User 表存 `tokenVersion` 整数字段，签发 AccessToken 时将其嵌入 JWT payload。安全事件发生时递增此版本号——目前有两类触发场景：修改密码（`ProfileService` 调用 `AuthService.logoutAll()` 时同步递增）和显式全设备登出（`POST /auth/logout-all`）。JwtStrategy 每次认证请求时从数据库查出用户的 `tokenVersion`，与 payload 中携带的版本号对比，不匹配立即返回 401 拒绝请求。

这意味着旧 AccessToken 被**立即**拒绝，而不是等到 15 分钟自然过期。性能代价方面：每次认证请求多一次 DB 查询，但 Prisma 的 `findUnique` 本身就查了用户记录（用于检查封禁状态等），只多 `select` 一个 `tokenVersion` 字段，几乎零开销。

> 注：此机制解决了"AccessToken 签发后无法主动作废"的经典局限。此前唯一的手段是通过封禁检查（DB 查 `isBanned` 字段），但封禁是管理行为，用户主动的安全操作（改密码、全设备登出）无法立即使已签发的 AT 失效。tokenVersion 以极低的性能代价实现了即时的主动撤销能力。重置密码同样会触发此机制——`AuthService.resetPassword()` 在更新密码后递增 `tokenVersion` + 清除所有 Redis 会话，所有设备强制重新登录。

**追问 6：DevPulse 的忘记密码/重置密码是怎么实现的？**

**完整流程：**
1. 用户点击"忘记密码？" → 输入邮箱 → `POST /auth/forgot-password`。
2. 后端 `AuthService.forgotPassword(email)`：
   - **防邮箱枚举**：无论邮箱是否已注册，都返回统一成功消息（"如果该邮箱已注册，重置邮件将在几分钟内送达"），不泄露用户注册信息。
   - **冷却机制**：同一邮箱 60 秒内只能发送一次重置邮件（Redis key: `pwd_reset_cd:{email}`, TTL=60s），超频返回 `ErrResetCooldown(20027)`。冷却期也应用于不存在邮箱，防止通过响应时间差异枚举。
   - 生成 JWT 重置令牌（payload: `{sub: userId, purpose: 'password-reset'}`, 有效期 30 分钟, secret: `JWT_SECRET`）。
   - 令牌状态存入 Redis（`pwd_reset:{userId}` → `"unused"`, TTL=30min）。
   - 通过 MailService **同步 await** 发送重置邮件。发送成功 → 设置冷却期 + 返回成功；发送失败 → 不设冷却期 + 返回 `ErrMailSendFailed(20028)`，用户可立即重试。开发模式下发送前会把重置链接打印到终端日志辅助调试，但 **SMTP 连接失败仍会抛错**（不再静默吞掉）。`SMTP_HOST` 务必用 `127.0.0.1`（避免 macOS 下 `localhost` 解析为 IPv6 `::1` 报 `ECONNREFUSED ::1:1025`），并先启动 Mailpit（`docker compose up -d mailpit`）。
3. 用户在邮箱中点击重置链接 → 跳转 `/reset-password?token=eyJ...` → 输入新密码 → `POST /auth/reset-password`。
4. 后端 `AuthService.resetPassword(token, newPassword)`：
   - JWT 令牌校验 → 过期/无效抛 `ErrResetTokenExpired(20024)` / `ErrResetTokenInvalid(20025)`。
   - `purpose` 校验 → 防止其他类型 JWT 被滥用。
   - Redis 状态校验 → 不存在=过期 `ErrResetTokenExpired(20024)`，`"used"`=重放 `ErrResetTokenUsed(20026)`。
   - 更新密码（bcrypt saltRounds=12）。
   - 标记令牌已使用 → Redis value 改为 `"used"`（防重放攻击）。
   - **安全联动**：递增 `tokenVersion` + 清除全部 Redis 设备会话 → 所有设备强制重新登录。

**追问 7：重置令牌为什么用 JWT 而不是 UUID？**

JWT 令牌自带签名和过期时间，无需在数据库中额外存储 token 字符串。Redis 仅存储一个简单的状态标记（`"unused"` / `"used"`），用于防重放攻击。如果用 UUID 方案，则需要在数据库中创建 `PasswordReset` 表（含 token、userId、createdAt、expiresAt、usedAt 等字段），或在 Redis 中存储完整 token 字符串——两者都比 JWT 方案更重。JWT 的唯一缺点是签发后无法修改 payload（如延长有效期），但 30 分钟有效期足够，过期后用户只需重新申请即可。

做了 Token 传输的分层兼容。后端在 register / login / refresh 三个端点同时做两件事：JSON 响应体返回双 Token（兼容 APP / API 客户端），Set-Cookie 响应头将 refreshToken 写入 HttpOnly Cookie（Web 浏览器专用）。Cookie 设置了 `httpOnly: true`（JS 无法读取）、`secure: true`（仅 HTTPS）、`sameSite: 'lax'`（防 CSRF）、`path: '/api/v1/auth'`（限制作用域）。

这样 Web 前端的 refreshToken 实际由 HttpOnly Cookie 管理，即使前端有 XSS 漏洞也读不到 Cookie 中的 token。sessionStorage 中的 refreshToken 作为兜底保留，但主要的安全防线在 HttpOnly Cookie + Redis 端的 token rotation 重用检测。APP 客户端则直接从 JSON 响应体取 refreshToken，存入系统安全存储（iOS Keychain / Android EncryptedSharedPreferences）。

补充一点：在修改密码等安全事件中，DevPulse 同时触发两重撤销——Redis 侧清除所有设备的 refreshToken 会话（防止旧 RT 换取新 AT），数据库侧递增 `tokenVersion`（使所有已签发的旧 AT 立即失效，详见追问 5）。两重机制配合，确保无论 accessToken 还是 refreshToken 都无法在安全事件后继续使用。

---

### Q5：你的密码是怎么存储和验证的？bcrypt 的 cost factor 设的多少？

**回答：**

使用 bcrypt 哈希，cost factor 设为 12。注册时 `bcrypt.hash(password, 12)` 生成哈希存入 `password_hash` 字段。登录时 `bcrypt.compare(password, user.passwordHash)` 验证。bcrypt 的 cost=12 意味着每次哈希需要 2^12 = 4096 次迭代，在当前硬件上大约 200-300ms，既保证了安全性（暴力破解代价极高），又不会明显影响登录响应速度。

**追问：为什么选 bcrypt 而不是 argon2 或 scrypt？**

bcrypt 是目前 Node.js 生态中最成熟的选择，`bcrypt` npm 包用 C++ 原生实现，性能稳定。argon2 是更新的算法（2015 年发布，赢得了 Password Hashing Competition），理论上更安全（内存硬，抗 GPU 破解），但 Node.js 生态的 `argon2` 包相对年轻。对于学习项目来说 bcrypt 足够安全，如果面向生产且团队熟悉 argon2，可以考虑迁移。迁移方式是渐进式的——新用户注册用 argon2，老用户登录时检测到 bcrypt 哈希后自动升级为 argon2。

---

## 三、RBAC 权限系统

### Q6：你的 RBAC 权限系统是怎么设计的？为什么不用 Prisma 的 enum 来存角色？

**回答：**

DevPulse 的 RBAC 采用"角色表 + 权限表 + 两张关联表"的四表设计：

- `roles` 表：存储角色记录（ADMIN、AUTHOR、READER 三个系统角色 + 自定义角色），`isSystem` 字段标记是否内置
- `permissions` 表：14 个权限记录，每个权限由 `resource:action` 组成（如 `article:create`、`comment:delete:any`）
- `user_roles` 多对多关联表：用户可拥有多个角色
- `role_permissions` 多对多关联表：角色可拥有多个权限

早期版本确实用的是 Prisma `enum Role { READER AUTHOR ADMIN }`，但遇到了三个无法逾越的问题。第一，角色数量固定为 3 个，无法在运行时动态创建自定义角色（如 MODERATOR）。第二，用户只能拥有一个角色，无法同时赋予 ADMIN + AUTHOR 等多重身份。第三，Prisma 枚举在数据库层是 enum 类型，新增角色需要写 migration 修改数据库 schema，运维成本极高。

改为表存储后，管理员可以在前端 UI 动态创建角色、分配权限，所有变更立即生效（权限缓存 60 秒后自动刷新），不需要改代码和跑迁移。

**追问 1：你的 PermissionsGuard 是怎么工作的？**

PermissionsGuard 实现了 NestJS 的 `CanActivate` 接口。工作流程分四步：

1. 从 `Reflector` 读取当前路由上 `@RequirePermission()` 装饰器设置的权限标识
2. 如果没有权限要求，直接放行
3. 调用 `PermissionService.getUserPermissions(userId)` 获取该用户的聚合权限集合和角色名列表
4. 三层检查：ADMIN 角色直接放行 → 精确匹配权限 → `:any` 降级为 `:own` 回退放行

其中第 4 步的 `:any → :own` 回退是巧妙设计。比如文章编辑路由声明 `@RequirePermission('article:update:any')`，AUTHOR 用户只有 `article:update:own` 权限。Guard 层会放行（因为有 `:own` 权限），然后在 Service 层检查 `article.authorId === userId` 做最终归属验证。这样 Guard 只做能力检查（"这个角色类型能不能做这类操作"），Service 做归属检查（"这篇文章是不是你的"），职责分离。

**追问 2：权限缓存的 TTL 为什么设 60 秒而不是 5 分钟？**

这是安全性和性能的折中。60 秒意味着管理员修改权限后，最坏情况下用户 60 秒内还使用旧权限。5 分钟虽然减少了数据库查询次数，但权限变更延迟太长——在紧急封禁场景下不可接受。DevPulse 的 PermissionService 用 Redis 做集中缓存，key 为 `perm:{userId}`，value 是 JSON 序列化的权限数组，TTL 60 秒。每次请求只做一次 Redis `GET`（延迟微秒级）。管理员主动修改权限时调用 `invalidateCache()` 通过 `perm:_users` SET 追踪所有被缓存的用户，批量 `DEL` 立即清除全部缓存，不需要等 TTL 过期。

**追问 3：多实例部署下权限缓存会怎样？**

DevPulse 已经用 Redis 做集中缓存解决了这个问题。无论部署多少个 API 实例，所有进程共享同一份 Redis 缓存。管理员在 A 实例上调用 `invalidateCache()` 会删除 Redis 中所有 `perm:*` 键，B 实例下次请求时自动 miss 并从数据库重新加载。相比进程内 Map 缓存，Redis 方案天然支持水平扩展，不存在缓存不一致的窗口。唯一的代价是每次权限检查多一次 Redis IO（约 0.5ms），对于 60 秒 TTL 来说完全可接受。

---

## 四、Prisma ORM 与 PostgreSQL

### Q7：Prisma v7 和 NestJS 11 共存有什么兼容性问题？你是怎么解决的？

**回答：**

核心问题是 Prisma v7 默认生成 ESM 格式的客户端代码，但 NestJS 11 的整个编译链（tsconfig、jest、nest-cli）都是基于 CJS 的。如果直接用默认的 ESM 输出，`require()` 会报错。

解决方案是在 `schema.prisma` 的 generator 中配置 `moduleFormat = "cjs"`：

```prisma
generator client {
  provider     = "prisma-client"
  output       = "../src/generated/prisma"
  moduleFormat = "cjs"
}
```

这告诉 Prisma 的生成器输出 CJS 格式的代码，tsc 编译后也是 CJS，完全兼容 NestJS 的整套配置。这是 Prisma 官方原生支持的配置项，不是 hack。

第二个问题是 Prisma v7 引入了 Driver Adapter 机制——不再直接从 `DATABASE_URL` 连接数据库，而是要求显式传入 adapter：

```typescript
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL! });
super({ adapter });
```

需要安装 `@prisma/adapter-pg` 包，使用 pg 驱动连接 PostgreSQL。

第三个问题是 `@prisma/client/runtime/library` 模块路径在 v7 中变了，导致 AllExceptionFilter 中用 `import type { PrismaClientKnownRequestError }` 做 `instanceof` 检查会编译失败。我的解决方案是用鸭子类型检测替代 `instanceof`——检查异常对象是否有 `code` 属性且以 `'P'` 开头，这比依赖 Prisma 的内部类型更稳定。

**追问：为什么 Prisma v7 要引入 Driver Adapter？有什么好处？**

Driver Adapter 让 Prisma 不再绑定特定的数据库驱动。你可以用 `@prisma/adapter-pg`（node-postgres）、`@prisma/adapter-neon`（Neon serverless）、`@prisma/adapter-planetscale`（PlanetScale HTTP）等不同适配器连接同一个 PostgreSQL，而不需要改 schema 或查询代码。最大的好处是支持 serverless 环境——传统的 TCP 长连接在 serverless 函数中会超时或被回收，而 HTTP-based adapter（如 Neon）用无状态 HTTP 请求替代 TCP 连接，天然适合 serverless。

---

### Q8：你项目中用了哪些 Prisma 的事务模式？交互式事务和批量事务有什么区别？

**回答：**

DevPulse 中用了三种事务模式：

**1. 批量事务（`prisma.$transaction([...])`）：** 传入一个 Promise 数组，Prisma 将它们包在一个事务中顺序执行。DevPulse 的点赞 toggle 用了这种模式——先 `like.create/delete`，再 `$executeRaw` 更新 `like_count`。这种模式简单但不支持中间步骤的返回值依赖。

**2. 交互式事务（`prisma.$transaction(async (tx) => {...})`）：** 传入一个回调函数，回调内用 `tx` 代替 `prisma` 执行操作，支持中间返回值依赖和复杂逻辑。DevPulse 的注册流程用了这种模式——先 `tx.user.create`，再 `tx.role.findUnique`，最后 `tx.userRole.create`，中间步骤依赖前面创建的 user.id。管理后台的文章删除也用了交互式事务——先查文章的关联标签，再删除关联表记录，再递减 articleCount，最后删除文章。

**3. Raw SQL + 原子操作：** 对于简单的计数增减，直接用 `$executeRaw` 写原子 SQL，不需要显式开事务。比如 `UPDATE articles SET like_count = like_count + 1 WHERE id = $1` 本身就是一条原子语句。

**追问：批量事务和交互式事务在 PostgreSQL 层面有什么区别？**

批量事务在 PostgreSQL 层面是 `BEGIN; query1; query2; COMMIT;`，所有查询在事务开始前就确定了。交互式事务也是在同一个 `BEGIN/COMMIT` 块中，但查询是按需发送的——前一个查询的结果可以决定后一个查询的内容。交互式事务的代价是事务持续时间更长（因为要等 JS 逻辑执行），在高并发下会持有行锁更久。所以如果所有操作都能预先确定（互不依赖），优先用批量事务。

**追问：Prisma 的 `$transaction` 和 PostgreSQL 的 `SAVEPOINT` 有什么关系？**

`$transaction` 对应的是 `BEGIN/COMMIT/ROLLBACK`，不涉及 SAVEPOINT。但交互式事务内部如果抛出异常，Prisma 会自动 `ROLLBACK` 整个事务。SAVEPOINT 是 PostgreSQL 的嵌套事务特性，在事务内部创建回滚点。Prisma 不直接暴露 SAVEPOINT API，如果需要嵌套事务语义，可以用 raw SQL `$executeRawUnsafe('SAVEPOINT sp1')` 手动控制，但通常不推荐——嵌套事务增加了复杂度，大多数场景一层事务就够了。

---

### Q9：你在项目中什么时候用 raw SQL，什么时候用 Prisma 的查询 API？

**回答：**

遵循一个原则：**Prisma API 能高效完成的就用 API，API 不支持或性能差的就用 raw SQL。**

具体到 DevPulse 中用 raw SQL 的场景有：

1. **原子计数更新**：`UPDATE articles SET like_count = like_count + 1 WHERE id = $1`，这种原子递增用 Prisma API 需要先 `findUnique` 读出当前值，再 `update` 写入新值，两步操作有竞态条件。raw SQL 一条语句完成，PostgreSQL 的行锁保证原子性。

2. **批量更新标签计数**：`UPDATE tags SET article_count = article_count + 1 WHERE id IN (...)`，Prisma 的 `updateMany` 不支持基于每行不同值的更新（所有行只能 SET 同一个值）。

3. **悲观锁**：`SELECT * FROM tags WHERE id = $1 FOR UPDATE`，Prisma 不暴露 `FOR UPDATE` 语法。

4. **乐观锁**：`UPDATE articles SET ... WHERE id = $1 AND version = $2`，需要检查 `affected rows` 是否为 0 来判断冲突，Prisma 的 `update` API 不返回 affected rows。

5. **用户统计聚合**：用子查询一条 SQL 统计文章数、总点赞数、粉丝数、关注数，比用 4 次 `count` 查询高效。

6. **全文搜索**：`setweight(to_tsvector(...))` 和 `plainto_tsquery` 是 PostgreSQL 特有功能，Prisma 不支持。

**追问：raw SQL 有什么风险？你怎么缓解？**

最大的风险是 SQL 注入。缓解方式是使用 Prisma 的参数化查询（`$executeRaw` 配合 `Prisma.sql` 模板标签），而不是字符串拼接。Prisma 的 `Prisma.sql` 会自动对参数做转义，和 prepared statement 等价。对于必须用 `$executeRawUnsafe` 的场景（如动态表名），严格校验输入。另一个风险是 raw SQL 绕过了 Prisma 的类型系统，返回值的类型需要手动声明（`$queryRaw<[{ count: bigint }]>`），容易出运行时类型错误。我在项目中统一把 bigint 转为 Number 再返回给前端。

---

## 五、Redis 与缓存策略

### Q10：你的项目中 Redis 有几种用途？分别用了什么数据结构？

**回答：**

DevPulse 中 Redis 有四种用途，分别使用了不同的数据结构：

**1. 多设备会话管理（HASH + SET）：** 每个设备会话存储在 Redis HASH `rt:{userId}:{deviceId}` 中，字段包括 `tokenHash`（refreshToken 的 bcrypt 哈希）、`deviceName`、`platform`、`ip`、`loginAt`、`lastActiveAt`，TTL 7 天。同时用 SET `rt:{userId}:_devices` 维护用户的所有设备索引，支持 `GET /auth/sessions` 遍历和批量注销。单用户最多 10 个并发设备，超限自动淘汰最早登录的设备。

**2. 阅读量缓冲（String + 计数器）：** key 为 `view_buffer:{articleId}`，value 是累计阅读次数。用 `INCR` 原子递增。ViewCountProcessor 每 60 秒遍历 `view_buffer:*` 的所有 key，读取计数值，批量刷写到 PostgreSQL，然后 `DEL` 删除缓冲。这把数据库写入从"每次访问一次"降为"每分钟一次"。

**3. 权限缓存（String + TTL）：** PermissionService 用 Redis 存储每个用户的权限列表，key 为 `perm:{userId}`，value 是 JSON 序列化的权限数组，TTL 60 秒。同时用 SET `perm:_users` 跟踪所有被缓存的用户，批量失效时通过 `SMEMBERS` + 批量 `DEL` 一键清除。相比进程内 Map 缓存，Redis 方案在多实例/集群部署时所有进程共享同一份缓存，不会出现缓存不一致的问题。

**4. BullMQ 任务队列（Redis Lists + Sorted Sets）：** BullMQ 底层使用 Redis 的 List（等待队列）、Sorted Set（延迟任务）、Hash（任务数据）等多种数据结构。DevPulse 有 notification 和 view-count 两个队列。

**追问 1：阅读量缓冲的 `INCR` 和 `GET` + `DEL` 之间有竞态条件吗？**

有。在 `GET` 读取缓冲值后、`DEL` 删除前，可能有新请求执行了 `INCR`，这部分增量会丢失。严格的解决方案是用 `GETDEL`（Redis 6.2+ 的原子操作，读取并删除）或者用 Lua 脚本把 `GET` + `DEL` + `UPDATE` 原子化。DevPulse 当前的实现在低并发下可接受（丢失概率极低），但高并发场景需要改进。另一个方案是只 `GET` 不 `DEL`，用 `DECRBY` 减去已刷写的量，这样不会丢失增量但会留下"僵尸 key"需要定期清理。

**追问 2：如果 Redis 宕机了，缓冲中的阅读量数据怎么办？**

数据丢失。这是 Redis 作为缓冲层的固有风险。缓解方案有几种：第一是 Redis 配置 AOF 持久化（`appendonly yes`），每秒 fsync 一次，最多丢失 1 秒数据。第二是双写策略——`INCR` Redis 的同时 `UPDATE` 数据库（但这回到了直接写数据库的原始问题）。第三是接受"阅读量最终一致"的业务语义——社区平台的阅读量不需要绝对精确，偶尔丢失几次计数用户感知不到。DevPulse 选择了方案三，这是典型的 CAP 折中——牺牲强一致性换取高吞吐。

---

### Q11：BullMQ 的通知管道是怎么工作的？为什么不直接同步创建通知记录？

**回答：**

DevPulse 的通知管道分三层：

**Producer 层（业务 Service）：** 当用户点赞、评论、回复、关注时，业务代码调用 `NotificationService.dispatch()` 方法。这个方法做两件事：检查"不通知自己"（`recipientId !== actorId`），然后通过 `notificationQueue.add()` 将通知数据投递到 BullMQ 队列。投递时设置了重试策略——`attempts: 3, backoff: { type: 'exponential', delay: 1000 }`，失败后指数退避重试。

**Queue 层（BullMQ + Redis）：** BullMQ 将任务序列化后存入 Redis，内部使用 List 维护等待队列、Sorted Set 维护延迟任务、Hash 存储任务数据。

**Worker 层（NotificationProcessor）：** 用 `@Processor('notification')` 装饰器注册为 BullMQ Worker，从队列中取出任务，执行 `prisma.notification.create()` 写入数据库。Worker 是独立于 HTTP 请求的后台进程，即使数据库写入慢也不会阻塞 API 响应。

不直接同步创建通知记录的原因：第一是**性能**——点赞操作的 API 响应时间不应该被通知写入拖慢。如果 PostgreSQL 通知表写入耗时 50ms，用户感知到的点赞延迟就是 50ms + 主事务时间。通过 BullMQ 异步投递，API 响应只包含主事务时间。第二是**可靠性**——通知创建失败不应该影响主业务。如果通知写入时数据库暂时不可用，BullMQ 的 3 次重试 + 指数退避能自动恢复，而同步写入会导致点赞操作整体失败。第三是**解耦**——未来如果要增加邮件通知、WebSocket 推送等新的通知渠道，只需要在 Worker 中增加处理逻辑，Producer 层完全不需要改。

**追问：BullMQ 的 Worker 如果挂了怎么办？任务会丢失吗？**

不会丢失。BullMQ 使用 Redis 作为持久化存储（前提是 Redis 配置了 AOF），Worker 崩溃后重启时会继续消费未完成的任务。BullMQ 的任务有状态机：`waiting → active → completed/failed`。Worker 在处理任务时会先标记为 `active`，如果 Worker 崩溃，BullMQ 的 stalled job 检测机制（默认 30 秒扫描一次）会将 `active` 超过阈值的任务重新放回 `waiting` 队列。配合 `attempts: 3` 的重试策略，任务最多会尝试 3 次。如果 3 次都失败，任务进入 `failed` 状态，可以通过 BullMQ Dashboard 或 `removeOnFail` 配置处理。DevPulse 设置了 `removeOnComplete: { count: 100 }` 只保留最近 100 个已完成任务，防止 Redis 内存膨胀。

---

## 六、并发控制

### Q12：你项目中用了几种并发控制模式？分别应用在什么场景？

**回答：**

DevPulse 刻意设计了五种并发控制模式，覆盖后端开发中最常见的场景：

**1. 原子操作（SQL 递增/递减）：** 用于点赞数、评论数的更新。`UPDATE articles SET like_count = like_count + 1 WHERE id = $1`，PostgreSQL 的行级锁保证即使 100 个请求同时执行，每个 +1 都不会丢失。不需要显式开事务，单条 UPDATE 本身就是原子的。

**2. 悲观锁（SELECT FOR UPDATE）：** 用于标签的 articleCount 更新。当文章创建时关联多个标签，需要递增每个标签的计数。如果两个请求同时给同一篇文章添加相同的标签，不加锁会导致计数重复递增。通过 `SELECT * FROM tags WHERE id = $1 FOR UPDATE` 加行锁，第二个请求必须等第一个事务提交后才能继续。

**3. 乐观锁（version 字段）：** 用于文章编辑。Article 表有 `version` 字段，初始值 1。编辑时 SQL 为 `UPDATE articles SET ... WHERE id = $1 AND version = $2`，提交时 version 自增。如果两个用户同时编辑同一篇文章，先提交的把 version 从 1 改为 2，后提交的发现 `WHERE version = 1` 匹配不到行（affected rows = 0），返回 409 Conflict 让客户端重新加载。乐观锁的好处是不阻塞读操作，适合低频冲突场景。

**4. 唯一约束兜底：** 用于注册邮箱唯一、点赞/收藏/关注的去重。`Like` 模型有 `@@unique([userId, articleId])` 约束，即使用户快速双击点赞按钮发出两个并发请求，第二个请求会被数据库拒绝（Prisma P2002 错误），AllExceptionFilter 将其映射为 409 Conflict。这是"数据库作为最终一致性保障"的典型应用。

**5. 缓冲写入（Redis 缓冲 + 定时刷写）：** 用于阅读量统计。每次访问文章不直接写数据库，而是 `INCR view_buffer:{articleId}`，ViewCountProcessor 每 60 秒批量刷写。这把高频写操作（可能每秒数百次）合并为低频批量操作（每分钟一次），数据库写入量降低数百倍。

**追问 1：乐观锁和悲观锁分别在什么场景下更优？**

核心看**冲突概率**。乐观锁适合"冲突概率低"的场景——比如文章编辑，两个人同时编辑同一篇文章的概率很低，大部分情况下 version 检查都能通过，不浪费锁资源。悲观锁适合"冲突概率高"的场景——比如库存扣减、秒杀场景，大量请求争抢同一行数据，如果用乐观锁会导致大量 409 重试，反而比悲观锁更慢。DevPulse 的文章编辑用乐观锁（低频冲突），标签计数用悲观锁（多篇文章可能同时关联同一标签），这个选择是合理的。

**追问 2：你的 toggleLike 方法先 findUnique 再 create/delete，这不是有竞态条件吗？**

严格来说确实存在 TOCTOU（Time-of-Check to Time-of-Use）竞态。两个请求同时 `findUnique` 都返回 `null`（没有点赞），然后都执行 `create`，第二个会因为 `@@unique([userId, articleId])` 唯一约束抛出 P2002 错误。AllExceptionFilter 捕获后返回 409，客户端可以重试。另一种实现是用事务 + SELECT FOR UPDATE 避免竞态，但 toggle 操作的并发量通常不高，唯一约束兜底 + 客户端重试是更简洁的方案。对于库存扣减等"绝对不能多扣"的场景，就必须用事务 + 悲观锁，不能依赖唯一约束兜底。

---

## 七、Docker 与生产化

### Q13：你的 Docker Compose 为什么要拆成两个文件？`docker-compose.yml` 和 `docker-compose.dev.yml` 的区别是什么？

**回答：**

采用 Docker Compose 官方的"base + override"多文件模式。`docker-compose.yml` 是生产基线，定义了 PostgreSQL 16 和 Redis 7 两个服务，关键设计是**不暴露数据库端口到宿主机**——数据库只通过 `devpulse-net` 自定义 bridge 网络与 API 容器通信，防止公网端口扫描和暴力破解。

`docker-compose.dev.yml` 是开发覆盖层，只做一件事：给 PostgreSQL 和 Redis 加上 `ports` 映射（5432 和 6379），方便开发者用 pgAdmin、RedisInsight 等本地工具直连数据库调试。

启动时通过 `-f` 参数组合：

```bash
# 开发：两个文件叠加，有端口映射
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# 生产：只用基线，无端口暴露
docker compose up -d
```

这种设计的好处是**生产配置不会被开发需求污染**。如果只有一个文件，开发者很容易为了调试方便加上 `ports` 映射然后忘记删除就推到生产环境。拆分后，生产基线文件里根本没有 `ports` 字段，从根源上杜绝了端口暴露风险。

**追问：你提到密码变量"禁止写默认值"，具体是怎么做的？**

Docker Compose 的变量语法支持 `${VAR:-default}`（有兜底）和 `${VAR}`（无兜底）。我的设计是：非敏感变量用兜底语法（如 `POSTGRES_USER: ${POSTGRES_USER:-devpulse}`），漏配 `.env` 时用默认值 `devpulse`，本地开发不会崩溃。密码变量**不用**兜底语法（如 `POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}`），漏配时 Docker Compose 会因为变量未定义而启动失败，这是**期望行为**——宁可启动报错，也不能用弱默认密码裸奔上线。这是"Fail Secure"安全原则的应用：系统在不安全配置下应该主动失败，而不是默默降级运行。

---

### Q14：你的 API 容器如果也要 Docker 化，怎么和 PostgreSQL/Redis 容器通信？

**回答：**

三个容器都挂载到 `devpulse-net` bridge 网络中，通过容器名作为 hostname 通信。API 容器的 `DATABASE_URL` 改为 `postgresql://devpulse:password@postgres:5432/devpulse`（`postgres` 是 PostgreSQL 容器的容器名），`REDIS_HOST` 改为 `redis`（Redis 容器名）。Docker 内置的 DNS 会在同一网络中自动解析容器名到对应的内部 IP。

API 容器的 Dockerfile 大致如下：

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY apps/api/package.json apps/api/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY apps/api/ .
RUN npx prisma generate
RUN pnpm build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/src/generated ./src/generated
EXPOSE 3000
CMD ["node", "dist/main.js"]
```

使用多阶段构建——builder 阶段编译代码，最终镜像只包含编译产物和运行时依赖，镜像体积更小。

**追问：启动顺序怎么保证？如果 API 容器先于 PostgreSQL 启动怎么办？**

Docker Compose 的 `depends_on` 可以控制启动顺序，但它只保证容器启动（started），不保证服务就绪（ready）。PostgreSQL 容器启动后还需要几秒钟初始化数据库。解决方案是结合 healthcheck + depends_on condition：

```yaml
api:
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
```

PostgreSQL 和 Redis 的 healthcheck 已在基线配置中定义（`pg_isready` 和 `redis-cli ping`），Docker Compose 会等服务健康检查通过后才启动 API 容器。另外，NestJS 的 PrismaService 在 `onModuleInit` 中调用 `$connect()`，如果连接失败会抛异常导致启动失败，Docker 的 `restart: unless-stopped` 会自动重启，直到数据库就绪。

---

## 八、系统设计与最佳实践

### Q15：你的项目种子数据是怎么设计幂等性的？

**回答：**

种子数据（`prisma/seed.ts`）的幂等性通过三个机制保证：

**1. Upsert 代替 Insert：** 所有数据创建都用 `prisma.xxx.upsert()`，以唯一键作为 `where` 条件。如果记录已存在则 `update: {}`（不修改），不存在则 `create`。重复执行 seed 不会创建重复数据。

**2. 固定 UUID 常量：** Comment 和 Notification 的 ID 使用硬编码的 UUID 常量（如 `const COMMENT_1_ID = 'a1111111-...'`），因为 Comment 和 Notification 没有天然的唯一业务键可以作为 upsert 的 where 条件，用固定 ID 保证幂等。

**3. 角色-权限映射的 delete + createMany：** 角色权限映射不适合 upsert（因为复合键是 roleId + permissionId，需要两个查询才能确定），所以采用"先 deleteMany 清空，再 createMany 重建"的策略。虽然会短暂清空映射，但 seed 只在开发和部署时运行，不影响生产流量。

种子数据的创建顺序考虑了外键依赖：角色 → 权限 → 角色权限映射 → 用户 → 用户角色映射 → 标签 → 文章（关联标签）→ 互动数据（点赞/收藏/关注/评论/通知）。每一步都依赖前面创建的记录的 ID。

**追问：生产环境的初始化数据和开发环境的 seed 有什么区别？**

开发环境的 `seed.ts` 创建完整的测试数据（4 个用户、6 个标签、4 篇文章、互动数据），用于开发和测试。生产环境的初始化只创建最小必要数据——PrismaService.onModuleInit 中的 `seedRolesAndPermissionsIfEmpty()` 初始化角色和权限，`bootstrapAdminIfNoneExists()` 创建初始管理员账户。生产环境不需要测试文章和假用户，这些应该由真实用户创建。两个初始化路径共享相同的 `SYSTEM_ROLES`、`ALL_PERMISSIONS`、`ROLE_PERMISSIONS` 常量，确保开发环境和生产环境的权限模型完全一致。

---

### Q16：你的项目中前后端通信的错误格式是怎么统一的？前端怎么处理 401？

**回答：**

DevPulse 采用"HTTP 状态码 + 数字业务错误码"的混合模式（国内大厂通用实践）：

**HTTP 状态码保留标准 REST 语义：** 404 就是 404、400 就是 400、401 就是 401。HTTP 状态码提供粗粒度的传输层语义，前端可以按状态码做不同的基础设施级处理（如 401 触发令牌刷新）。

**业务语义由 `code` 字段承载：** 每个响应体中携带 `{ code: 数字, message: "脱敏中文", requestId: "uuid" }`。`code === 0` 表示成功，`code !== 0` 表示业务失败。错误码按模块分段编码：1001~1099 通用、20001~20099 认证、30001~30099 用户、40001~40099 文章、50001~50099 评论、90001~90099 管理后台等。这样 `code: 40001` 可以精确区分"文章不存在"，`code: 50001` 是"评论不存在"，比 HTTP 404 提供了更细的粒度。

**错误信息对外脱敏：** 后端抛 `BusinessException(ErrEmailOrPwdWrong)` 时，自动从 `ERROR_MESSAGES` 映射表查出预定义的中文消息"邮箱或密码错误"，内部 `detail`（如具体哪个字段不匹配）只写入日志不返回前端。每个响应携带 `requestId`（UUID），前端遇到异常可以把 requestId 反馈给后端，grep 日志即可看到完整的内部 detail 和堆栈。

**前端错误处理分两层：**

第一层是 Axios 响应拦截器的 HTTP 200 分支——后端业务错误（如密码错误、资源不存在）HTTP 仍然返回 200，拦截器检查 `body.code !== 0` 后转为 rejected promise，标记 `isBusinessError: true`。业务代码用 `getApiError(err)` 提取标准化的 `ApiError` 对象，按 `code` 做不同 UI 处理（如 `code === 20020` 邮箱重复时高亮输入框，其他错误弹 toast）。

第二层是 401 的令牌自动刷新——当 accessToken 过期返回 401 时，拦截器自动用 refreshToken 调 `POST /auth/refresh`（请求设置 `withCredentials: true`，浏览器自动携带 HttpOnly cookie 中的 refreshToken；如果 cookie 不可用——如 APP 客户端或跨域 cookie 被禁用——拦截器从 sessionStorage 读取 refreshToken 作为兜底放在请求体中发送）。核心设计是**并发安全**：如果页面加载时同时 5 个请求都 401，只有第一个触发 refresh，其余 4 个排入 `pendingQueue` 等待。refresh 成功后 `processQueue(null)` 触发所有排队请求重发；refresh 失败则 `clearAuth()` 清除令牌跳转登录页。

**追问：如果 refreshToken 也过期了呢？**

refreshToken 过期后 `POST /auth/refresh` 会返回 401（JwtService.verify 失败抛出 UnauthorizedException），前端的 catch 分支执行 `clearAuth()`：清除 sessionStorage 中的双令牌，跳转到 `/login` 页面。用户需要重新登录。这是一个平滑的降级体验——用户在操作过程中突然发现某个请求失败，被自动引导到登录页，登录后可以继续操作。

**追问 2：为什么成功统一用 `code: 0` 而不是 `code: 200` 或 `success: true`？**

`code: 0` 是 Unix 进程退出码的惯例——0 表示成功，非 0 表示失败。这个约定在 C/C++、Shell、HTTP/2 的 gRPC 等领域广泛使用，程序员一看就懂。用 `success: true` 的问题是 TypeScript 无法约束这个字段一定存在（有人可能写 `success: "yes"`），而 `code` 是数字类型，`code === 0` 的判断既简洁又类型安全。用 `code: 200` 的问题是容易和 HTTP 状态码 200 混淆，且 0 比任何非 0 数字都"特殊"，一眼就能区分成功和失败。

---

### Q17：你的项目用了哪些 HTTP 方法？为什么 toggle 操作用 POST 而不是 PUT？

**回答：**

DevPulse 的 HTTP 方法遵循 RESTful 约定：

- **GET** — 查询资源（文章列表、文章详情、用户资料、通知列表）
- **POST** — 创建资源（注册、登录、创建文章、发表评论）和 toggle 操作（点赞/收藏/关注）
- **PUT** — 全量更新（编辑资料、编辑文章、修改权限分配）
- **DELETE** — 删除资源（文章、标签、角色）

toggle 操作（点赞/收藏/关注）用 POST 而不是 PUT，原因是：toggle 的本质是"在集合中创建或删除一条关联记录"。点赞是 `Like.create()`，取消点赞是 `Like.delete()`。这是一个"创建/删除"操作而非"更新"操作——Like 记录要么存在要么不存在，没有"更新 Like 记录的某个字段"的语义。POST 语义上是"向集合提交一个动作"，toggle 恰好符合这个语义。如果设计为 `PUT /articles/:id/like` with `{ liked: true/false }`，虽然也能工作，但让客户端控制服务端的状态方向（"我要 liked=true"），不如 POST toggle（"我触发一次点赞动作"）更符合 REST 的资源操作语义。

**追问：PUT 和 PATCH 的区别是什么？你项目里为什么统一用 PUT？**

PUT 语义是"完全替换资源"，PATCH 语义是"部分更新资源"。严格 RESTful 规范下，只改一个字段应该用 PATCH。DevPulse 统一用 PUT 是务实选择——NestJS 的 `@Put()` 装饰器和前端的 `api.put()` 保持一致，减少团队的认知负担。在实际项目中，严格区分 PUT 和 PATCH 的收益不大（大多数 API 框架和客户端库对两者的处理没有区别），统一用 PUT 反而降低了前后端协商成本。

---

### Q18：你的上传功能是怎么处理图片的？为什么不直接存原图？

**回答：**

DevPulse 的上传流程是：Multer 接收文件 → 验证 MIME 类型（只允许 jpg/png/webp/gif）→ Sharp 处理图片 → 输出 webp 格式。处理参数是 `resize({ width: 1920, withoutEnlargement: true })` + `webp({ quality: 80 })`。

不存原图的原因有三个。第一是**存储成本**——手机拍照的原图通常 5-15MB，而 1920px 宽度 + webp 格式 + 80% 质量的图片通常只有 200-500KB，存储成本降低 10-30 倍。第二是**带宽成本**——用户浏览文章时加载 500KB 图片比加载 10MB 原图快得多，页面加载速度直接影响用户体验和 SEO。第三是**安全**——原图可能包含 EXIF 元数据（GPS 位置、设备信息等），Sharp 的处理过程会剥离所有元数据，保护用户隐私。

`withoutEnlargement: true` 确保小于 1920px 的图片不会被放大（放大只会增加文件大小，不会增加清晰度）。

文件名使用 `Date.now()-${randomUUID()}.webp` 格式，时间戳前缀保证按时间排序，UUID 保证唯一性防止文件名冲突。

**追问：如果要支持头像裁剪为圆形，应该在客户端还是服务端做？**

推荐在服务端做。客户端裁剪（用 Canvas API）的问题是不同浏览器的 Canvas 实现有差异，且用户可能禁用 JavaScript。服务端用 Sharp 可以精确控制输出：头像用 `resize(200, 200, { fit: 'cover' })` 裁剪正方形 + 圆角 mask，缩略图用 `resize(50, 50)` 生成小尺寸版本。DevPulse 的头像上传就是这种方式。但如果是复杂的手动裁剪（用户拖动选区），则必须在客户端用 Canvas 预览，客户端裁剪后再上传裁剪结果。

---

## 九、综合追问

### Q19：如果让你重新设计这个项目，你会做哪些改进？

**回答：**

有几个方向我会改进：

**1. 引入事件驱动架构（EDA）：** 当前的通知 dispatch 虽然通过 BullMQ 实现了异步，但 Producer 和 Worker 之间仍然是直接调用关系（ArticleService 直接调用 NotificationService.dispatch）。更好的设计是引入领域事件（Domain Event），比如 `ArticleLikedEvent`、`CommentCreatedEvent`，用 NestJS 的 EventEmitter 发布事件，通知服务订阅事件后创建通知。这样 ArticleService 不需要知道通知系统的存在，符合开闭原则。

**2. 用 Redis Pipeline 批量操作：** ViewCountProcessor 当前对每个 article 逐一 `GET` + `DEL`，如果有 1000 篇文章有缓冲，就是 2000 次 Redis 网络往返。用 Redis Pipeline 可以一次性发送所有命令，一次网络往返完成。

**3. 数据库迁移策略：** 当前用 `prisma migrate dev` 自动生成迁移，生产环境应该改为 `prisma migrate deploy`（只执行迁移，不创建新迁移），并在 CI/CD 中自动执行。

**4. 日志系统：** 当前用 NestJS 内置的 Logger，生产环境应该用 Winston + 结构化日志（JSON 格式），配合 ELK 或 Loki 做日志聚合和查询。

**5. 监控和告警：** 没有引入 APM（Application Performance Monitoring），生产环境应该加 Prometheus metrics（请求延迟、错误率、队列深度）+ Grafana 看板。

**追问：你提到的领域事件在 NestJS 中怎么实现？**

NestJS 内置了 `@nestjs/event-emitter` 包。定义事件类 `class ArticleLikedEvent { constructor(public articleId: string, public actorId: string) {} }`，在 ArticleService 中 `this.eventEmitter.emit('article.liked', new ArticleLikedEvent(...))`，在 NotificationService 中 `@OnEvent('article.liked') async handleArticleLiked(event: ArticleLikedEvent) { ... }`。事件发射器和监听器之间完全解耦，ArticleService 不需要 import NotificationService。如果要跨进程通信（微服务场景），可以把 EventEmitter 替换为消息队列（RabbitMQ、Kafka），业务代码完全不变。

---

### Q20：请解释一下你项目中 N+1 查询问题是怎么避免的？

**回答：**

N+1 查询是指查询 N 条记录时，每条记录的关联数据都触发一次额外查询，总共 N+1 次 SQL。DevPulse 在几个关键场景做了处理：

**文章列表页：** 使用 Prisma 的 `select` 嵌套查询，在一次 `findMany` 中同时查出文章 + 作者信息 + 标签列表。Prisma 底层会生成 JOIN 查询或者用 DataLoader 模式批量查询关联数据，避免 N+1。

**评论列表页：** 采用"两阶段查询"策略。第一阶段查出顶级评论（不含回复），收集所有 parentIds；第二阶段用 `findMany({ where: { parentId: { in: parentIds } } })` 批量查出所有回复，然后在内存中按 parentId 分组。这是两次查询，而不是"每个顶级评论查一次回复"的 N+1 模式。

**用户统计（文章数、点赞数等）：** 用一条 raw SQL 子查询完成所有统计，而不是分别调 `article.count()`、`like.count()` 等 4 次查询。

```sql
SELECT
  (SELECT COUNT(*) FROM articles WHERE author_id = $1 AND status = 'PUBLISHED') AS "articleCount",
  (SELECT COALESCE(SUM(like_count), 0) FROM articles WHERE author_id = $1) AS "totalLikes",
  (SELECT COUNT(*) FROM follows WHERE following_id = $1) AS "followerCount",
  (SELECT COUNT(*) FROM follows WHERE follower_id = $1) AS "followingCount"
```

**仍然有 N+1 风险的场景：** toggleLike 中先 `findUnique` 查 Like 记录，再 `transaction` 创建/删除，再 `findUnique` 查最新 likeCount。虽然只有 3 次查询（不是 N+1），但可以优化为一条 raw SQL 的 `INSERT ... ON CONFLICT DO DELETE` + `RETURNING`，减少往返次数。

**追问：Prisma 的 include/select 在底层是怎么避免 N+1 的？**

Prisma 对 `include` 使用 DataLoader 模式。比如 `findMany` 查 20 篇文章并 `include: { author: true }`，Prisma 会先执行 `SELECT * FROM articles ...`，收集所有 `authorId`，然后执行一次 `SELECT * FROM users WHERE id IN (...)`，最后在内存中将结果关联起来。这是 2 次查询而不是 21 次。对于 `select` 嵌套（如 `select: { author: { select: { name: true } } }`），Prisma 可能生成 JOIN 查询，一次 SQL 完成。具体生成 JOIN 还是 DataLoader 取决于查询复杂度和 Prisma 的优化器。

---

---

## 十、锁机制深度

### Q21：PostgreSQL 的行锁（Row Lock）和表锁（Table Lock）有什么区别？你项目中分别用在了哪里？

**回答：**

PostgreSQL 的锁分为多个层级，DevPulse 主要涉及行级锁和表级锁。

**行级锁（Row-level Lock）** 只锁定被操作的特定行，其他事务可以自由读写表中的其他行。行锁有两种模式：

- **共享锁（Shared Lock）**：通过 `SELECT ... FOR SHARE` 获取，多个事务可以同时持有同一行的共享锁，但任何事务都不能获取该行的排他锁。适合"读多写少"的场景——比如多个请求同时读取一篇文章的 like_count 用于展示，但不修改。
- **排他锁（Exclusive Lock）**：通过 `SELECT ... FOR UPDATE` 获取，同一时间只有一个事务能持有某行的排他锁。DevPulse 的标签 articleCount 更新就用了这种模式——当文章创建时关联标签，需要 `SELECT * FROM tags WHERE id = $1 FOR UPDATE` 锁住标签行，然后 `UPDATE tags SET article_count = article_count + 1`。如果两个请求同时给不同的文章添加同一个标签，第二个请求会阻塞在 `FOR UPDATE` 直到第一个事务提交释放锁。

**表级锁（Table-level Lock）** 锁定整个表，粒度大，并发性差。DevPulse 没有显式使用表锁，但 PostgreSQL 会在某些 DDL 操作（如 `ALTER TABLE`）和 `TRUNCATE` 时自动获取表级排他锁（AccessExclusiveLock）。`prisma migrate deploy` 执行迁移时可能触发表锁，这就是为什么生产环境的数据库迁移应该在低峰期执行。

**关键区别：** 行锁的获取和释放是在事务内部自动管理的——`SELECT FOR UPDATE` 获取锁，事务 `COMMIT` 或 `ROLLBACK` 时自动释放。不需要手动 unlock。但如果事务持续时间过长（比如在锁住行之后做了大量 JS 计算或外部 API 调用），锁会长时间持有，导致其他事务排队等待，严重时造成连接池耗尽。

**追问 1：什么是 Advisory Lock（咨询锁）？它和行锁有什么区别？**

Advisory Lock 是 PostgreSQL 特有的一种应用层锁，不锁定任何行或表，而是锁定一个由应用程序定义的"数字 key"。比如 `SELECT pg_advisory_lock(12345)` 会获取 key=12345 的排他锁，其他事务试图获取同一个 key 时会阻塞。

和行锁的核心区别是：行锁是数据驱动的（锁哪一行取决于 SQL），Advisory Lock 是应用驱动的（锁哪个 key 由代码决定）。Advisory Lock 适合"防止同一个用户同时发起两个耗时操作"这种场景——比如防止同一用户同时发布两篇文章导致 slug 冲突。DevPulse 没有用 Advisory Lock，但如果要实现"同一用户 10 秒内只能发布一篇文章"的限流，用 `pg_advisory_xact_lock(userId::integer)` 比 Redis 分布式锁更轻量（不需要额外基础设施）。

**追问 2：PostgreSQL 会不会产生死锁（Deadlock）？怎么避免？**

会。经典场景：事务 A 锁住行 1 然后尝试锁住行 2，事务 B 锁住行 2 然后尝试锁住行 1，形成循环等待。PostgreSQL 有内置的死锁检测机制（deadlock_timeout 默认 1 秒），检测到死锁后会主动终止其中一个事务（返回 `deadlock detected` 错误）。

避免死锁的常用策略：

1. **固定加锁顺序**：所有事务按相同的顺序访问资源。DevPulse 的标签更新中，如果一篇文章关联多个标签，可以按 tagId 排序后再依次 `FOR UPDATE`，确保所有事务以相同顺序加锁。
2. **缩短事务**：事务中只做数据库操作，不做耗时的 JS 计算或外部 API 调用，减少锁持有时间。
3. **降低隔离级别**：PostgreSQL 默认是 READ COMMITTED，大部分场景不会产生死锁。如果升级到 SERIALIZABLE，冲突概率增大。
4. **设置锁超时**：`SET lock_timeout = '5s'`，获取锁超过 5 秒自动放弃，避免长时间阻塞。

---

### Q22：Redis 分布式锁怎么实现？你的项目里有没有需要分布式锁的场景？

**回答：**

Redis 分布式锁的基本实现用 `SET key value NX EX`：

```bash
SET lock:article:publish:{userId} {requestId} NX EX 10
```

- `NX`（Not eXists）：只有 key 不存在时才设置成功，实现互斥
- `EX 10`：10 秒自动过期，防止进程崩溃导致锁永远不释放
- `value` 用唯一 requestId（UUID），释放锁时先验证 value 是否匹配再 DEL，防止释放别人的锁

释放锁需要原子操作（不能 GET + DEL 分开，否则有竞态），用 Lua 脚本：

```lua
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
else
  return 0
end
```

DevPulse 当前没有显式使用 Redis 分布式锁，但有几个场景**适合**引入：

1. **防重复提交**：用户快速双击"发布文章"按钮，两个请求同时到达。用 `SET lock:publish:{userId} NX EX 5` 确保同一用户 5 秒内只能发布一次。
2. **BullMQ 定时任务防重入**：ViewCountProcessor 每 60 秒触发一次，如果上一次还没执行完，下一次不应该并发执行。BullMQ 内部已经通过 `jobId: 'view-count-flush'` 做了去重（相同 jobId 不会重复添加），但如果是自定义的定时任务就需要手动加锁。
3. **管理员操作互斥**：两个管理员同时修改同一个角色的权限，可能产生不一致。用 `SET lock:role:permissions:{roleId} NX EX 10` 确保同一角色的权限修改是串行的。

**追问 1：Redis 分布式锁有什么缺陷？Redlock 算法解决什么问题？**

单节点 Redis 锁有两个缺陷：

**缺陷一：锁过期但业务未完成。** 如果设置 EX 10 秒，但业务逻辑执行了 15 秒，锁会在第 10 秒自动释放，其他进程获取到锁开始执行，导致两个进程同时操作同一资源。解决方案是 Redisson 的"看门狗"机制——后台线程定期续期（每 10/3 秒续一次），直到业务完成主动释放。

**缺陷二：Redis 主从切换丢锁。** 如果 Redis 是主从架构，客户端在主节点设置了锁，但主节点还没同步到从节点就宕机了，从节点被提升为主节点后锁不存在，另一个客户端可以在新主节点获取同一把锁。Redlock 算法通过"在 N 个独立 Redis 节点上加锁，超过 N/2 + 1 个成功才算获取成功"来解决这个问题。但 Redlock 在实践中争议很大（Martin Kleppmann 和 Redis 作者 antirez 有过著名论战），大部分生产环境选择用 ZooKeeper 或 etcd 做分布式锁而不是 Redis。

**追问 2：如果面试官问"DevPulse 为什么没用分布式锁"，怎么回答？**

DevPulse 是单实例部署（一个 Node.js 进程），并发控制依赖 PostgreSQL 的行锁和唯一约束已经足够。分布式锁是多实例场景的需求——当多个 Node.js 进程同时运行时，进程内的锁（如 Mutex）无法跨进程互斥，才需要 Redis 或 ZooKeeper 做分布式锁。在单实例下引入分布式锁是不必要的复杂度。如果项目扩展到多实例，我会在防重复提交和定时任务防重入两个场景引入 Redis 分布式锁。

---

### Q23：PostgreSQL 的事务隔离级别有哪些？你的项目用的是哪个？不同隔离级别对并发有什么影响？

**回答：**

SQL 标准定义了四种隔离级别，从低到高：

**1. Read Uncommitted（读未提交）**：可以读到其他事务尚未提交的数据（脏读）。PostgreSQL 不支持此级别——即使声明为 Read Uncommitted，实际行为等同于 Read Committed。

**2. Read Committed（读已提交）— PostgreSQL 默认级别**：每个语句只能看到已提交的数据。同一个事务内的两条 SELECT 可能看到不同的结果（不可重复读）——因为中间有其他事务提交了对同一行的修改。DevPulse 用的就是这个级别。大部分 Web 应用在这个级别下表现良好，配合行锁和唯一约束足以保证数据一致性。

**3. Repeatable Read（可重复读）**：事务开始时获取一个快照，事务内所有 SELECT 看到的数据都基于这个快照，不受其他事务提交的修改影响。解决了不可重复读，但可能遇到"幻读"——其他事务 INSERT 了新行，当前事务的 `COUNT(*)` 在两次查询间不同。PostgreSQL 的 Repeatable Read 实际上通过 MVCC（多版本并发控制）连幻读也解决了，比 SQL 标准定义的更强。代价是如果两个事务同时修改同一行，后提交的事务会收到 `serialization failure` 错误必须重试。

**4. Serializable（可串行化）**：最强的隔离级别，效果等同于所有事务串行执行。PostgreSQL 通过 SSI（Serializable Snapshot Isolation）实现，不需要真的串行执行，而是检测"危险结构"（rw-antidependency 环），检测到就终止事务。性能代价最大——长事务和热点行会导致大量事务被终止重试。

**DevPulse 选择 Read Committed 的理由：** 社区平台的并发模式是"大量读、少量写"，读写比例大约 10:1。Read Committed 下读操作完全不阻塞（MVCC 快照读），写操作通过行锁保证一致性。对于需要强一致性的场景（如点赞计数），用 `SELECT FOR UPDATE` 显式加行锁；对于并发冲突（如 slug 唯一），用数据库唯一约束兜底。升级到 Repeatable Read 的收益不大（几乎没有"同一事务内需要两次读取同一行得到相同结果"的场景），但增加了事务冲突重试的复杂度。

**追问：MVCC 是什么？PostgreSQL 怎么实现的？**

MVCC（Multi-Version Concurrency Control）是 PostgreSQL 的核心并发机制。每一行数据有多个版本——当一行被 UPDATE 时，旧版本不会立即删除，而是标记为过期，新版本被创建。每个事务根据启动时间获取一个快照（Snapshot），只能看到快照时间点之前已提交的版本。

具体实现用三个隐藏字段：`xmin`（创建该版本的事务 ID）、`xmax`（删除/修改该版本的事务 ID）、`cmin/cmax`（命令序号）。事务判断一行是否"可见"的规则是：`xmin` 的事务已提交，且 `xmax` 为空或 `xmax` 的事务未提交。

MVCC 的好处是读写不冲突——读操作读旧版本，写操作创建新版本，不需要加锁。代价是过期版本需要 `VACUUM` 清理，否则表会膨胀（dead tuples 占用磁盘空间）。DevPulse 的 PostgreSQL 容器默认开启了 autovacuum，自动清理过期版本。

---

## 十一、Node.js 进程模型与子进程

### Q24：Node.js 是单线程的，那你的 NestJS 后端怎么处理并发请求？

**回答：**

Node.js 的"单线程"指的是 **JavaScript 执行是单线程的**——同一时刻只有一个 JS 函数在执行。但 Node.js 的 **I/O 操作是异步非阻塞的**，底层由 libuv 的事件循环（Event Loop）驱动。

当 NestJS 收到一个 HTTP 请求时，处理流程大致是：

1. Express 适配器接收 TCP 连接（底层 C++ 线程池处理）
2. 请求数据解析后进入 JS 主线程的事件队列
3. Controller → Service → Prisma 查询，遇到 `await` 时 JS 主线程释放，去处理其他事件
4. Prisma 底层通过 `@prisma/adapter-pg`（pg 驱动）发起 TCP 请求到 PostgreSQL，这是非阻塞的
5. PostgreSQL 返回结果后，libuv 的回调将结果传回 JS 主线程，继续执行 `await` 后面的代码

所以虽然 JS 是单线程，但通过事件循环，一个 Node.js 进程可以同时处理**数千个并发连接**——只要大部分时间是 I/O 等待（数据库查询、Redis 查询、HTTP 请求），而不是 CPU 密集计算。DevPulse 的典型请求链路是"接收请求 → 校验 → 查数据库 → 返回结果"，90% 以上的时间在等 I/O，单线程完全够用。

**什么时候单线程会成为瓶颈？** CPU 密集型操作——比如 Sharp 图片处理、bcrypt 哈希计算、大 JSON 序列化。这些操作会阻塞事件循环，导致其他请求被延迟。DevPulse 中的 bcrypt hash（cost=12）每次约 200-300ms，这期间事件循环被阻塞，其他请求的回调无法执行。

**追问 1：bcrypt 阻塞事件循环怎么办？有什么优化方案？**

`bcrypt` npm 包实际上是用 C++ 的 `node-addon-api` 实现的，`hash` 和 `compare` 方法是异步的——它们在 libuv 的线程池（默认 4 个线程）中执行，不会阻塞 JS 事件循环。所以 DevPulse 的 `await bcrypt.hash(password, 12)` 实际上是在后台线程中完成的。

但如果并发登录请求非常多（比如 100 个同时登录），libuv 线程池的 4 个线程都会被 bcrypt 占满，其他需要线程池的操作（如 DNS 解析、文件系统操作）会被延迟。优化方案：

1. 增大线程池：`UV_THREADPOOL_SIZE=16`（通过环境变量），让 libuv 开更多后台线程
2. 用 `bcryptjs`（纯 JS 实现）替代 `bcrypt`——但性能更差，不推荐
3. 用 Worker Threads 把 bcrypt 移到独立线程
4. 降低 cost factor 到 10——安全性换性能，不推荐

**追问 2：Node.js 的事件循环有几个阶段？Timers 和 I/O 回调分别在哪个阶段执行？**

事件循环有 6 个阶段，按顺序循环执行：

1. **timers**：执行 `setTimeout` / `setInterval` 的回调
2. **pending callbacks**：执行延迟到下一个循环的 I/O 回调
3. **idle, prepare**：内部使用
4. **poll**：检索新的 I/O 事件，执行 I/O 回调（网络请求完成、文件读取完成等）
5. **check**：执行 `setImmediate` 的回调
6. **close callbacks**：执行 socket 关闭回调（如 `socket.on('close')`）

每个阶段都有一个 FIFO 队列，事件循环进入某阶段时执行该阶段的所有回调，执行完毕或队列清空后进入下一阶段。`process.nextTick()` 不在任何阶段——它在当前操作完成后、进入下一阶段之前立即执行，优先级最高。`Promise.then()` 的微任务（microtask）在每个回调执行完毕后立即执行，优先级高于 `nextTick` 的下一阶段。

---

### Q25：Node.js 的 Cluster 模块和 Worker Threads 有什么区别？你的项目应该怎么利用多核 CPU？

**回答：**

Node.js 提供了两种并行机制：

**Cluster 模块**（`node:cluster`）：基于多进程模型。主进程（Master）fork 出多个工作进程（Worker），每个 Worker 是独立的 V8 实例，有自己的内存空间、事件循环和 GC。Worker 之间不能共享内存，通信通过 IPC（进程间消息传递）。Cluster 的核心能力是**端口共享**——多个 Worker 可以监听同一个端口（底层用 SO_REUSEPORT 或 Master 轮询分发连接），实现负载均衡。

**Worker Threads**（`node:worker_threads`）：基于多线程模型。多个线程运行在同一个进程内，共享内存（通过 `SharedArrayBuffer` 或 `MessageChannel` 通信）。线程创建开销比进程小得多，内存占用也低。但 Node.js 的线程共享有一些限制——V8 的垃圾回收仍然是每个线程独立的，`SharedArrayBuffer` 需要特殊的 HTTP 头（`Cross-Origin-Opener-Policy` + `Cross-Origin-Embedder-Policy`）才能在浏览器中使用。

**对 DevPulse 的建议：**

生产环境推荐 **PM2 Cluster 模式**而不是手动用 Cluster 模块：

```bash
pm2 start dist/main.js -i max  # fork 出 CPU 核心数个 Worker
```

PM2 自动管理 Worker 的生命周期（崩溃自动重启、日志收集、零停机重启 `pm2 reload`）。假设服务器有 4 核 CPU，PM2 会 fork 4 个 NestJS 进程，每个进程独立处理请求，操作系统级别的负载均衡器（或 Nginx upstream）将请求分发到 4 个进程。

Worker Threads 适合的场景是 CPU 密集型计算——比如 DevPulse 中如果要实现图片水印叠加（Sharp 处理大量图片）、文章全文搜索索引构建（批量计算 tsvector），可以开 Worker Thread 在后台执行，不阻塞主线程的事件循环。但 DevPulse 当前的 CPU 密集操作（bcrypt、Sharp）已经在 libuv 线程池中异步执行，Worker Threads 的收益有限。

**追问 1：PM2 Cluster 模式下，PermissionService 的缓存会怎样？**

DevPulse 已经用 Redis 集中缓存解决了这个问题。PermissionService 的权限缓存存储在 Redis（`perm:{userId}`），所有 Worker 进程共享同一份缓存。管理员修改权限后调用 `invalidateCache()` 会删除 Redis 中所有 `perm:*` 键（通过 `perm:_users` SET 追踪被缓存的用户），所有 Worker 下次请求时自动从数据库重新加载。相比之前的进程内 Map 缓存（4 个 Worker 就有 4 份副本，`invalidateCache()` 只能清自己的），Redis 方案不存在缓存不一致的窗口。

同理，多设备会话管理（`rt:{userId}:{deviceId}`）也天然支持 Cluster 模式——用户在 Worker A 上登录，refresh token 写入 Redis，在 Worker B 上刷新 token 也能从 Redis 读到。

**追问 2：多进程模式下，BullMQ Worker 会不会重复消费任务？**

不会。BullMQ 的 Worker 消费是基于 Redis 的原子操作（BRPOPLPUSH + Lua 脚本）——一个任务被一个 Worker 取出后，会从 waiting 队列移到 active 集合，其他 Worker 不会再取到这个任务。即使有 4 个 NestJS 进程各自运行一个 NotificationProcessor，BullMQ 保证每个任务只被一个进程消费。这是 BullMQ 相比简单 Redis List 的核心优势——它内置了分布式安全的任务消费语义。

---

### Q26：Node.js 的子进程（child_process）有哪些使用场景？你的项目中有没有涉及？

**回答：**

Node.js 的 `node:child_process` 模块提供四种创建子进程的方式：

1. **`spawn`**：启动一个子进程执行外部命令，返回 Stream（stdout/stderr），适合长时间运行的命令（如 `tail -f` 日志监控）。
2. **`exec`**：启动子进程执行命令，缓冲输出后一次性回调返回，适合简单的一次性命令（如 `git status`）。有命令注入风险（shell 解析）。
3. **`execFile`**：类似 `exec` 但不经过 shell，直接执行可执行文件，更安全。
4. **`fork`**：spawn 的特化版，专门启动另一个 Node.js 进程，自动建立 IPC 通信通道（`process.send()` / `process.on('message')`），是 Cluster 模块的底层实现。

DevPulse 项目本身没有直接使用 child_process，但有几个场景可以引入：

1. **数据库备份脚本**：`exec('pg_dump -U devpulse devpulse > backup.sql')` 可以在 NestJS 的定时任务中触发数据库备份。
2. **PDF 生成**：如果未来要实现"导出文章为 PDF"功能，可以用 `spawn('puppeteer', ...)` 或者 `spawn('wkhtmltopdf', ...)` 在子进程中渲染 HTML 为 PDF，避免阻塞主线程。
3. **Shell 脚本执行**：管理后台如果允许管理员执行运维脚本（如清理临时文件），可以用 `execFile` 安全调用。

**追问：如果要在 NestJS 中实现"用户上传 CSV，后台异步解析并导入数据库"，怎么设计？**

整体设计分三层：

1. **上传层**：Controller 用 Multer 接收 CSV 文件，保存到 `uploads/` 目录，返回 jobId。
2. **异步处理层**：通过 BullMQ 投递一个 CSV 解析任务。Worker 进程中用 `worker_threads` 或 `child_process.fork` 启动独立的解析进程——CSV 解析（尤其是大文件）是 CPU 密集型操作（逐行读取 + 字段分割 + 类型转换），会阻塞事件循环。
3. **导入层**：解析完成后，用 Prisma 的 `createMany`（批量插入，单次最多 1000 条）或 `COPY` raw SQL（PostgreSQL 最高效的批量导入方式）批量写入数据库。

用 BullMQ 而非直接处理的好处：上传请求立即返回，解析在后台异步进行；解析失败自动重试（`attempts: 3`）；可以通过 BullMQ Dashboard 查看任务进度。

---

## 十二、高并发架构

### Q27：如果 DevPulse 的用户量从 1000 增长到 100 万，你的后端架构需要怎么演进？

**回答：**

从 1000 到 100 万用户，大概需要经历三个阶段：

**阶段一（1K-10K 用户）：单实例优化**

当前 DevPulse 的架构——单 Node.js 进程 + 单 PostgreSQL + 单 Redis——足以支撑。优化方向：
- 数据库：添加适当的索引（articles 表的 `(status, published_at)` 已有索引，tags 表的 `name` 有唯一索引）、开启连接池（pg 的 `max: 20` 连接）
- Redis：开启 AOF 持久化、配置 maxmemory + LRU 淘汰策略
- 应用层：确保所有热点路径（文章列表、文章详情）没有 N+1 查询

**阶段二（10K-100K 用户）：水平扩展 + 缓存层**

- **多实例部署**：PM2 Cluster 模式 fork 4 个 Worker（单机多核），或者 Docker Swarm/K8s 部署多个 API 容器
- **数据库连接池**：引入 PgBouncer 做连接池代理。Node.js 每个进程的 Prisma 连接池默认 10 个连接，4 个 Worker 就是 40 个 PostgreSQL 连接。PgBouncer 在应用和数据库之间做连接复用，将实际 PG 连接数控制在 20-30 个
- **Redis 缓存层**：在文章列表、用户资料等高频读接口前加 Redis 缓存。比如文章列表页缓存 60 秒（`GET cache:articles:page:1`），写操作时主动失效
- **读写分离**：PostgreSQL 主从复制，写操作走主库，读操作走从库。Prisma 暂时不原生支持读写分离，可以用 pg 驱动直接管理两个连接池
- **CDN**：静态资源（图片、CSS、JS）上 CDN，减轻 API 服务器带宽压力

**阶段三（100K-1M 用户）：微服务 + 分库分表**

- **服务拆分**：将 DevPulse 从单体拆为独立服务——Auth Service、Article Service、Notification Service、Search Service。每个服务有自己的数据库实例（Database per Service 模式），通过消息队列（RabbitMQ/Kafka）异步通信
- **分库分表**：文章表和通知表数据量大，按用户 ID 分片（sharding）。比如 `article_0` 到 `article_7` 八张表，根据 `authorId % 8` 路由到不同表
- **搜索引擎**：PostgreSQL 的全文搜索在百万级数据下性能下降，引入 Elasticsearch 做专业搜索服务
- **消息队列升级**：BullMQ 换成 Kafka——Kafka 支持消息持久化、消费者组、回溯消费，适合大规模事件流处理

**追问：PgBouncer 的 Transaction 模式和 Session 模式有什么区别？Prisma 兼容哪种？**

- **Session 模式**：每个客户端连接对应一个固定的 PG 连接，直到客户端断开。和直连 PG 行为一致，支持所有 PostgreSQL 特性（如 `LISTEN/NOTIFY`、临时表、`SET` 会话变量）。但连接复用率低——如果客户端保持连接但不活跃，PG 连接也被占用。
- **Transaction 模式**（推荐）：客户端连接只在执行事务时分配 PG 连接，事务结束后 PG 连接被回收给其他客户端。连接复用率高——100 个客户端连接可能只需要 20 个 PG 连接。限制是不支持 `SET` 会话变量、临时表、`LISTEN/NOTIFY`（因为下次可能分配到不同的 PG 连接）。

Prisma 兼容 Transaction 模式，因为 Prisma 不依赖会话级别的 PG 特性。DevPulse 的所有数据库操作要么是单条 SQL（`findMany`、`update`），要么是显式事务（`$transaction`），都不依赖会话持久性。但注意 Prisma 的 Interactive Transaction（`$transaction(async (tx) => {...})`）在 PgBouncer Transaction 模式下可能有问题——事务中的多条 SQL 可能分配到不同的 PG 连接。解决方案是用 PgBouncer 的 `max_prepared_statements` 配合 `prepared_statements = true`，或者对交互式事务使用直连 PG 的独立连接池。

---

### Q28：你的项目怎么做限流（Rate Limiting）？ThrottlerModule 的原理是什么？

**回答：**

DevPulse 使用 NestJS 官方的 `@nestjs/throttler` 做限流：

```typescript
ThrottlerModule.forRoot([{ ttl: 60_000, limit: 60 }])
```

全局配置为每分钟 60 次请求。ThrottlerModule 底层用"固定窗口"（Fixed Window）算法：以客户端 IP 为 key，每分钟为一个窗口，窗口内请求计数，超过 60 次返回 429 Too Many Requests。

ThrottlerModule 默认使用内存存储（Map），适合单实例。多实例下需要换成 Redis 存储——`@nestjs/throttler` 支持注入 `ThrottlerStorageRedisService`，用 Redis 的 `INCR` + `EXPIRE` 实现跨实例计数。

可以在 Controller 或方法级别覆盖全局配置：

```typescript
@Throttle({ default: { limit: 10, ttl: 60000 } })  // 认证接口：每分钟 10 次
@Controller('auth')
export class AuthController { ... }
```

**追问 1：固定窗口限流有什么缺陷？滑动窗口和令牌桶算法有什么区别？**

**固定窗口**的问题在于窗口边界突发——如果限流 60 次/分钟，用户在第 59 秒发了 60 次请求，第 60 秒（下一个窗口的第 0 秒）又可以发 60 次，实际上 2 秒内处理了 120 次请求，瞬时并发是预期的 2 倍。

**滑动窗口**（Sliding Window）解决了边界问题——不是按固定分钟划分，而是按"过去 60 秒"计算。实现方式是用 Redis Sorted Set，每次请求以时间戳为 score 添加成员，然后 `ZREMRANGEBYSCORE` 删除 60 秒前的记录，`ZCARD` 统计窗口内请求数。精度更高但 Redis 操作更多。

**令牌桶**（Token Bucket）是最灵活的限流算法——桶以固定速率生成令牌（比如每秒 1 个），每次请求消耗一个令牌，桶满时多余的令牌丢弃。允许突发（桶里积攒的令牌可以一次性消耗），同时控制平均速率。适合 API 网关（如 Nginx 的 `limit_req` 就是令牌桶）。

DevPulse 用固定窗口足够——社区平台的流量模式相对平稳，不需要处理极端的边界突发。如果上 API 网关（如 Kong、APISIX），网关层通常自带令牌桶限流，应用层的 ThrottlerModule 作为第二道防线。

**追问 2：限流应该按 IP 还是按用户？**

两者都需要，在不同层级：

- **按 IP 限流**（外层防护）：防止未登录的攻击者暴力扫描接口。ThrottlerModule 默认按 IP，不需要认证就能生效。
- **按用户限流**（内层防护）：防止已登录用户滥用特定功能（如疯狂点赞、频繁发帖）。需要自定义 `ThrottlerModule` 的 `generateKey` 方法，把 `userId` 纳入 key。

DevPulse 当前只做了 IP 限流。生产环境建议两层叠加：IP 限流防暴力攻击（60 次/分钟），用户限流防滥用（发帖 5 次/小时、评论 30 次/小时）。

---

### Q29：数据库连接池怎么工作？连接池满了会怎样？

**回答：**

DevPulse 使用 `pg`（node-postgres）驱动连接 PostgreSQL，连接池通过 `@prisma/adapter-pg` 间接管理。pg 的 `Pool` 默认配置是 `max: 10` 个连接。

连接池的工作流程：

1. 应用调用 `prisma.article.findMany(...)` 时，Prisma 向 pg Pool 请求一个空闲连接
2. Pool 返回一个空闲连接（或创建新连接，如果当前连接数 < max）
3. Prisma 用该连接发送 SQL 到 PostgreSQL
4. 收到结果后，连接归还给 Pool，等待下一次使用

**连接池满了会怎样？** 如果 10 个连接都在使用中，第 11 个请求会进入等待队列。pg Pool 的默认等待超时是无限等待（`connectionTimeoutMillis: 0`），这意味着请求会一直挂起直到有连接释放。如果高并发下连接长时间不释放（比如慢查询或长事务），等待队列会不断增长，最终导致大量请求超时。

**优化策略：**

1. **设置连接超时**：`connectionTimeoutMillis: 5000`（5 秒获取不到连接就报错），避免请求无限等待
2. **设置空闲超时**：`idleTimeoutMillis: 30000`（空闲 30 秒的连接自动关闭），减少数据库的资源占用
3. **设置语句超时**：`statement_timeout: 10000`（单条 SQL 超过 10 秒自动终止），防止慢查询占住连接
4. **调整连接数**：根据 CPU 核数调整。PostgreSQL 官方建议 `max_connections = CPU核数 * 4`（对于 SSD），4 核服务器建议 16 个连接。Node.js 的 Pool max 设置应该小于 `max_connections / 应用实例数`

**追问：为什么 PostgreSQL 的连接数不能设太大？每个连接的内存开销是多少？**

PostgreSQL 为每个连接分配独立的进程（不是线程），每个连接的基础内存开销约 5-10MB（共享缓冲区之外的私有内存）。100 个连接就是 500MB-1GB 的额外内存占用。更重要的是，连接数过多会导致 PostgreSQL 的进程调度开销增大——PostgreSQL 需要在所有活跃连接之间切换 CPU 时间片，上下文切换本身就是性能损耗。

经验公式：**connections = (core_count * 2) + effective_spindle_count**（对于 SSD，effective_spindle_count = 1）。4 核 SSD 服务器建议 9-16 个连接。超过这个数量，增加连接数反而降低吞吐量。这就是 PgBouncer 存在的意义——应用层可以有 100+ 个客户端连接，PgBouncer 复用后只用 10-20 个 PG 连接。

---

### Q30：你的项目怎么防止缓存穿透、缓存击穿、缓存雪崩？

**回答：**

这三个经典问题在 DevPulse 中虽然规模不大，但设计时已经考虑了防御：

**缓存穿透（Cache Penetration）：** 查询一个不存在的数据，缓存没有命中，每次都穿透到数据库。比如请求 `GET /articles/slug=xxx-不存在`，每次都查数据库返回 404。

防御方案：**缓存空值**。查询结果为空时，也在 Redis 中写入一个标记（如 `SET cache:article:slug:xxx NULL EX 300`），5 分钟内再次请求直接返回 404 而不查数据库。DevPulse 当前没有实现这个优化，因为社区平台的文章 slug 被搜索引擎爬虫随机扫描的概率较低。但如果暴露在外网，建议实现。

更高级的方案是**布隆过滤器**（Bloom Filter）——在 Redis 中维护一个所有 slug 的布隆过滤器，请求到来时先检查 slug 是否可能存在，不存在直接返回 404。布隆过滤器的优势是内存占用极低（1 亿个 slug 只需要约 120MB），且零误判率（可能有 false positive 但不会有 false negative）。

**缓存击穿（Cache Breakdown）：** 一个热点数据的缓存刚好过期，大量并发请求同时穿透到数据库。比如首页文章列表缓存过期，1000 个请求同时查数据库。

防御方案：**互斥锁（Mutex Lock）**。第一个请求发现缓存 miss 后获取锁，去数据库查询并回写缓存；其他请求等待锁释放后从缓存读取。用 Redis 分布式锁实现：

```typescript
async function getWithCache(key, fetchFn, ttl) {
  const cached = await redis.get(key);
  if (cached) return JSON.parse(cached);
  
  // 获取互斥锁
  const lockKey = `lock:${key}`;
  const acquired = await redis.set(lockKey, '1', 'NX', 'EX', 10);
  if (!acquired) {
    // 等待 50ms 后重试（简单方案，生产环境用 Pub/Sub 通知）
    await sleep(50);
    return getWithCache(key, fetchFn, ttl);
  }
  
  try {
    const data = await fetchFn();
    await redis.set(key, JSON.stringify(data), 'EX', ttl);
    return data;
  } finally {
    await redis.del(lockKey);
  }
}
```

另一个方案是**逻辑过期**——不在 Redis 中设置 EXPIRE，而是在 value 中嵌入过期时间戳。发现过期时返回旧数据并异步更新缓存，保证用户永远不用等待。适合对实时性要求不高的场景（如首页推荐列表延迟几分钟更新完全可以接受）。

**缓存雪崩（Cache Avalanche）：** 大量缓存同时过期，导致数据库瞬间压力剧增。比如所有文章的缓存都是同一时刻设置的 60 分钟 TTL，60 分钟后同时过期。

防御方案：**随机 TTL**。给缓存过期时间加一个随机偏移量：`EX (3600 + random(0, 600))`，让缓存分散在 60-70 分钟内陆续过期，避免集中失效。DevPulse 的权限缓存（60 秒 TTL）也有这个问题——如果所有用户的权限在同一时刻被缓存，60 秒后同时过期，瞬间产生大量 DB 查询。解决方案是把 TTL 改为 `60 + random(0, 10)` 秒。

**追问：如果 Redis 完全宕机了，你的系统会怎样？怎么做降级？**

当前 DevPulse 的 Redis 承载了四个功能：多设备会话管理、阅读量缓冲、权限缓存、BullMQ 队列。

- **会话管理不可用**：所有 token 刷新请求失败，15 分钟后用户的 accessToken 过期被踢出登录；`GET /auth/sessions` 也无法查询设备列表。降级方案：fallback 到数据库存储 refreshToken（预先建一张 `refresh_tokens` 表），AuthService 先尝试 Redis，失败后写数据库。
- **阅读量缓冲不可用**：`INCR` 操作失败，文章阅读量不更新。降级方案：catch Redis 异常后直接写数据库 `UPDATE articles SET view_count = view_count + 1`（回退到直接写模式，性能降低但功能不中断）。
- **权限缓存不可用**：每次权限检查都直接查数据库，响应变慢但功能不中断。降级方案：fallback 到进程内 Map 缓存（牺牲多实例一致性换取单机性能）。
- **BullMQ 不可用**：通知任务投递失败。降级方案：dispatch 方法 catch 异常后直接同步创建通知记录（`prisma.notification.create`），从异步退化为同步，API 响应变慢但功能不中断。

核心原则：**Redis 是性能增强层而非功能必要层**。系统应该能在 Redis 不可用时降级运行（性能下降但功能正常），而不是直接崩溃。这需要在每个 Redis 调用处加 try-catch 和 fallback 逻辑。

---

## 十三、数据库表设计

### Q31：请介绍一下你项目的数据库表设计，13 张表是怎么划分和关联的？

**回答：**

DevPulse 的 PostgreSQL 数据库包含 13 张表 + 2 个枚举类型，按业务域分为五个模块：

**用户与认证模块（4 张表）：** `users` 是核心用户表（邮箱/用户名/密码哈希/头像/简介/封禁状态），`roles` 存储角色记录（ADMIN/AUTHOR/READER + 自定义角色），`user_roles` 是多对多关联表（用户↔角色），`permissions` + `role_permissions` 构成 RBAC 权限系统（权限由 resource:action 组成，角色通过关联表动态分配权限）。

**内容模块（3 张表）：** `articles` 是文章表（标题/slug/内容/状态/各种计数/乐观锁 version/搜索向量），`tags` 是标签表（名称/slug/颜色/文章计数），`_ArticleToTag` 是 Prisma 自动维护的多对多隐式关联表（文章↔标签）。

**互动模块（4 张表）：** `comments` 支持两级嵌套（parentId 自引用），`likes` 和 `comment_likes` 分别存储文章点赞和评论点赞（都是 userId + targetId 唯一约束），`bookmarks` 存储收藏。

**关联模块（2 张表）：** `follows` 存储用户关注关系（followerId + followingId 唯一约束 + 双向索引），`notifications` 存储 6 种类型的通知（接收者/触发者/关联资源/已读状态）。

ER 关系的核心设计原则是：**所有关联关系都用显式的关联表而非 JSON 数组或逗号分隔字符串。** 比如文章和标签的多对多关系，如果用 JSON 数组存 `tagIds: [1,2,3]`，查询"标签 X 下有哪些文章"就需要 JSON 操作符，无法利用索引。用 `_ArticleToTag` 关联表后，正反方向的 JOIN 查询都能走 B-tree 索引。

**追问 1：为什么不把 `role` 字段直接放在 users 表里（像早期的 enum 设计）？**

三个原因。第一，单字段只能存一个角色，无法同时赋予用户 ADMIN + AUTHOR 双重身份。第二，角色与权限的映射关系无法用单字段表达——需要额外硬编码"AUTHOR 能做 X、READER 能做 Y"的逻辑。第三，enum 类型不可扩展，新增角色要跑 migration 改数据库 schema。改为 roles + user_roles 两张表后，角色可以运行时动态创建，用户可以拥有多角色，权限分配通过 role_permissions 表灵活配置，所有变更不需要改代码和跑迁移。

**追问 2：notification 表为什么不拆分为 6 张子表（每种通知类型一张）？**

6 种通知（ARTICLE_LIKED、COMMENT_RECEIVED、COMMENT_REPLIED、COMMENT_LIKED、USER_FOLLOWED、ARTICLE_PUBLISHED）的字段结构几乎相同——都是 recipientId + actorId + 可选的 articleId/commentId + content + isRead。如果拆成 6 张表，查询"所有通知"时需要 UNION 6 次，分页和排序极其复杂。用单表 + `type` 枚举字段，一条 `SELECT ... ORDER BY createdAt DESC` 就能查出所有类型的通知。`type` 字段在应用层做分支渲染（前端 switch-case 显示不同图标和文案），这是典型的"宽表 + 类型字段"模式，适合字段结构高度相似的场景。

---

### Q32：你的项目中有多处冗余计数字段（articleCount、likeCount、viewCount 等），怎么保证计数和数据的一致性？

**回答：**

DevPulse 在多个表中使用了冗余计数字段（而非每次 COUNT 查询）来提升读性能：

| 字段 | 所在表 | 更新方式 | 一致性保障 |
|------|--------|---------|-----------|
| `like_count` | articles | 原子 SQL `SET like_count = like_count ± 1` | 事务包裹，与 Like 记录的 create/delete 原子执行 |
| `comment_count` | articles | 原子 SQL `SET comment_count = comment_count ± 1` | 事务包裹，与 Comment 记录的 create/delete 原子执行 |
| `view_count` | articles | Redis 缓冲 + 定时刷写 `SET view_count = view_count + buffer` | 最终一致（延迟最多 60 秒），可接受 |
| `article_count` | tags | 悲观锁 `SELECT FOR UPDATE` + 原子递增 | 事务内先锁行再更新，避免并发计数错误 |

**一致性策略分三种：**

**强一致（点赞/评论计数）：** 在同一个事务中同时操作关联记录和计数。比如点赞 toggle 中，`Like.create()` 和 `UPDATE articles SET like_count = like_count + 1` 包在 `prisma.$transaction` 中，要么都成功要么都回滚。如果事务失败（如唯一约束冲突），计数也不会被错误递增。

**最终一致（阅读量）：** view_count 的更新走 Redis 缓冲 + BullMQ 定时刷写，延迟最多 60 秒。这是典型的性能优先设计——阅读量的精确度不如点赞重要，用户看到"阅读 1.2k"而不是"阅读 1234"完全不影响体验。如果 Redis 宕机丢失缓冲数据，最坏情况是少计几次阅读，不影响其他功能。

**悲观锁一致（标签计数）：** 多篇文章可能同时关联同一个标签，如果都用"读-改-写"模式会有竞态条件。通过 `SELECT * FROM tags WHERE id = $1 FOR UPDATE` 加行锁，确保同一标签的 article_count 更新是串行的。

**追问：如果计数和实际数据不一致了怎么办？怎么修复？**

写一个"计数校准"脚本，遍历所有记录，用 `COUNT(*)` 查出真实值后 UPDATE 回冗余字段。DevPulse 的种子数据（seed.ts）中就有这个逻辑——创建完所有文章和标签关联后，遍历每个标签用 `UPDATE tags SET article_count = (SELECT COUNT(*) FROM "_ArticleToTag" WHERE "B" = tag.id)` 校准计数。生产环境中可以把校准脚本放到定时任务（如每天凌晨 3 点执行一次），或者在管理后台提供一个"校准计数"按钮。冗余计数是"读优化"的代价，定期校准是必要的维护成本。

---

### Q33：你的数据库索引策略是怎么设计的？为什么这些字段需要索引？

**回答：**

DevPulse 的索引策略遵循一个原则：**为 WHERE、ORDER BY、JOIN 频繁使用的字段建索引，不为低选择性的字段建索引。** 具体的索引设计：

**唯一索引（业务约束 + 查询加速双重作用）：**

- `users.email` 和 `users.username`：注册时需要 `findUnique` 检查是否重复，登录时按 email 查询用户。唯一索引同时保证了业务约束（数据库层面防止重复注册）和查询性能（O(log N) B-tree 查找）。
- `articles.slug`：文章详情页按 slug 查询（`WHERE slug = $1`），同时 slug 必须唯一（两篇文章不能共享同一个 URL）。
- `tags.name` 和 `tags.slug`：标签名和 URL 标识唯一。
- `likes(userId, articleId)` / `bookmarks(userId, articleId)` / `follows(followerId, followingId)` / `comment_likes(userId, commentId)`：复合唯一约束防止重复操作（用户不能点赞同一篇文章两次），同时复合索引的左前缀自动支持按 userId 查询。

**普通索引（查询加速）：**

- `articles(status, publishedAt DESC)`：文章列表页的核心查询——`WHERE status = 'PUBLISHED' ORDER BY publishedAt DESC`。复合索引让 PostgreSQL 可以直接走索引排序，不需要 filesort。
- `articles(authorId)`：用户主页查"某用户的所有文章"。
- `comments(articleId, parentId)`：文章详情页查"某文章的评论"，按 parentId 过滤顶级评论或子评论。
- `follows(followerId)` 和 `follows(followingId)`：分别支持"我关注了谁"和"谁关注了我"两个方向的查询。
- `notifications(recipientId, isRead, createdAt DESC)`：通知列表页的核心查询——`WHERE recipientId = $1 ORDER BY createdAt DESC`，`isRead` 用于筛选未读通知。

**没有建索引但可能需要的场景：**

- `articles.search_vector`（tsvector 全文搜索）：PostgreSQL 的 tsvector 类型需要 GIN 索引才能高效搜索，但 Prisma 不支持声明 GIN 索引。当前用 raw SQL 的 `plainto_tsquery` 做全表扫描，数据量小时可接受，数据量大后需要手动添加 `CREATE INDEX idx_articles_search ON articles USING GIN (search_vector)`。
- `notifications.isRead` 单独不建索引，因为选择性太低（大部分通知是未读的），配合 `recipientId` 的复合索引才有意义。

**追问 1：复合索引的字段顺序为什么很重要？**

复合索引遵循**最左前缀原则**。`(A, B, C)` 的索引可以加速 `WHERE A = ?`、`WHERE A = ? AND B = ?`、`WHERE A = ? AND B = ? AND C = ?`，但不能加速 `WHERE B = ?` 或 `WHERE C = ?`。所以 DevPulse 的 `articles(status, publishedAt DESC)` 把选择性低的 `status`（只有 3 个值）放在前面，因为几乎所有查询都会带 `status = 'PUBLISHED'` 过滤。如果把 `publishedAt` 放前面，查询 `WHERE status = 'PUBLISHED'` 就无法利用索引前缀，需要全索引扫描。

**追问 2：索引越多越好吗？有什么代价？**

不是。每个索引都有三个代价：**写入开销**（每次 INSERT/UPDATE/DELETE 都要同步更新所有相关索引，索引越多写入越慢）、**存储空间**（每个 B-tree 索引约占表数据量的 10-30%）、**维护成本**（VACUUM 和 REINDEX 需要处理更多索引）。DevPulse 的 `articles` 表有 6 个索引（1 个唯一 + 2 个普通 + 1 个 slug 唯一 + Prisma 主键 + _ArticleToTag 关联表），在"读多写少"的博客场景下是合理的。如果是高频写入的表（如日志表），应该控制索引数量在 3 个以内。

## 十四、前端架构与状态管理

### Q34：你的前端为什么选择 React 19 + Vite + Zustand 的技术栈组合？

**回答：**

DevPulse 前端的技术栈选型遵循"轻量、现代、职责分离"的原则，每一层都有明确的理由。

**React 19** 带来了两个关键改进：`use()` Hook 和 React Compiler。`use()` 让组件可以在渲染中直接读取 Promise 和 Context，不再需要 `useEffect` + `useState` 的数据获取样板代码。React Compiler（通过 `babel-plugin-react-compiler` 集成）自动对组件进行记忆化优化，开发者不再需要手动写 `useMemo`、`useCallback`、`React.memo`，编译器会在编译阶段分析组件的数据流并自动插入优化。DevPulse 的 `vite.config.ts` 中通过 `@rolldown/plugin-babel` 配合 `reactCompilerPreset()` 在生产构建时启用：

```typescript
// vite.config.ts
import babel from '@rolldown/plugin-babel';
import { reactCompilerPreset } from '@vitejs/plugin-react';

plugins: [
  react(),
  babel({ presets: [reactCompilerPreset()] }),
]
```

**Vite 8** 的开发体验远超 Webpack。开发模式基于浏览器原生 ESM，按需编译模块而不是打包整个应用，冷启动时间从 Webpack 的数十秒降到毫秒级。生产构建使用 Rolldown（Rust 实现的打包器，替代 Rollup），打包速度比 Rollup 快数倍。`vite.config.ts` 中配置了 `@/` 路径别名指向 `src/`，开发代理将 `/api` 和 `/uploads` 请求转发到后端 `localhost:3000`：

```typescript
server: {
  proxy: {
    '/api': { target: 'http://localhost:3000', changeOrigin: true },
    '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
  },
}
```

**Zustand 5** 用于客户端状态管理。与 Redux/Context 不同，Zustand 不需要 `<Provider>` 包裹组件树，采用发布-订阅模式，组件通过 selector 精确订阅需要的状态片段，只有被订阅的状态变化才触发组件重渲染。DevPulse 的 `authStore` 就是一个典型例子——`useAuthStore((s) => s.isAuthenticated)` 只订阅认证状态，用户信息更新不会导致只关心 `isAuthenticated` 的组件重渲染：

```typescript
export const useAuthStore = create<AuthState>((set) => ({
  user: loadUser(),
  isAuthenticated: !!sessionStorage.getItem('accessToken'),
  login: (user, accessToken, refreshToken) => {
    sessionStorage.setItem('accessToken', accessToken);
    sessionStorage.setItem('refreshToken', refreshToken);
    saveUser(user);
    set({ user, isAuthenticated: true });
  },
  logout: () => { /* 清除 sessionStorage + 重置状态 */ },
}));
```

**TanStack Query 5** 与 Zustand 形成职责分离：TanStack Query 管理服务端状态（API 数据缓存、自动重取、乐观更新），Zustand 管理客户端状态（认证信息、UI 状态）。这种分离避免了手动维护 loading/error 状态和缓存同步逻辑。

其他技术选型：**React Router 7** 做路由管理（`createBrowserRouter` + `<Routes>`），**React Hook Form 7 + Zod 4** 做表单校验，**Tiptap 3** 做富文本编辑器（`@tiptap/react` + `@tiptap/starter-kit` + `@tiptap/extension-placeholder`），**lucide-react** 提供一致的图标风格。

**追问：对比 Next.js SSR 方案，为什么选择纯 SPA？**

DevPulse 是一个开发者社区平台和管理后台，核心场景（登录后的文章浏览、编辑、管理面板）对 SEO 的要求不高——搜索引擎不需要索引用户个人页面和管理后台。纯 SPA 的优势在于：第一，首屏加载后的交互体验更好，页面切换无白屏闪烁，所有状态保持在内存中。第二，部署更简单——Vite 打包后输出纯静态文件，任何静态服务器（Nginx、CDN）都能直接 serve，不需要 Node.js 运行时。第三，前后端完全解耦，前端和后端可以独立部署、独立扩缩容。如果未来需要 SEO（比如公开文章页需要被搜索引擎收录），可以对公开页面用 SSG（静态生成）或者引入 ISR（增量静态再生），而不需要全量迁移到 SSR。

---

### Q35：TanStack Query 的 useQuery 和 useMutation 在你的项目中分别用在哪些场景？

**回答：**

TanStack Query 在 DevPulse 前端中承担了所有服务端状态的管理职责，`useQuery` 和 `useMutation` 的使用场景非常清晰。

**useQuery 的场景：**

1. **文章列表**：`queryKey: ['articles', page, sort, selectedTag]`，每次筛选条件变化自动生成新的 queryKey，TanStack Query 自动缓存每个组合的结果。用户从第 2 页切回第 1 页时，如果缓存未过期，直接展示缓存数据不发请求：

```typescript
const { data: articlesResponse, isLoading } = useQuery({
  queryKey: ['articles', page, sort, selectedTag],
  queryFn: () => articleApi.list({
    page, pageSize: 10,
    sortBy: SORT_MAP[sort], sortOrder: 'desc',
    ...(selectedTag ? { tag: selectedTag } : {}),
  }),
});
```

2. **文章详情**：`queryKey: ['article', slug]`，通过 slug 获取文章详情，`enabled: !!slug` 防止 slug 为空时发请求。
3. **评论列表**：`queryKey: ['comments', article?.id]`，依赖文章 ID，用 `enabled: !!article?.id` 实现级联查询——文章加载完成后才获取评论。
4. **通知未读数**：`queryKey: ['unread-count']`，配合 `refetchInterval: 30_000` 实现 30 秒轮询，`enabled: isAuthenticated` 确保未登录时不请求。
5. **用户认证状态刷新**：`useAuthRefresh` Hook 中 `queryKey: ['auth-me']`，`staleTime: 5min` 避免路由切换时重复请求 `/auth/me`。

**useMutation 的场景：**

1. **点赞 toggle（乐观更新）**：这是项目中最复杂的 mutation 实现。`onMutate` 中先取消正在进行的 query、快照当前数据、立即切换 UI 上的点赞状态（乐观更新），`onError` 中回滚到快照，`onSettled` 中无论成功失败都 `invalidateQueries` 重新获取服务端真实数据：

```typescript
const likeMutation = useMutation({
  mutationFn: () => articleApi.toggleLike(article!.id),
  onMutate: async () => {
    await queryClient.cancelQueries({ queryKey: ['article', slug] });
    const previous = queryClient.getQueryData<ArticleDetail>(['article', slug]);
    if (previous) {
      queryClient.setQueryData<ArticleDetail>(['article', slug], {
        ...previous,
        isLiked: !previous.isLiked,
        likeCount: previous.isLiked ? previous.likeCount - 1 : previous.likeCount + 1,
      });
    }
    return { previous };
  },
  onError: (_err, _vars, context) => {
    if (context?.previous) {
      queryClient.setQueryData(['article', slug], context.previous);
    }
  },
  onSettled: () => {
    queryClient.invalidateQueries({ queryKey: ['article', slug] });
  },
});
```

2. **收藏 toggle**：与点赞类似的乐观更新模式，`onMutate` 切换 `isBookmarked` 状态。
3. **文章发布/更新**：`mutationFn: articleApi.create`，`onSuccess` 跳转到文章详情页 `/article/${data.slug}`。
4. **关注/取消关注**：`userApi.toggleFollow`，mutation 成功后 invalidate 用户资料 query。

**全局配置策略**（`App.tsx` 中 `QueryClient` 的 `defaultOptions`）：`staleTime: 5min`（5 分钟内数据视为新鲜，不重复请求）、`retry: 1`（失败重试 1 次）、`refetchOnWindowFocus: false`（切换浏览器标签页不自动重取，避免不必要的请求）。

**追问：如果用户在 A 页面点了赞然后立即切到 B 页面，怎么保证数据一致？**

关键在于 `queryKey` 设计和 `invalidateQueries` 的精确失效。点赞 mutation 的 `onSettled` 会调用 `queryClient.invalidateQueries({ queryKey: ['article', slug] })`，将该文章的缓存标记为过期。如果用户切到 B 页面（比如文章列表页），列表页的 `queryKey` 是 `['articles', page, sort, tag]`，与详情页的 `['article', slug]` 不同，不会自动失效。但如果列表页也展示了点赞数，可以在 mutation 的 `onSettled` 中同时 invalidate 列表 query，或者在列表 query 的 `staleTime` 内利用已有的缓存（5 分钟后自动重取时数据就是最新的）。更精细的做法是在 mutation 成功回调中手动 `setQueryData` 更新列表中对应文章的 `likeCount`，但要注意避免过度耦合。

---

### Q36：你的前端 Axios 拦截器是怎么处理 401 和并发刷新的？

**回答：**

DevPulse 的 `src/lib/api.ts` 中实现了一套完整的 Axios 拦截器方案，核心解决三个问题：自动注入 Token、401 自动刷新、并发安全。

**请求拦截器**从 `sessionStorage` 读取 `accessToken`，注入到每个请求的 `Authorization: Bearer xxx` 头：

```typescript
api.interceptors.request.use((config) => {
  const token = sessionStorage.getItem('accessToken');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});
```

**响应拦截器**分两层处理。成功响应（HTTP 200）中检查业务 `code` 字段——`code !== 0` 表示业务错误，转为 rejected promise 并标记 `isBusinessError: true`，方便上层通过 `getApiError()` 提取错误信息。失败响应中只处理 `status === 401` 的令牌刷新逻辑：

```typescript
api.interceptors.response.use(
  (res) => {
    const body = res.data as ApiResponse<unknown>;
    if (body && typeof body.code === 'number' && body.code !== 0) {
      return Promise.reject({ ...res, data: body, isBusinessError: true });
    }
    return res;
  },
  async (error) => {
    if (error.response?.status !== 401 || original?._retry) {
      return Promise.reject(error);
    }
    // 401 刷新逻辑...
  }
);
```

**并发安全**是拦截器设计中最关键的部分。想象这个场景：页面加载时同时发出 3 个 API 请求（文章列表、通知数、用户资料），accessToken 已过期，3 个请求同时收到 401。如果没有并发控制，会触发 3 次 refresh 请求，导致 refreshToken 被多次使用而失效。

DevPulse 用 `isRefreshing` 标志位 + `pendingQueue` 数组解决这个问题。第一个 401 触发 refresh 请求（`isRefreshing = true`），后续 401 检测到 `isRefreshing` 为 true 后将自身推入 `pendingQueue` 等待队列（返回一个挂起的 Promise）。refresh 成功后 `processQueue(null)` 唤醒所有排队请求并重发；refresh 失败则 `processQueue(refreshError)` 拒绝所有排队请求，并调用 `clearAuth()` 清除 `sessionStorage` 中的 `accessToken`/`refreshToken`/`user`，跳转登录页：

```typescript
let isRefreshing = false;
let pendingQueue: Array<{
  resolve: (value: unknown) => void;
  reject: (reason?: unknown) => void;
}> = [];

function processQueue(error: unknown) {
  pendingQueue.forEach((p) => (error ? p.reject(error) : p.resolve(undefined)));
  pendingQueue = [];
}

function clearAuth() {
  sessionStorage.removeItem('accessToken');
  sessionStorage.removeItem('refreshToken');
  sessionStorage.removeItem('user');
  window.location.href = '/login';
}
```

**`resolveUploadUrl()` 工具函数**（`src/lib/utils.ts`）处理后端返回的上传文件 URL 兼容问题：新数据由后端 `UploadService` 通过 `APP_URL` 返回完整 URL（`https://...`），直接使用；历史遗留的相对路径（`/uploads/xxx.webp`）拼接 `VITE_API_URL` 前缀兜底。这保证了换 CDN 或 OSS 时只改后端配置，前端无需修改。

**追问：为什么不用 HttpOnly Cookie 存 refreshToken？**

理想方案确实是 HttpOnly Cookie 存 refreshToken，但 DevPulse 是 SPA + 前后端分域部署（前端 `localhost:5173`，后端 `localhost:3000`），Cookie 跨域需要配置 `SameSite=None; Secure`，本地开发环境没有 HTTPS 无法使用 `Secure` 标记。`sessionStorage` + 短过期 accessToken（15 分钟）是一个务实的折中方案——`sessionStorage` 在标签页关闭后自动清除，accessToken 即使被 XSS 窃取也只有 15 分钟有效期。代码中 `api.ts` 的 `withCredentials: true` 和 refresh 请求中同时支持 Cookie 和 body 传参，为未来迁移到纯 HttpOnly Cookie 方案预留了兼容层。

---

## 十五、前端工程化与样式方案

### Q37：Vite 8 相比 Webpack 有什么优势？你的 Vite 配置做了哪些优化？

**回答：**

Vite 8 相比 Webpack 的核心优势在于开发模式和构建模式的架构差异。

**开发模式：ESM 原生按需编译。** Webpack 在开发模式下需要将整个应用打包成一个 bundle 才能启动 dev server，项目越大启动越慢（大型项目可能需要 30-60 秒）。Vite 利用浏览器原生 ES Module 支持，开发时不打包，直接让浏览器按需请求模块——`import` 语句直接指向源文件，Vite 只在浏览器请求到某个模块时才编译它。这意味着冷启动时间从 Webpack 的 O(N)（N 是项目总模块数）降低到 O(1)（只编译入口模块及其直接依赖），大型项目也能在毫秒级启动。

**生产构建：Rolldown（Rust 实现）。** Vite 8 用 Rolldown 替代了之前的 Rollup 作为生产打包器。Rolldown 是用 Rust 编写的模块打包器，API 兼容 Rollup，但性能大幅提升。Tree-shaking、代码分割、chunk 优化等打包优化在 Rust 实现下执行速度更快。

**DevPulse 的 Vite 配置优化**（`vite.config.ts`）：

```typescript
import { defineConfig } from 'vite';
import react, { reactCompilerPreset } from '@vitejs/plugin-react';
import babel from '@rolldown/plugin-babel';
import tailwindcss from '@tailwindcss/vite';
import path from 'path';

export default defineConfig({
  plugins: [
    react(),
    babel({ presets: [reactCompilerPreset()] }),  // React Compiler 优化
    tailwindcss()  // Tailwind CSS 4 集成
  ],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },  // 路径别名
  },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://localhost:3000', changeOrigin: true },
      '/uploads': { target: 'http://localhost:3000', changeOrigin: true },
    },
  },
});
```

关键配置解读：
1. **`@tailwindcss/vite`**：Tailwind CSS 4 的官方 Vite 插件，替代了 v3 时代的 PostCSS 配置，不需要 `tailwind.config.js`，CSS 中直接 `@import "tailwindcss"` 即可。
2. **`@rolldown/plugin-babel` + `reactCompilerPreset`**：在生产构建时通过 Babel 启用 React Compiler，自动对组件进行记忆化优化。
3. **`resolve.alias`**：`@/` 映射到 `src/`，避免 `../../` 相对路径地狱。
4. **`server.proxy`**：开发时将 `/api` 和 `/uploads` 请求代理到后端，解决跨域问题。

**HMR 原理对比：** Webpack 的 HMR 在模块更新时需要重新编译该模块及其所有父模块的依赖图，然后通过 WebSocket 推送更新。Vite 的 HMR 基于 ESM——每个模块有独立的 URL，更新时只需重新请求被修改的模块，然后通过 HMR API 通知客户端替换该模块，不需要重新编译整个依赖链。这就是为什么 Vite 的 HMR 更新速度在大项目中几乎是恒定的，而 Webpack 的 HMR 随项目规模线性退化。

**追问：Vite 的 dev 和 build 模式有什么区别？**

核心区别在于"打包 vs 不打包"。dev 模式下 Vite 不打包，直接 serve ESM 源文件——浏览器请求 `/src/App.tsx`，Vite 实时编译为 JS 并返回，`import` 语句被重写为可解析的 URL。这意味着 dev 模式下的代码转换是最小化的（只做 TypeScript→JS、JSX→JS、CSS 模块注入），编译速度极快。build 模式下 Vite 使用 Rolldown 将所有模块打包成优化后的 chunk 文件（vendor chunk、按路由分割的 lazy chunk），进行 tree-shaking 移除未使用代码、压缩代码、生成 hash 文件名用于长期缓存。两种模式的代码行为一致，但 dev 注重启动速度和 HMR 速度，build 注重产物体积和加载性能。

---

### Q38：Tailwind CSS 4 和 v3 有什么主要区别？你是怎么组织样式的？

**回答：**

Tailwind CSS 4 是一次基于 Rust 的架构重写，与 v3 有几个关键区别。

**Rust 引擎重写。** Tailwind 4 的核心引擎用 Rust 重写，构建速度相比 v3 的 JavaScript 实现大幅提升。在大型项目中，v3 的 PostCSS 处理可能成为构建瓶颈（需要扫描所有模板文件、生成工具类 CSS），而 v4 的 Rust 引擎将这个过程的耗时降低了一个数量级。

**CSS-first 配置。** v3 需要 `tailwind.config.js` 文件来配置主题、插件、内容路径。v4 取消了 JS 配置文件，改为在 CSS 中使用 `@theme` 指令声明自定义主题值。DevPulse 的 `index.css` 中只需一行 `@import "tailwindcss"` 即可引入全部功能，不需要任何配置文件：

```css
@import "tailwindcss";

html {
  scroll-behavior: smooth;
  -webkit-font-smoothing: antialiased;
}
```

**自动内容检测。** v3 需要在配置中声明 `content` 数组告诉 Tailwind 扫描哪些文件来生成工具类。v4 自动检测项目中的模板文件，不需要手动配置，消除了"忘记加 content 路径导致类名不生效"的常见坑。

**样式组织方案：**

DevPulse 使用 `clsx + tailwind-merge` 组合解决条件类名冲突。`src/lib/utils.ts` 中的 `cn()` 工具函数是项目样式系统的核心：

```typescript
import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
```

`clsx` 负责条件拼接类名（`cn('px-3', isActive && 'bg-blue-50')`），`tailwind-merge` 负责解决冲突类名（`cn('p-4', 'p-2')` 结果为 `'p-2'` 而不是 `'p-4 p-2'`）。这在组件封装中非常重要——`Button` 组件有默认样式，使用者传入的 `className` 需要能覆盖默认值而不产生冲突。

**PasswordInput 组件的 Tailwind v4 兼容问题：** Tailwind v4 的 preflight（基础重置样式）设置了 `appearance: none`，这会移除 Chromium 原生的密码输入框小眼睛按钮。DevPulse 的 `PasswordInput` 组件用自定义的 Eye/EyeOff 按钮替代了这个功能，同时使用 `cn()` 组合样式类：

```typescript
<input
  type={visible ? 'text' : 'password'}
  className={cn(
    'w-full px-3 py-2 pr-10 text-sm border rounded-md shadow-sm transition-colors',
    'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500',
    error ? 'border-red-300 focus:ring-red-500' : 'border-gray-300',
    className,
  )}
/>
<button onClick={() => setVisible((v) => !v)}>
  {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
</button>
```

**与 CSS-in-JS 对比：** Tailwind 是零运行时开销——所有样式在构建时生成 CSS 文件，运行时没有任何 JS 计算。CSS-in-JS（如 styled-components、Emotion）在运行时动态生成样式，支持基于 props 的动态样式，但有运行时开销和 SSR 兼容性问题。DevPulse 选择 Tailwind 因为管理后台和社区平台的样式需求相对标准化，Tailwind 的工具类足以覆盖，且零运行时开销对性能更友好。

**追问：Tailwind 的 "utility-first" 会不会导致 HTML 臃肿？**

表面上看 Tailwind 的 HTML 确实有很多 class，但实际项目中这比传统 CSS 方案的代码量更少。原因是：第一，工具类是 gzip 友好的——同一个 class 名（如 `flex`、`items-center`）在 HTML 中反复出现，gzip 的字典压缩对重复字符串的压缩率极高，最终传输体积几乎不增加。第二，传统 CSS 方案需要维护单独的 CSS 文件，类名命名（BEM？CSS Modules？）、样式覆盖、死代码清理都是额外成本。Tailwind 的类名是确定性的（`mt-4` 永远是 `margin-top: 1rem`），不存在命名冲突和样式覆盖问题。第三，`cn()` 工具函数 + 组件封装可以将重复的样式组合内聚在组件内部，使用者只需关心组件的 props，不会暴露大量 class。

---

## 十六、React 表单与组件设计

### Q39：你的前端表单是怎么处理的？React Hook Form + Zod 的组合解决了什么问题？

**回答：**

DevPulse 的表单方案是 React Hook Form 7 + Zod 4 + `@hookform/resolvers/zod` 的经典组合，在登录、注册、重置密码、设置页等多个表单场景中统一使用。

**React Hook Form 解决的核心问题是减少重渲染。** 传统的受控组件方案中，每次输入都会触发 `onChange` → `setState` → 组件重渲染，表单字段越多重渲染越频繁。React Hook Form 通过 `register` 直接操作 DOM 引用（uncontrolled 模式），只在需要时（提交、校验错误）才触发重渲染。

**Zod 4 解决的核心问题是 schema-first 校验和 TypeScript 类型推导一体化。** Zod schema 既是运行时的校验规则，也是编译时的 TypeScript 类型来源，两者自动保持同步：

```typescript
// LoginPage.tsx
const loginSchema = z.object({
  email: z.string().email('请输入有效的邮箱地址'),
  password: z.string().min(1, '请输入密码'),
});

type LoginForm = z.infer<typeof loginSchema>;
// 等价于: type LoginForm = { email: string; password: string; }
```

**桥接层 `@hookform/resolvers/zod`** 将 Zod schema 转换为 React Hook Form 能理解的校验函数：

```typescript
const {
  register,
  handleSubmit,
  formState: { errors },
} = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });
```

**对比手写校验逻辑的维护成本。** 如果不用这套方案，登录表单需要手写：`useState` 管理每个字段值、`onChange` 事件处理、`onBlur` 触发校验、手写邮箱正则和密码非空判断、`errors` 状态管理、提交时再次校验。字段数从 2 个增加到 10 个（注册表单），手写代码量是指数级增长的。React Hook Form + Zod 方案中，增加字段只需在 schema 中加一行声明，`register` 的调用方式不变。

**项目中的表单实现示例：**

登录页（`LoginPage.tsx`）：`email` 用 `z.string().email()` 校验格式，`password` 用 `z.string().min(1)` 校验非空。提交时 `api.post('/auth/login', data)` 发送请求，成功后 `login()` 存储 token，失败时 `getApiError()` 提取后端返回的脱敏错误消息展示。

注册页（`RegisterPage.tsx`）：字段更多（`email`、`username`、`displayName`、`password`），Zod schema 中可以用 `z.string().min(8).max(50)` 限制密码长度，`z.string().regex()` 限制用户名格式。

**追问：Zod schema 能不能和后端 DTO 的 class-validator 复用？**

不能直接复用。Zod 是 TypeScript 生态的 schema 库，class-validator 是 NestJS 中基于装饰器的校验库，两者的 API 和运行时完全不同。但它们可以维护"逻辑一致性"——在 DevPulse 中，前端的 Zod schema 和后端的 DTO class-validator 装饰器校验相同的业务规则（如邮箱格式、密码长度、用户名规则），虽然代码是两份，但规则是同一套。更高级的做法是维护一份 JSON Schema 作为单一数据源，前端用 `zod` 的 `fromJsonSchema` 导入，后端用 `class-validator` 的 JSON Schema 支持导入，但这增加了架构复杂度，在项目规模不大时得不偿失。

---

### Q40：React Router 7 的路由设计是怎么组织的？怎么做路由级鉴权？

**回答：**

DevPulse 使用 React Router 7 的 `<BrowserRouter>` + `<Routes>` 声明式路由，按布局和业务逻辑组织为三层路由结构。

**路由配置结构**（`App.tsx`）：

```typescript
<BrowserRouter>
  <Routes>
    {/* Auth routes - AuthLayout（无导航栏） */}
    <Route path="/login" element={<AuthLayout><LoginPage /></AuthLayout>} />
    <Route path="/register" element={<AuthLayout><RegisterPage /></AuthLayout>} />
    <Route path="/forgot-password" element={<AuthLayout><ForgotPasswordPage /></AuthLayout>} />
    <Route path="/reset-password" element={<AuthLayout><ResetPasswordPage /></AuthLayout>} />

    {/* Admin routes - AdminLayout（侧边栏布局） */}
    <Route path="/admin" element={<AdminLayout />}>
      <Route index element={<DashboardPage />} />
      <Route path="users" element={<UsersManagePage />} />
      <Route path="articles" element={<ArticlesManagePage />} />
      <Route path="tags" element={<TagsManagePage />} />
      <Route path="roles" element={<RolesManagePage />} />
      <Route path="permissions" element={<PermissionsManagePage />} />
    </Route>

    {/* Main routes - MainLayout（顶部导航栏 + 底部栏） */}
    <Route element={<MainLayout />}>
      <Route index element={<HomePage />} />
      <Route path="article/:slug" element={<ArticleDetailPage />} />
      <Route path="editor" element={<ProtectedRoute><ArticleEditorPage /></ProtectedRoute>} />
      <Route path="tags" element={<TagsPage />} />
      <Route path="settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
      <Route path="notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />
    </Route>

    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes>
</BrowserRouter>
```

**ProtectedRoute 组件**实现路由级鉴权。它从 `authStore` 读取 `isAuthenticated` 状态，未登录用户访问受保护路由时重定向到登录页，并通过 `state={{ from: location }}` 记录来源路径，登录成功后可以跳回原页面：

```typescript
function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" replace state={{ from: location }} />;
  }

  return <>{children}</>;
}
```

**AdminRoute（管理员路由鉴权）**在 `AdminLayout` 组件中实现，不仅检查 `isAuthenticated`，还通过 `hasRole(user, 'ADMIN')` 检查用户是否拥有管理员角色。非管理员用户直接重定向到首页：

```typescript
// AdminLayout.tsx
if (!isAuthenticated || !user) {
  return <Navigate to="/login" replace state={{ from: location }} />;
}
if (!hasRole(user, 'ADMIN')) {
  return <Navigate to="/" replace />;
}
```

**认证状态后台刷新**是路由鉴权的配套机制。`MainLayout` 和 `AdminLayout` 都调用了 `useAuthRefresh()` Hook，它在应用启动时用 `sessionStorage` 中的 token 静默请求 `/auth/me` 获取最新用户数据，确保刷新页面后认证状态不丢失、用户角色信息是最新的。

**追问：路由级鉴权和 API 级鉴权的关系是什么？只做前端鉴权够吗？**

不够，前端鉴权只是用户体验优化，真正的安全屏障在后端。前端 `ProtectedRoute` 可以阻止未登录用户看到页面，但无法阻止用户直接调用 API。DevPulse 的鉴权是前后端双层的：前端用 `ProtectedRoute` / `AdminLayout` 做页面级访问控制，后端用 NestJS 的 `@UseGuards(JwtAuthGuard)` 做 API 级认证、`@UseGuards(PermissionGuard)` 做 RBAC 权限校验。即使攻击者绕过前端直接调 API，后端的 Guard 会返回 401/403 拒绝请求。前端的价值在于让正常用户有流畅的体验——不需要等 API 返回 401 再跳转，而是直接在路由层拦截。

---

## 十七、后端补充

### Q41：Swagger API 文档是怎么集成的？生产环境怎么处理？

**回答：**

DevPulse 在 `main.ts` 中使用 `@nestjs/swagger` 集成 Swagger API 文档，配置简洁但功能完整：

```typescript
const config = new DocumentBuilder()
  .setTitle('DevPulse API')
  .setDescription('Developer community platform API')
  .setVersion('1.0')
  .addBearerAuth()  // 支持 Bearer Token 认证
  .build();
const document = SwaggerModule.createDocument(app, config);
SwaggerModule.setup('api/docs', app, document);
```

这段代码做了三件事：第一，`DocumentBuilder` 配置文档的元信息（标题、描述、版本）和认证方式（`addBearerAuth()` 让文档页面的每个接口都有"Authorize"按钮，输入 JWT 后自动在请求头中附加 `Authorization: Bearer xxx`）。第二，`SwaggerModule.createDocument()` 扫描所有 Controller 和 DTO，自动生成 OpenAPI 3.0 规范的 JSON。第三，`SwaggerModule.setup()` 将 Swagger UI 挂载到 `/api/docs` 路径，访问 `http://localhost:3000/api/docs` 即可看到交互式文档。

**装饰器驱动的文档生成：** NestJS 的 Swagger 通过装饰器标注每个接口的元信息。项目中使用 `@ApiTags()` 给 Controller 分组（如 `Auth`、`Article`、`User`），`@ApiOperation()` 描述接口功能，`@ApiResponse()` 声明响应状态码和格式，`@ApiProperty()` 标注 DTO 字段的类型、描述、示例值。这些装饰器不影响运行时逻辑，纯粹是文档元数据。

**生产环境的处理：** 当前 DevPulse 的 `main.ts` 中 Swagger 在所有环境下都会挂载，生产环境应该通过环境变量条件禁用：

```typescript
if (process.env.NODE_ENV !== 'production') {
  SwaggerModule.setup('api/docs', app, document);
}
```

不禁用的风险是信息泄露——Swagger 文档暴露了所有 API 路径、请求参数结构、响应格式，攻击者可以利用这些信息构造精确的攻击请求。生产环境中 API 文档应通过内部 Wiki 或 Postman Collection 分享给前端开发者，而不是公网可访问。

**Swagger JSON 的进阶用途：** `SwaggerModule.createDocument()` 生成的 OpenAPI JSON 可以导出（访问 `/api/docs-json`），用于前端代码生成工具（如 `openapi-typescript`、`orval`）自动生成 TypeScript 类型定义和 API 客户端代码，实现前后端接口契约的自动化同步。

**追问：Swagger 装饰器和 class-validator 装饰器会冲突吗？**

不冲突，两者作用在不同层面。class-validator 装饰器（`@IsString()`、`@IsEmail()`、`@MinLength()`）在运行时被 ValidationPipe 读取做请求参数校验。Swagger 装饰器（`@ApiProperty()`）在文档生成时被读取做元数据标注。同一个 DTO 字段可以同时拥有两种装饰器。实际上，`@nestjs/swagger` 的 `@ApiProperty()` 可以读取部分 class-validator 的元数据（如 `@IsString()` 自动推断类型为 string），减少重复标注。

---

### Q42：Nodemailer 邮件发送是怎么集成的？为什么不用第三方 API？

**回答：**

DevPulse 的邮件发送通过 `MailModule` 封装 Nodemailer + SMTP 实现，支持三种运行模式以适应不同环境。

**MailModule**（`src/common/mail/mail.module.ts`）是一个标准的 NestJS 模块，导出 `MailService` 供其他模块注入使用：

```typescript
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
```

**MailService**（`src/common/mail/mail.service.ts`）在构造函数中同步初始化 transporter。这里有一个重要的技术细节：`nodemailer.createTransport()` 是**同步方法**，不能在 `async` 构造函数中使用。因此 DevPulse 用 `initTransporter()` 在构造函数中同步完成初始化：

```typescript
constructor(private configService: ConfigService) {
  const smtpHost = this.configService.get<string>('SMTP_HOST');
  const smtpUser = this.configService.get<string>('SMTP_USER');
  const smtpPass = this.configService.get<string>('SMTP_PASS');

  const isLocalhost = !smtpHost || smtpHost === 'localhost' || smtpHost === '127.0.0.1';
  const hasAuth = !!(smtpUser && smtpPass);
  this.isDevMode = isLocalhost && !hasAuth;

  if (!this.isDevMode && smtpHost) {
    // 生产模式：真实 SMTP
    this.transporter = nodemailer.createTransport({
      host: smtpHost, port: smtpPort, secure: smtpPort === 465,
      auth: { user: smtpUser!, pass: smtpPass! },
    });
  } else if (this.isDevMode) {
    // 开发模式：连接本地 Mailpit
    this.transporter = nodemailer.createTransport({
      host: smtpHost || '127.0.0.1', port: 1025, secure: false,
    });
  }
}
```

**三种运行模式：**

1. **本地开发（Mailpit）**：Docker Compose 启动 Mailpit 容器（`docker compose up -d mailpit`），它模拟 SMTP 服务器，收到的邮件可以在 `http://localhost:8025` 的 Web UI 中查看。`SMTP_HOST` 使用 `127.0.0.1` 而不是 `localhost`，这是因为 macOS 下 `localhost` 会被解析为 IPv6 `::1`，导致连接 Mailpit 时报 `ECONNREFUSED ::1:1025`。
2. **测试兜底（Ethereal）**：如果没有配置任何 SMTP 信息，可以使用 Nodemailer 的 Ethereal 测试账号（自动生成临时邮箱，邮件可在 ethereal.email 查看），适合 CI/CD 环境。
3. **生产模式（真实 SMTP）**：配置 `SMTP_HOST`、`SMTP_USER`、`SMTP_PASS` 环境变量连接真实邮件服务商（如 SendGrid、Mailgun 的 SMTP 接口）。

**错误处理策略：** 邮件发送失败时 `MailService` 抛出异常，`AuthService` 捕获异常后**不设冷却期**（正常发送会设置 60 秒冷却防止频繁请求），返回 `ErrMailSendFailed` 错误码，前端展示"邮件发送失败，请稍后重试"的提示。这避免了邮件发送失败但用户看到"已发送"的误导。

**不同邮件的发送策略：** 重置密码邮件是同步 `await` 的——用户在等待密码重置邮件，必须确保即时性，HTTP 请求需要等到邮件发送完成才返回。欢迎邮件可以异步发送（fire-and-forget），不阻塞注册流程的响应。

**追问：为什么不用第三方 API（如 SendGrid API）而是 SMTP？**

SMTP 是邮件发送的通用协议，优势在于可移植性——换邮件服务商只需改 SMTP 配置（host/port/user/pass），不需要改代码。第三方 API（如 SendGrid API、Resend API）虽然有更好的送达率追踪和模板管理，但会与特定服务商耦合。DevPulse 作为学习项目，SMTP 方案足够且更通用。如果项目上线后需要更好的送达率和邮件分析能力，可以在不改变 `MailService` 接口的前提下将底层 transporter 切换为第三方 API 的 Nodemailer 插件。

---

### Q43：pnpm Monorepo 是怎么管理的？和 npm workspaces 有什么区别？

**回答：**

DevPulse 使用 pnpm workspaces 管理 monorepo，项目结构为 `apps/api`（NestJS 后端）和 `apps/web`（React 前端）两个子包。

**`pnpm-workspace.yaml`** 定义工作空间范围和构建白名单：

```yaml
packages:
  - 'apps/*'
allowBuilds:
  '@prisma/engines': true
  '@scarf/scarf': true
  bcrypt: true
  esbuild: true
  msgpackr-extract: true
  prisma: true
  unrs-resolver: true
```

`packages: ['apps/*']` 告诉 pnpm `apps/` 下的每个目录都是独立的包。`allowBuilds` 白名单列出允许执行原生编译的包（`bcrypt` 需要编译 C++ addon、`prisma` 需要下载引擎二进制、`esbuild` 需要平台相关的二进制）——pnpm 出于安全考虑默认禁止 postinstall 脚本编译原生模块，需要显式白名单。

**根 `package.json`** 中通过 `--filter` 按包执行命令：

```json
{
  "scripts": {
    "dev:api": "pnpm --filter api dev",
    "dev:web": "pnpm --filter web dev",
    "build:api": "pnpm --filter api build",
    "build:web": "pnpm --filter web build",
    "db:migrate": "pnpm --filter api db:migrate"
  }
}
```

`pnpm --filter api dev` 表示只在 `api` 包中执行 `dev` 脚本，不影响其他包。这比 `cd apps/api && pnpm dev` 更优雅，且能在 monorepo 根目录统一管理。

**pnpm vs npm/yarn workspaces 的核心区别在于依赖隔离策略。** npm workspaces 和 yarn workspaces 使用"依赖提升"（hoisting）——将所有子包的依赖扁平化安装到根目录的 `node_modules`，这导致了"幽灵依赖"问题：包 A 的代码中 `import` 了包 B 的依赖（如 `lodash`），即使包 A 的 `package.json` 中没有声明 `lodash`，也能正常使用，因为 `lodash` 被提升到了根 `node_modules`。这在本机开发时不会报错，但在 CI 环境或换包管理器后可能突然失败。

pnpm 使用**严格依赖隔离**——每个包的 `node_modules` 中只有自己在 `package.json` 中声明的依赖，通过符号链接指向全局 store。未声明的依赖无法被 `import`，从根源上消除了幽灵依赖。这意味着 DevPulse 的 `api` 包不能意外使用 `web` 包的依赖，反之亦然，保证了包边界的严格性。

**追问：monorepo 中前后端共享类型定义怎么做的？**

目前 DevPulse 的前端类型定义在 `web/src/types/api.ts` 中手动维护，与后端的 DTO 保持逻辑一致但代码独立。更理想的做法是创建一个 `packages/shared` 共享包，将 TypeScript 类型定义、常量、工具函数提取到共享包中，前后端都依赖它。但考虑到学习项目的简洁性和前后端校验库的差异（后端 class-validator vs 前端 Zod），目前手动维护两份类型的成本是可接受的。

---

### Q44：如果项目需要实时通知推送，你会怎么设计 WebSocket 方案？

**回答：**

DevPulse 当前的通知是通过 HTTP 轮询实现的（`MainLayout` 中 `useQuery` 配合 `refetchInterval: 30_000` 每 30 秒拉取未读数）。如果需要实时推送，我会基于 `@nestjs/websockets` + Socket.IO 设计 WebSocket 方案。

**后端 Gateway 设计：**

```typescript
@WebSocketGateway({ cors: { origin: process.env.FRONTEND_URL } })
export class NotificationGateway implements OnGatewayConnection {
  @WebSocketServer() server: Server;

  handleConnection(client: Socket) {
    // 从握手参数中提取 JWT 并验证
    const token = client.handshake.auth.token;
    const user = this.jwtService.verify(token);
    // 每个用户加入以自己 userId 命名的 room
    client.join(`user:${user.sub}`);
  }

  // 向指定用户推送通知
  notifyUser(userId: string, notification: any) {
    this.server.to(`user:${userId}`).emit('notification', notification);
  }
}
```

核心设计要点：

1. **连接认证**：WebSocket 连接建立时从 `client.handshake.auth.token` 提取 JWT 并验证，无效 token 直接断开连接。这复用了现有的 JWT 认证体系。

2. **房间机制**：每个用户加入 `user:{userId}` 房间，推送通知时只需向目标房间发送，不需要遍历所有连接。Socket.IO 的 room 机制在服务端是内存中的 Set，`emit` 到 room 的时间复杂度是 O(1)。

3. **与 BullMQ Worker 集成**：当前 DevPulse 的 `NotificationService` 在创建通知后通过 BullMQ 异步处理（如发送邮件）。增加 WebSocket 推送只需在 Worker 的 `process` 回调中调用 `gateway.notifyUser(recipientId, notification)`——BullMQ Worker 创建通知记录后，同时通过 Gateway 推送到前端。

4. **多实例部署**：当 NestJS 部署多个实例时，用户 A 可能连接到实例 1，而创建通知的 Worker 运行在实例 2。这时需要 `@socket.io/redis-adapter`，通过 Redis Pub/Sub 实现跨进程广播：

```typescript
const pubClient = createClient({ url: process.env.REDIS_URL });
const subClient = pubClient.duplicate();
io.adapter(createAdapter(pubClient, subClient));
```

5. **前端集成**：Socket.IO Client 在 `MainLayout` 中初始化连接，监听 `notification` 事件。收到新通知时更新 `unreadCount`、展示 Toast 提示。连接断开时自动重连（Socket.IO 内置指数退避重连机制），重连成功后重新加入 room。

**追问：WebSocket 和 SSE（Server-Sent Events）怎么选？**

如果推送是**单向的**（服务端 → 客户端），SSE 更简单——基于 HTTP 协议，不需要额外的 WebSocket 服务器，天然支持断线重连和消息 ID。DevPulse 的通知推送就是典型的单向场景，SSE 完全够用。WebSocket 的优势在于**双向通信**（如实时聊天、协同编辑），如果 DevPulse 未来增加即时消息功能，WebSocket 更合适。综合来看，如果只做通知推送，SSE 是更轻量的选择；如果要为未来的双向通信预留能力，WebSocket 更具扩展性。

---

### Q45：Nginx 在生产部署中承担什么角色？

**回答：**

Nginx 在 DevPulse 的生产部署中承担多个关键角色，是前后端应用的统一入口。

**1. 前端 SPA 静态资源服务。** DevPulse 的前端 Dockerfile 中内置了 Nginx 配置（`apps/web/nginx.conf`），将 Vite 构建产物 serve 为静态文件：

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    # Vite 输出的 hash 文件名资源 → 长期缓存
    location /assets/ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }

    # SPA fallback → 所有非文件路由返回 index.html
    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

`try_files $uri $uri/ /index.html` 是 SPA 部署的关键——当用户直接访问 `/article/my-post` 时，Nginx 找不到对应的文件，回退到 `index.html`，让 React Router 在客户端处理路由。`/assets/` 路径下的文件带 1 年强缓存（Vite 输出的文件名包含内容 hash，内容变化时文件名也变化，所以可以安全地长期缓存）。

**2. 反向代理到后端。** 生产环境中 Nginx 作为反向代理将 `/api` 请求转发到 NestJS 后端：

```nginx
location /api/ {
    proxy_pass http://api:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

`X-Real-IP` 和 `X-Forwarded-For` 让后端能获取到用户的真实 IP（而不是 Nginx 的内部 IP），这对限流和日志分析至关重要。

**3. SSL/TLS 终止。** 生产环境用 Let's Encrypt + certbot 自动申请和续期 HTTPS 证书，Nginx 作为 SSL 终止点，后端 NestJS 只需要监听 HTTP：

```nginx
listen 443 ssl;
ssl_certificate /etc/letsencrypt/live/example.com/fullchain.pem;
ssl_certificate_key /etc/letsencrypt/live/example.com/privkey.pem;
```

**4. 静态上传文件直接服务。** `/uploads` 路径直接从磁盘读取文件返回，不经过 Node.js 处理，减轻后端负载：

```nginx
location /uploads/ {
    alias /var/www/uploads/;
    expires 30d;
}
```

**5. gzip 压缩。** Nginx 的 gzip 模块对 CSS、JS、JSON、SVG 等文本资源进行实时压缩，通常能减少 60-80% 的传输体积。DevPulse 的前端 Nginx 配置中已启用：

```nginx
gzip on;
gzip_types text/plain text/css application/json application/javascript text/xml image/svg+xml;
```

**6. 安全头和限流。** 生产环境应配置安全响应头（`X-Frame-Options: DENY` 防点击劫持、`X-Content-Type-Options: nosniff` 防 MIME 嗅探、`Strict-Transport-Security` 强制 HTTPS）和限流（`limit_req_zone` 令牌桶算法限制每个 IP 的请求频率），这些在 Nginx 层面配置比在 Node.js 中配置性能更好，且能挡住大部分恶意请求不到达后端。

**追问：upstream 负载均衡怎么做？**

当需要多个 NestJS 实例时，Nginx 的 `upstream` 指令定义后端服务器池：

```nginx
upstream nestjs_backend {
    ip_hash;  # 同一 IP 始终路由到同一后端（WebSocket 长连接友好）
    server api1:3000;
    server api2:3000;
}
location /api/ {
    proxy_pass http://nestjs_backend;
}
```

`ip_hash` 策略让同一用户的请求始终路由到同一后端实例，这对 WebSocket 长连接和内存中的 session 状态非常重要。如果使用 Redis 做 session 和 WebSocket adapter，则可以改用 `round_robin`（轮询），实现更均匀的负载分配。

---

## 十八、设备指纹与会话管理

### Q46：什么是设备指纹？为什么需要它来管理登录设备？

**回答：**

设备指纹（Device Fingerprint）是从浏览器/设备的固有属性中提取的一组稳定特征，用于在不依赖 Cookie 或 localStorage 的情况下识别"同一台设备"。DevPulse 使用设备指纹解决一个具体的 Bug：用户手动清除浏览器 token 后重新登录，每次都产生一条新的 Redis 会话记录（因为 `crypto.randomUUID()` 每次不同），导致"登录设备"页面出现 4 台完全相同的 macOS 幽灵设备。

DevPulse 的指纹采集包含 7 个稳定维度：`userAgent`（浏览器内核）、`screen.width × screen.height`（物理分辨率）、`screen.colorDepth`（色深）、`timeZone`（时区名）、`maxTouchPoints`（触控点数）、`hardwareConcurrency`（CPU 核心数）、`languages`（语言列表）。刻意**不采集**的字段包括 `window.innerWidth`（缩放即变）、`devicePixelRatio`（系统缩放比例改变时跟随变化）、IP 地址（切 WiFi/VPN 就变）。

后端拿到前端指纹后，用 `SHA-256(userId + fingerprint)` 生成确定性 deviceId。同一浏览器对同一用户始终产生相同的 deviceId，使得 Redis HSET 天然覆盖旧值——这就是 UPDATE 语义，无需显式的"查找→更新"逻辑。

**追问：为什么不用 Canvas/WebGL 指纹？**

Canvas/WebGL 指纹确实能提供更高的区分度（能识别不同显卡），但代价是：需要异步 DOM 渲染（创建 canvas → 绘制文字/图形 → 导出 dataURL）、无痕模式下严重降级（某些浏览器限制 canvas API）、部分浏览器弹出隐私警告。对于 DevPulse 这类社区平台，7 个静态维度的区分度已经足够——不同浏览器（Chrome vs Firefox）UA 不同，同一浏览器的不同配置文件 UA 也不同。只有"同一台机器同一浏览器同一配置文件"才需要精确到 Canvas 级别，而这种情况在我们的场景下本身就是同一台设备。

### Q47：确定性 deviceId 如何影响 Refresh Token 轮换？

**回答：**

原来的令牌轮换流程：refresh → 生成新 `crypto.randomUUID()` deviceId → 存新会话 → 删旧会话。每次刷新都会产生一条新的 Redis 会话记录，虽然旧的会被删除，但设备列表查询时如果时序不当仍可能出现瞬态重复。

改用确定性 deviceId 后：refresh → 从 Redis 读取存储的 fingerprint → `SHA-256(userId + fingerprint)` 生成相同的 deviceId → HSET 覆盖旧会话。此时 `newDeviceId === oldDeviceId`，所以 `revokeSession(userId, oldDeviceId)` 成为幂等 no-op（删除的是刚覆盖的同一个 key）。

但旧 refreshToken 的安全性不受影响：HSET 覆盖了 `tokenHash` 字段，如果有人拿旧 RT 来刷新，`bcrypt.compare(oldRT, newHash)` 必然失败，触发令牌重用检测，强制该设备下线。这就是"令牌重用劫持检测"机制——它依赖 tokenHash 而非 deviceId 的唯一性。

### Q48：如果用户从 Chrome 换到 Firefox 登录，设备指纹方案如何处理？

**回答：**

Chrome 和 Firefox 的 `navigator.userAgent` 完全不同，所以 FNV-1a 哈希产生的 fingerprint 不同，后端 `SHA-256(userId + fingerprint)` 产生的 deviceId 也不同。两台浏览器各自有独立的 Redis 会话记录，设备列表显示两条——这是正确行为，因为用户确实在用两台不同的浏览器（设备）。

如果用户从 Chrome 126 升级到 Chrome 127，UA 也会变化，指纹跟着变。旧 Chrome 126 的会话在 7 天 TTL 到期后自动清理，新 Chrome 127 产生一条新会话。用户视角：设备列表短暂出现两条 macOS（旧的标注"7 天前活跃"），旧的自然过期后只剩一条。这是可接受的 trade-off——浏览器大版本更新频率大约 4 周一次，用户不会因此困惑。

对于无指纹的旧客户端（如 APP 端或早期浏览器），系统自动退回 `crypto.randomUUID()` 生成随机会话 ID，与指纹方案并存。`getSessions` 查询时按 fingerprint 分组去重作为兜底，无 fingerprint 的会话单独展示。

---

## 十九、草稿系统设计与编辑器体验优化

### Q49：为什么草稿保存需要单独的 DTO，不能复用 CreateArticleDto？

**回答：**

`CreateArticleDto` 是为「发布文章」设计的，带有 `@MinLength(5)` 标题校验和 `@MinLength(1)` 内容校验。草稿的核心诉求是"防止用户写一半丢失"，用户可能只写了两个字就点保存，此时 MinLength(5) 会直接拒绝请求，体验极差。

解决方案是新建 `SaveDraftDto`，所有字段标 `@IsOptional()`——标题可以为空（后端兜底填 "无标题草稿"），内容可以为空字符串，不做任何格式约束。前端只在「发布」按钮时才做标题长度和内容非空的校验。这样同一个编辑器里两个按钮走完全不同的校验管线，互不干扰。

另一个考量是草稿不需要 optimistic lock（version 字段），因为草稿只有作者本人编辑，不存在并发冲突场景。`updateDraft` 方法直接 `prisma.article.update()`，不走 `$executeRawUnsafe` 的 `WHERE version = $7` 条件。

### Q50：草稿保存后为什么不能 navigate 到文章详情页？正确做法是什么？

**回答：**

文章详情页的 `findBySlug` 查询条件是 `status: 'PUBLISHED'`，草稿状态是 `DRAFT`，必然返回 404。即使改成"草稿也能通过 slug 访问"，也会引入安全风险——草稿可能被搜索引擎爬取或被人猜到 URL 后看到未发布内容。

正确做法：草稿保存成功后**留在编辑器页面**，仅用状态文字（"✓ 已保存"）给用户反馈。如果是新文章第一次保存草稿，用 `navigate('/editor/${id}', { replace: true })` 把 URL 从 `/editor` 切换到 `/editor/:id`，这样后续保存走 `updateDraft` 而不是 `saveDraft`。`replace: true` 避免浏览器历史记录多出一条。

### Q51：如何在编辑器中实现标签多选，同时保证良好的 UX？

**回答：**

通过 `useQuery(['tags'])` 获取全量标签（标签数量通常有限，几十到上百个），渲染为可点击的 chip 按钮列表。选中态用蓝底 + ✓ 图标，未选中态用白底灰边框。点击切换选中状态，数据存储到 `selectedTagIds` 字符串数组。

发布和保存草稿时均携带 `tagIds` 字段。编辑已有文章时，`useEffect` 里从 `existingArticle.tags` 提取 ID 列表初始化 `selectedTagIds`，确保已有标签回显。这种 chip 多选比传统的 `<select multiple>` 或下拉搜索框更直观，用户一眼就能看到所有可用标签和已选状态，不需要额外展开/收起操作。

### Q52：标签应该由管理员预创建还是允许用户自由创建？为什么？

**回答：**

这取决于产品形态。分析业内三种典型模式：

**模式 A — 管理员预创建（WordPress 分类/内部 Wiki）：** 标签质量高、无重复，但创作流程被打断——用户想打一个不存在的标签时必须找管理员申请，体验很差。适合标签体系需要严格治理的场景（如企业知识库）。

**模式 B — 用户自由创建（掘金/Medium/Stack Overflow）：** 输入即创建，零摩擦。缺点是可能产生大量重复或低质量标签（"react" / "React" / "react.js"）。Stack Overflow 用声望值限制新建频率，Medium 用算法合并相似话题。适合社区驱动的内容平台。

**模式 C — 混合模式（GitHub Labels）：** 默认提供一组标签，有权限的用户可以新增。兼顾治理和灵活性。

DevPulse 采用模式 B（用户自由创建），因为：① 作为社区平台，标签是社区共建的资源，不应成为创作瓶颈；② 标签数量可控（开发者社区话题有限），不太会出现失控的标签爆炸；③ 后端 `POST /tags` 权限从 `tag:manage`（ADMIN）放宽为 `JwtAuthGuard`（任何已登录用户），前端在标签选择器内嵌输入框，键入新名称按 Enter 即调 API 创建并自动勾选。如果未来标签质量成为问题，可以加一层：新用户创建的标签进入"待审核"状态，由管理员确认后对所有用户可见。

前端实现上，输入框支持实时搜索过滤（最多展示 10 个候选），精确匹配已有标签时自动选中而非重复创建，不匹配时提示"按 Enter 创建「xxx」"。这样既降低了新用户的学习成本（看到现有标签就知道怎么命名），又不阻断创作流程。

### Q53：文章查看次数如何做到实时一致？Redis buffer + 乐观更新的组合是怎么工作的？

**回答：**

查看次数的核心矛盾是**写入频率高但一致性要求低**——每篇文章每次被访问都要 +1，如果直接写 DB 会造成大量小 UPDATE，影响性能。常见的解法是"Redis buffer + 定时 flush"：每次访问 `INCR` Redis 计数器（O(1) 操作），后台任务每 60s 把累积的 buffer 批量写入 DB 并清零。

但这带来了一个一致性问题：flush 间隔内，DB 的 `viewCount` 是滞后的。如果 `findBySlug` 只返回 DB 值 +1，那同篇文章被 3 个人先后访问，每人看到的都是 `DB+1`，完全无法体现累积效果。

**解决方案是后端 + 前端三层修复：**

后端：`findBySlug` 的 `redis.incr()` 本身就返回 INCR 后的新值（即上次 flush 以来的累积次数）。把这个 bufferCount 加到 DB 的 viewCount 上返回：`viewCount: db.viewCount + bufferCount`。这样第一个访问者看到 `DB+1`，第二个看到 `DB+2`，第三个看到 `DB+3`。flush 后 buffer 归零，从 `DB(已+3)+1` 继续累加，全程无跳变。

前端第一层——点击即时乐观更新（`ArticleCard.tsx`）：用户点击文章标题 `<Link>` 时，`onClick` 立即通过 `queryClient.setQueriesData` 将列表缓存和详情页缓存中该文章的 `viewCount + 1`。**不等后端 API 响应**，用户感知上就是即时的——列表显示 11，点进去详情页立刻显示 12。

前端第二层——服务端响应校准（`ArticleDetailPage.tsx`）：`findBySlug` 返回真实 viewCount 后，TanStack Query 自动覆盖缓存中的乐观值。如果其他用户也在看同一篇文章（buffer > 1），真实值可能高于乐观值（如 13 > 12），此时自动校准。`useEffect` 再将真实值同步到列表缓存作为兜底。

关于"其他文章的次数要不要也实时更新"：业内做法是**不轮询**。掘金、知乎、Medium 等平台将查看次数视为"低精度高频计数器"，其他文章的计数靠 `refetchOnWindowFocus`（切回标签页时自动 refetch）和自然缓存过期来更新。为所有卡片轮询查看次数会带来大量无意义请求，得不偿失。

---

> **使用建议：** 面试时不要背诵答案，而是理解每个设计决策背后的"为什么"。前端问题侧重"技术选型的理由"和"组件设计的思路"；后端问题侧重"架构演进的理由"和"性能/安全的权衡"；数据库问题侧重"索引设计的原理"和"查询优化的思路"。面试官追问时，尝试从性能、安全、可维护性三个维度展开。祝面试顺利！
