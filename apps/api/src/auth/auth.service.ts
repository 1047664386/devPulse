import {
  Injectable,
  Inject,
  HttpStatus,
} from '@nestjs/common';
// 读取.env环境变量配置
import { ConfigService } from '@nestjs/config';
// Nest内置JWT工具：生成、手动解析令牌
import { JwtService } from '@nestjs/jwt';
// 密码加密库，用于hash密码、hash refreshToken
import * as bcrypt from 'bcrypt';
// Node.js 内置加密模块，用于生成确定性设备ID哈希
import { createHash } from 'crypto';
// Prisma数据库操作实例
import { PrismaService } from '../prisma/prisma.service';
// 注册接口入参DTO
import { RegisterDto } from './dto/register.dto';
// 登录接口入参DTO
import { LoginDto } from './dto/login.dto';
// Redis客户端类型
import Redis from 'ioredis';
// Redis模块注入标识常量
import { REDIS_CLIENT } from '../common/redis/redis.module';
// 全局统一业务异常类
import { BusinessException } from '../common/exceptions/business.exception';
// 全局错误码常量
import {
  ErrEmailOrPwdWrong,
  ErrAccountBanned,
  ErrTokenInvalid,
  ErrTokenRevoked,
  ErrTokenReuse,
  ErrNotAuthenticated,
  ErrEmailRegistered,
  ErrUsernameTaken,
  ErrDeviceLimit,
  ErrSessionNotFound,
  ErrResetTokenExpired,
  ErrResetTokenInvalid,
  ErrResetTokenUsed,
  ErrResetCooldown,
  ErrMailSendFailed,
} from '../common/constants/error-codes';
import { MailService } from '../common/mail/mail.service';

/** 单个账号允许同时在线最大设备数量，超过自动淘汰最早登录设备 */
const MAX_DEVICES = 10;

/** Refresh Token 过期时间（单位：秒）7天 */
const RT_TTL = 7 * 24 * 60 * 60;

/** 密码重置令牌过期时间（单位：秒）30分钟 */
const RESET_TOKEN_TTL = 30 * 60;

/** 同一邮箱重置邮件冷却时间（单位：秒）60秒 */
const RESET_COOLDOWN = 60;

/**
 * Redis 单设备会话存储结构（Hash结构）
 * tokenHash：refreshToken明文bcrypt哈希，Redis不存明文防泄露
 * deviceName：前端自定义设备名称
 * platform：客户端系统 iOS/Android/macOS/Windows
 * ip：登录客户端IP地址
 * loginAt：会话创建登录时间
 * lastActiveAt：最后一次调用刷新接口的时间
 * fingerprint：前端设备指纹（FNV-1a），同一浏览器多次登录产生相同值
 */
interface SessionMeta {
  tokenHash: string;
  deviceName: string;
  platform: string;
  ip: string;
  loginAt: string;
  lastActiveAt: string;
  fingerprint: string;
}

@Injectable()
export class AuthService {
  constructor(
    // 数据库操作服务
    private prisma: PrismaService,
    // JWT签发、手动解析工具
    private jwtService: JwtService,
    // 读取环境变量
    private configService: ConfigService,
    // 注入Redis客户端，管理多设备会话
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    // 邮件发送服务
    private mailService: MailService,
  ) {}

  /**
   * 用户注册逻辑
   * 1. 校验邮箱/用户名唯一性，重复直接抛异常
   * 2. 密码bcrypt加盐加密
   * 3. 数据库事务：创建用户 + 绑定默认READER角色，保证原子性
   * 4. 生成唯一设备ID、双Token
   * 5. 将当前设备会话存入Redis
   * 6. 返回脱敏用户信息 + accessToken + refreshToken
   */
  async register(dto: RegisterDto) {
    // 查询邮箱或用户名是否已存在
    const existing = await this.prisma.user.findFirst({
      where: { OR: [{ email: dto.email }, { username: dto.username }] },
    });
    if (existing) {
      // 邮箱冲突
      if (existing.email === dto.email) {
        throw new BusinessException(ErrEmailRegistered, {
          httpStatus: HttpStatus.OK,
          detail: `邮箱 ${dto.email} 已被注册`,
        });
      }
      // 用户名冲突
      throw new BusinessException(ErrUsernameTaken, {
        httpStatus: HttpStatus.OK,
        detail: `用户名 ${dto.username} 已被占用`,
      });
    }

    // 密码加密，盐轮次12
    const passwordHash = await bcrypt.hash(dto.password, 12);

    // 事务：创建用户 + 绑定默认角色，失败全部回滚
    const user = await this.prisma.$transaction(async (tx) => {
      // 创建用户基础记录
      const created = await tx.user.create({
        data: {
          email: dto.email,
          username: dto.username,
          displayName: dto.displayName,
          passwordHash,
        },
      });

      // 查询默认普通读者角色
      const readerRole = await tx.role.findUnique({
        where: { name: 'READER' },
      });
      // 存在角色则创建用户-角色中间关联
      if (readerRole) {
        await tx.userRole.create({
          data: { userId: created.id, roleId: readerRole.id },
        });
      }

      // 重新查询用户，关联查询角色完整信息
      const withRoles = await tx.user.findUnique({
        where: { id: created.id },
        include: { roles: { include: { role: true } } },
      });
      // 事务内刚创建，必然存在，非空断言
      return withRoles!;
    });

    // 生成当前登录设备唯一标识
    // 有指纹时使用确定性 ID（userId+指纹），同一浏览器重复注册/登录复用同一会话
    const deviceId = dto.fingerprint
      ? this.deriveDeviceId(user.id, dto.fingerprint)
      : crypto.randomUUID();
    // 生成accessToken、refreshToken（新用户 tokenVersion 为默认值 0）
    const tokens = await this.generateTokens(user.id, user.email, deviceId, 0);
    // 存入Redis会话，注册默认设备信息未知
    await this.storeSession(user.id, deviceId, tokens.refreshToken, {
      deviceName: 'Unknown',
      platform: 'Unknown',
      ip: '',
      fingerprint: dto.fingerprint || '',
    });

    // 返回脱敏用户 + 双令牌
    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  /**
   * 用户账号密码登录
   * 1. 根据邮箱查询用户，校验账号密码哈希
   * 2. 拦截封禁账号
   * 3. 校验在线设备上限，超限自动淘汰最早登录设备
   * 4. 生成新设备唯一ID、双Token
   * 5. 解析UA识别客户端系统，存入Redis会话元数据
   * @param dto 登录账号密码
   * @param ip 客户端登录IP
   * @param userAgent 浏览器/设备UA标识
   */
  async login(dto: LoginDto, ip = '', userAgent = '') {
    // 根据邮箱查询用户，同时关联角色
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { roles: { include: { role: true } } },
    });

    // 用户不存在，统一返回账号密码错误，防止暴力枚举邮箱
    if (!user) {
      throw new BusinessException(ErrEmailOrPwdWrong, {
        httpStatus: HttpStatus.OK,
      });
    }

    // 比对密码哈希
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new BusinessException(ErrEmailOrPwdWrong, {
        httpStatus: HttpStatus.OK,
      });
    }

    // 账号封禁拦截
    if (user.isBanned) {
      throw new BusinessException(ErrAccountBanned, {
        httpStatus: HttpStatus.OK,
        detail: `用户 ${dto.email} 账号已被封禁`,
      });
    }

    // 校验设备数量上限，超出自动踢最早登录设备
    await this.enforceSessionLimit(user.id);

    // 生成本次登录设备唯一ID
    // 有指纹时使用确定性 ID（userId+指纹），同一浏览器重复登录复用同一会话条目（UPDATE）
    // 无指纹时（旧客户端/APP端）退回随机 UUID，每次登录新增独立会话
    const deviceId = dto.fingerprint
      ? this.deriveDeviceId(user.id, dto.fingerprint)
      : crypto.randomUUID();
    // 签发双令牌（携带当前 tokenVersion，用于 AccessToken 主动失效检测）
    const tokens = await this.generateTokens(user.id, user.email, deviceId, user.tokenVersion);

    // 解析UA获取设备平台
    const platform = this.parsePlatform(userAgent);
    // 存储当前设备会话到Redis
    // 确定性 deviceId 时 HSET 天然覆盖旧值 → 同一浏览器反复登录只产生一条会话
    await this.storeSession(user.id, deviceId, tokens.refreshToken, {
      deviceName: dto.deviceName || `${platform}`,
      platform,
      ip,
      fingerprint: dto.fingerprint || '',
    });

    // 兜底清理：按 fingerprint 移除可能残留的旧格式（随机 UUID）孤儿会话
    // 场景：用户之前用旧客户端（无 fingerprint）登录产生的随机 deviceId 会话，
    // 后来升级后用 fingerprint 登录产生了确定性 deviceId，旧的随机会话滞留 Redis
    if (dto.fingerprint) {
      await this.revokeLegacySessions(user.id, deviceId, dto.fingerprint);
    }

    return {
      user: this.sanitizeUser(user),
      ...tokens,
    };
  }

  /**
   * 使用refreshToken刷新accessToken（令牌轮换安全机制）
   * 安全机制：令牌重用劫持检测、多设备会话隔离、旧RT永久失效
   * 1. 校验refreshToken签名、有效期
   * 2. 根据userId+deviceId读取Redis会话
   * 3. 比对前端RT与Redis存储哈希，不一致判定令牌被盗刷
   * 4. 校验用户存在、账号未封禁
   * 5. 生成全新deviceId与双Token，销毁旧设备会话
   * @param refreshToken 前端长期刷新令牌
   * @param ip 当前客户端IP
   * @param userAgent 客户端UA
   */
  async refresh(refreshToken: string, ip = '', userAgent = '') {
    let payload: { sub: string; deviceId: string };
    try {
      // 使用刷新令牌专属密钥解析RT
      payload = this.jwtService.verify(refreshToken, {
        secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
      });
    } catch {
      // 签名错误、过期、格式错误统一抛出令牌无效
      throw new BusinessException(ErrTokenInvalid, {
        httpStatus: HttpStatus.UNAUTHORIZED,
      });
    }

    const { sub: userId, deviceId } = payload;
    // 查询该用户下对应设备会话
    const session = await this.getSession(userId, deviceId);

    // 会话不存在：已手动登出/过期自动删除
    if (!session) {
      throw new BusinessException(ErrTokenRevoked, {
        httpStatus: HttpStatus.UNAUTHORIZED,
        detail: `用户 ${userId} 的设备 ${deviceId} 会话已被撤销或过期`,
      });
    }

    // 令牌重用检测：旧RT与Redis存储哈希不匹配，判定被盗刷
    const valid = await bcrypt.compare(refreshToken, session.tokenHash);
    if (!valid) {
      // 销毁当前被盗设备会话，强制下线
      await this.revokeSession(userId, deviceId);
      throw new BusinessException(ErrTokenReuse, {
        httpStatus: HttpStatus.UNAUTHORIZED,
        detail: `检测到令牌重用，用户 ${userId} 设备 ${deviceId} 的会话已撤销`,
      });
    }

    // 校验用户状态
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
    });
    if (!user || user.isBanned) {
      throw new BusinessException(ErrNotAuthenticated, {
        httpStatus: HttpStatus.UNAUTHORIZED,
        detail: `用户 ${userId} 不存在或已被封禁`,
      });
    }

    // 令牌轮换：生成全新设备ID，旧RT永久失效
    // 有指纹时使用确定性 ID，同一浏览器刷新令牌后 deviceId 不变，HSET 覆盖旧会话
    // 无指纹时退回随机 UUID，每次刷新产生新 deviceId（旧行为）
    const newDeviceId = session.fingerprint
      ? this.deriveDeviceId(userId, session.fingerprint)
      : crypto.randomUUID();
    const tokens = await this.generateTokens(userId, user.email, newDeviceId, user.tokenVersion);

    // 存储新设备会话（确定性 ID 时覆盖旧记录，随机 ID 时新增记录）
    const platform = this.parsePlatform(userAgent);
    await this.storeSession(userId, newDeviceId, tokens.refreshToken, {
      deviceName: session.deviceName,
      platform,
      ip,
      fingerprint: session.fingerprint || '',
    });
    // 删除旧设备会话，旧RT彻底作废
    // 确定性 ID 时 newDeviceId === deviceId，此处为幂等 no-op
    await this.revokeSession(userId, deviceId);

    // 仅返回新双Token
    return tokens;
  }

  /**
   * 登出接口
   * @param userId 当前登录用户ID
   * @param deviceId 可选：传入则仅下线单设备；不传则全部设备下线
   */
  async logout(userId: string, deviceId?: string) {
    if (deviceId) {
      // 仅销毁当前指定设备会话
      await this.revokeSession(userId, deviceId);
      return { success: true, scope: 'device' as const, deviceId };
    }
    // 销毁该用户全部设备会话
    await this.revokeAllSessions(userId);
    return { success: true, scope: 'all' as const };
  }

  /**
   * 强制全部设备下线
   * 使用场景：修改密码、管理员封禁账号、用户手动点击退出所有设备
   * 同时递增 tokenVersion，使所有已签发的 AccessToken 立即失效
   */
  async logoutAll(userId: string) {
    await this.revokeAllSessions(userId);
    await this.incrementTokenVersion(userId);
    return { success: true };
  }

  /**
   * 递增用户令牌版本号，使该用户所有已签发的 AccessToken 立即失效
   * JwtStrategy 会在每次请求时比对 token 中的 tokenVersion 与数据库值
   * 触发场景：修改密码、退出所有设备等安全事件
   */
  async incrementTokenVersion(userId: string) {
    await this.prisma.user.update({
      where: { id: userId },
      data: { tokenVersion: { increment: 1 } },
    });
  }

  /**
   * 仅解码refreshToken提取deviceId，不校验签名
   * 登出接口前端仅传入RT，后端提取设备ID用于销毁单设备会话
   */
  decodeDeviceId(refreshToken: string): string | null {
    try {
      const payload = this.jwtService.decode(refreshToken) as {
        deviceId?: string;
      } | null;
      return payload?.deviceId ?? null;
    } catch {
      return null;
    }
  }

  /**
   * 获取当前登录用户完整信息（携带角色）
   * @param userId JWT解析出的用户ID
   */
  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { roles: { include: { role: true } } },
    });
    if (!user) {
      throw new BusinessException(ErrNotAuthenticated, {
        httpStatus: HttpStatus.UNAUTHORIZED,
      });
    }
    // 脱敏移除密码哈希后返回
    return this.sanitizeUser(user);
  }

  /**
   * 查询用户所有活跃登录设备会话列表
   * 用于个人中心「登录设备管理」页面展示
   *
   * 去重策略（兼容旧数据迁移）：
   * - 新会话使用确定性 deviceId（userId+fingerprint），天然无重复
   * - 旧会话使用随机 UUID，可能存在同一浏览器的多条孤儿记录
   * - 按 fingerprint 分组，同一指纹仅保留最近活跃的一条，其余自动清理
   */
  async getSessions(userId: string, currentDeviceId?: string | null) {
    // 读取该用户所有设备ID集合
    const deviceIds = await this.redis.smembers(`rt:${userId}:_devices`);
    if (deviceIds.length === 0) return [];

    // Redis管道批量查询所有设备元数据，减少网络IO次数
    const pipeline = this.redis.pipeline();
    for (const did of deviceIds) {
      pipeline.hgetall(`rt:${userId}:${did}`);
    }
    const results = await pipeline.exec();

    // 组装会话列表，过滤无效过期数据
    const sessions = deviceIds
      .map((deviceId, i) => {
        const data = results?.[i]?.[1] as Record<string, string> | null;
        if (!data || !data.tokenHash) return null;
        return {
          deviceId,
          deviceName: data.deviceName || 'Unknown',
          platform: data.platform || 'Unknown',
          ip: data.ip || '',
          loginAt: data.loginAt || '',
          lastActiveAt: data.lastActiveAt || '',
          fingerprint: data.fingerprint || '',
          isCurrent: deviceId === currentDeviceId,
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // ── 按 fingerprint 去重（同一指纹仅保留最近活跃的一条） ──
    // 确定性 deviceId 的会话天然唯一，此步骤主要清理旧格式随机 UUID 孤儿会话
    const fpLatest = new Map<string, (typeof sessions)[0]>();
    const noFp: typeof sessions = [];

    for (const s of sessions) {
      if (s.fingerprint) {
        const existing = fpLatest.get(s.fingerprint);
        if (!existing || new Date(s.lastActiveAt).getTime() > new Date(existing.lastActiveAt).getTime()) {
          fpLatest.set(s.fingerprint, s);
        }
      } else {
        noFp.push(s);
      }
    }

    // 清理同一 fingerprint 下的冗余旧会话
    const keepIds = new Set([
      ...Array.from(fpLatest.values()).map((s) => s.deviceId),
      ...noFp.map((s) => s.deviceId),
    ]);
    for (const s of sessions) {
      if (!keepIds.has(s.deviceId)) {
        await this.revokeSession(userId, s.deviceId);
      }
    }

    // 合并去重后的会话列表
    const deduped = [...fpLatest.values(), ...noFp];

    // 按最后活跃时间倒序，最新设备排在最上方
    deduped.sort(
      (a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
    );
    return deduped;
  }

  /**
   * 用户手动踢除指定一台登录设备
   * @param userId 用户ID
   * @param deviceId 需要下线的设备唯一标识
   */
  async logoutDevice(userId: string, deviceId: string) {
    const session = await this.getSession(userId, deviceId);
    if (!session) {
      throw new BusinessException(ErrSessionNotFound, {
        httpStatus: HttpStatus.NOT_FOUND,
        detail: `用户 ${userId} 设备 ${deviceId} 的会话不存在`,
      });
    }
    await this.revokeSession(userId, deviceId);
    return { success: true };
  }

  /**
   * 忘记密码 — 发送重置邮件
   *
   * 流程：
   * 1. 检查冷却期（同一邮箱60秒内不能重复发送）
   * 2. 查询用户是否存在
   * 3. 用户存在 → 生成 JWT 重置令牌 → await 发送邮件
   *    - 发送成功 → 设置冷却期 + 返回成功
   *    - 发送失败 → 不设冷却期 + 抛 ErrMailSendFailed（用户可立即重试）
   * 4. 用户不存在 → 设置冷却期 + 返回统一成功消息（防邮箱枚举）
   *
   * 安全设计：
   * - 邮箱不存在时返回与成功相同的消息 → 不泄露用户注册信息
   * - 邮件发送失败时不设冷却期 → 允许用户立即重试
   * - 邮箱不存在时仍设冷却期 → 防止通过频率差异枚举邮箱
   */
  async forgotPassword(email: string) {
    // 1. 冷却期检查：同一邮箱60秒内只能发一次
    const cooldownKey = `pwd_reset_cd:${email}`;
    const cooldown = await this.redis.get(cooldownKey);
    if (cooldown) {
      throw new BusinessException(ErrResetCooldown, {
        httpStatus: HttpStatus.OK,
        detail: `邮箱 ${email} 在冷却期内，剩余 ${cooldown} 秒`,
      });
    }

    // 2. 查询用户
    const user = await this.prisma.user.findUnique({
      where: { email },
    });

    // 3. 用户存在 → 生成令牌 + 发送邮件
    if (user) {
      const resetToken = await this.jwtService.signAsync(
        { sub: user.id, purpose: 'password-reset' },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: '30m',
        } as any,
      );

      // 存入 Redis：标记令牌状态为 "unused"，30分钟过期
      const tokenKey = `pwd_reset:${user.id}`;
      await this.redis.set(tokenKey, 'unused', 'EX', RESET_TOKEN_TTL);

      // 构造前端重置链接
      const frontendUrl = this.configService.get<string>('FRONTEND_URL', 'http://localhost:5173');
      const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

      // 同步等待邮件发送结果（不再 fire-and-forget）
      try {
        await this.mailService.sendResetPasswordEmail(email, resetUrl);
        // 发送成功 → 设置冷却期
        await this.redis.set(cooldownKey, String(RESET_COOLDOWN), 'EX', RESET_COOLDOWN);
        return { sent: true, message: '如果该邮箱已注册，重置邮件将在几分钟内送达' };
      } catch {
        // 发送失败 → 不设置冷却期，允许用户立即重试
        // 清理已生成的令牌，避免残留
        await this.redis.del(tokenKey);
        throw new BusinessException(ErrMailSendFailed, {
          httpStatus: HttpStatus.OK,
          detail: `邮箱 ${email} 重置邮件发送失败`,
        });
      }
    }

    // 4. 用户不存在 → 设置冷却期 + 返回统一成功消息（防邮箱枚举）
    await this.redis.set(cooldownKey, String(RESET_COOLDOWN), 'EX', RESET_COOLDOWN);
    return { sent: true, message: '如果该邮箱已注册，重置邮件将在几分钟内送达' };
  }

  /**
   * 重置密码 — 验证令牌并更新密码
   *
   * 流程：
   * 1. 校验重置令牌签名和有效期
   * 2. 检查令牌用途是否为 password-reset
   * 3. 从 Redis 查询令牌状态（unused → 可以使用）
   * 4. 更新密码（bcrypt 加密）
   * 5. 将 Redis 令牌标记为 used（防止重复使用）
   * 6. 递增 tokenVersion + 清除所有设备会话 → 强制全部设备重新登录
   *
   * 安全设计：
   * - 令牌使用一次后立即标记为 used → 防止重放攻击
   * - 重置密码后强制全部设备下线 → 新密码生效后旧会话立即失效
   */
  async resetPassword(token: string, newPassword: string) {
    // 1. 校验 JWT 令牌
    let payload: { sub: string; purpose: string };
    try {
      payload = this.jwtService.verify(token, {
        secret: this.configService.get<string>('JWT_SECRET'),
      });
    } catch {
      throw new BusinessException(ErrResetTokenExpired, {
        httpStatus: HttpStatus.OK,
        detail: '重置令牌签名校验失败或已过期',
      });
    }

    // 2. 校验令牌用途
    if (payload.purpose !== 'password-reset') {
      throw new BusinessException(ErrResetTokenInvalid, {
        httpStatus: HttpStatus.OK,
        detail: `令牌用途不匹配: ${payload.purpose}`,
      });
    }

    const userId = payload.sub;

    // 3. 查询 Redis 令牌状态
    const tokenKey = `pwd_reset:${userId}`;
    const status = await this.redis.get(tokenKey);

    if (!status) {
      // Redis 中不存在 → 令牌已过期或从未生成
      throw new BusinessException(ErrResetTokenExpired, {
        httpStatus: HttpStatus.OK,
      });
    }

    if (status === 'used') {
      // 令牌已使用过 → 防止重放攻击
      throw new BusinessException(ErrResetTokenUsed, {
        httpStatus: HttpStatus.OK,
      });
    }

    // 4. 查询用户
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new BusinessException(ErrResetTokenInvalid, {
        httpStatus: HttpStatus.OK,
      });
    }

    // 5. 更新密码
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // 6. 标记令牌已使用
    await this.redis.set(tokenKey, 'used', 'EX', RESET_TOKEN_TTL);

    // 7. 递增 tokenVersion + 清除全部设备会话 → 强制所有设备重新登录
    await this.revokeAllSessions(userId);
    await this.incrementTokenVersion(userId);

    return { success: true, message: '密码已重置，请使用新密码登录' };
  }

  // ====================== 私有工具方法 ======================
  /**
   * 并行生成 accessToken + refreshToken
   * accessToken载荷：{sub:用户ID, email, tokenVersion}，供JwtStrategy接口鉴权使用
   *   - tokenVersion：令牌版本号，安全事件（改密/全设备下线）时递增，旧AT自动失效
   * refreshToken载荷：{sub:用户ID, deviceId}，用于会话设备管理
   */
  private async generateTokens(
    userId: string,
    email: string,
    deviceId: string,
    tokenVersion: number,
  ) {
    const [accessToken, refreshToken] = await Promise.all([
      // 短期访问令牌，业务接口鉴权
      this.jwtService.signAsync(
        { sub: userId, email, tokenVersion, deviceId },
        {
          secret: this.configService.get<string>('JWT_SECRET'),
          expiresIn: this.configService.get<string>('JWT_EXPIRES_IN', '15m'),
        } as any,
      ),
      // 长期刷新令牌，会话刷新、设备管理
      this.jwtService.signAsync(
        { sub: userId, deviceId },
        {
          secret: this.configService.get<string>('JWT_REFRESH_SECRET'),
          expiresIn: this.configService.get<string>(
            'JWT_REFRESH_EXPIRES_IN',
            '7d',
          ),
        } as any,
      ),
    ]);
    return { accessToken, refreshToken };
  }

  /**
   * 存储单台设备会话至Redis
   * 1. refreshToken加密为hash存入Hash结构，不存明文
   * 2. 设置整条Hash过期时间7天
   * 3. 将deviceId加入用户设备集合，用于批量查询/删除
   *
   * 确定性 deviceId 场景下（userId+fingerprint），同一浏览器多次
   * 登录/刷新只会 HSET 覆盖同一条 Hash，天然实现 UPDATE 语义。
   */
  private async storeSession(
    userId: string,
    deviceId: string,
    refreshToken: string,
    meta: { deviceName: string; platform: string; ip: string; fingerprint?: string },
  ) {
    const tokenHash = await bcrypt.hash(refreshToken, 12);
    const now = new Date().toISOString();
    const key = `rt:${userId}:${deviceId}`;

    // 判断是否为已有会话更新（确定性 deviceId 覆盖场景）
    const existingLoginAt = await this.redis.hget(key, 'loginAt');

    // 写入设备全部元数据
    await this.redis.hset(key, {
      tokenHash,
      deviceName: meta.deviceName,
      platform: meta.platform,
      ip: meta.ip,
      fingerprint: meta.fingerprint || '',
      // 已存在时保留原始 loginAt（首次登录时间），新建时使用当前时间
      loginAt: existingLoginAt || now,
      lastActiveAt: now,
    });
    // 设置该设备会话整体过期时间
    await this.redis.expire(key, RT_TTL);
    // 将设备ID加入用户设备集合
    await this.redis.sadd(`rt:${userId}:_devices`, deviceId);
  }

  /**
   * 根据用户ID+设备ID读取单台设备会话元数据
   * 返回null = 会话不存在/已过期/已登出
   */
  private async getSession(
    userId: string,
    deviceId: string,
  ): Promise<SessionMeta | null> {
    const data = await this.redis.hgetall(`rt:${userId}:${deviceId}`);
    if (!data || !data.tokenHash) return null;
    return data as unknown as SessionMeta;
  }

  /**
   * 销毁单台设备会话
   * 1. 删除设备Hash详情
   * 2. 从用户设备集合移除该deviceId
   */
  private async revokeSession(userId: string, deviceId: string) {
    await this.redis.del(`rt:${userId}:${deviceId}`);
    await this.redis.srem(`rt:${userId}:_devices`, deviceId);
  }

  /**
   * 销毁该用户全部设备会话
   * 1. 批量删除所有设备Hash
   * 2. 删除设备ID集合
   */
  private async revokeAllSessions(userId: string) {
    const deviceIds = await this.redis.smembers(`rt:${userId}:_devices`);
    if (deviceIds.length > 0) {
      // 拼接所有设备key批量删除
      const keys = deviceIds.map((did) => `rt:${userId}:${did}`);
      await this.redis.del(...keys);
    }
    // 删除设备集合
    await this.redis.del(`rt:${userId}:_devices`);
  }

  /**
   * 设备数量上限控制
   * 在线设备超过MAX_DEVICES时，自动淘汰最早登录的设备
   */
  private async enforceSessionLimit(userId: string) {
    const deviceIds = await this.redis.smembers(`rt:${userId}:_devices`);
    // 未达到上限无需处理
    if (deviceIds.length < MAX_DEVICES) return;

    // 管道批量获取每台设备登录时间
    const pipeline = this.redis.pipeline();
    for (const did of deviceIds) {
      pipeline.hmget(`rt:${userId}:${did}`, 'loginAt');
    }
    const results = await pipeline.exec();

    // 根据登录时间升序排序，最早登录排在前面
    const sorted = deviceIds
      .map((did, i) => ({
        did,
        loginAt: (results?.[i]?.[1] as unknown as string[])?.[0] || '',
      }))
      .sort((a, b) => a.loginAt.localeCompare(b.loginAt));

    // 计算需要淘汰的设备数量
    const evictCount = sorted.length - MAX_DEVICES + 1;
    // 依次销毁最早登录设备
    for (let i = 0; i < evictCount; i++) {
      await this.revokeSession(userId, sorted[i].did);
    }
  }

  /**
   * 解析User-Agent字符串，识别客户端操作系统平台
   */
  private parsePlatform(userAgent: string): string {
    if (!userAgent) return 'Unknown';
    if (/iPhone|iPad/.test(userAgent)) return 'iOS';
    if (/Android/.test(userAgent)) return 'Android';
    if (/Macintosh/.test(userAgent)) return 'macOS';
    if (/Windows/.test(userAgent)) return 'Windows';
    if (/Linux/.test(userAgent)) return 'Linux';
    return 'Unknown';
  }

  /**
   * 用户信息脱敏工具
   * 运行时解构剔除passwordHash敏感字段，Omit仅用于TS类型约束
   */
  private sanitizeUser<T extends { passwordHash: string }>(
    user: T,
  ): Omit<T, 'passwordHash'> {
    // JS解构运行时删除密码哈希
    const { passwordHash: _ph, ...result } = user;
    // as Omit 仅给TS做类型提示，不改变运行逻辑
    return result as Omit<T, 'passwordHash'>;
  }

  /**
   * 根据 userId + fingerprint 生成确定性设备ID
   *
   * 同一浏览器（相同 fingerprint）对同一用户始终产生相同的 deviceId，
   * 使得 Redis HSET 天然覆盖旧值 → UPDATE 语义，无需显式查找+更新。
   *
   * 算法：SHA-256(userId:fingerprint) → 取前 32 位十六进制
   * （使用 Web Crypto 不可用时的 FNV-1a 降级方案）
   */
  private deriveDeviceId(userId: string, fingerprint: string): string {
    const raw = `${userId}:${fingerprint}`;
    return createHash('sha256').update(raw).digest('hex').slice(0, 32);
  }

  /**
   * 清理旧格式（随机 UUID）孤儿会话
   *
   * 迁移兼容：系统升级到 fingerprint 方案后，Redis 中可能残留旧格式的
   * 随机会话。此方法遍历所有会话，找到与当前 fingerprint 相同但没有
   * 使用确定性 deviceId 的旧条目并撤销。
   *
   * 确定性 deviceId 的新会话不受影响（currentDeviceId 已排除）。
   *
   * @param userId 用户 ID
   * @param currentDeviceId 当前确定性 deviceId（不会被清理）
   * @param fingerprint 当前设备指纹
   */
  private async revokeLegacySessions(
    userId: string,
    currentDeviceId: string,
    fingerprint: string,
  ) {
    const deviceIds = await this.redis.smembers(`rt:${userId}:_devices`);
    if (deviceIds.length <= 1) return;

    const pipeline = this.redis.pipeline();
    for (const did of deviceIds) {
      if (did === currentDeviceId) {
        pipeline.hgetall(`rt:${userId}:${did}`); // 占位，保持索引对齐
      } else {
        pipeline.hmget(`rt:${userId}:${did}`, 'fingerprint');
      }
    }
    const results = await pipeline.exec();
    if (!results) return;

    let idx = 0;
    for (const did of deviceIds) {
      const result = results[idx++];
      if (!result || did === currentDeviceId) continue;

      const [, values] = result;
      const sessionFp = Array.isArray(values) ? values[0] : '';

      // 清理同 fingerprint 的旧随机会话（deviceId 不等于确定性 ID 但指纹相同）
      if (sessionFp && sessionFp === fingerprint) {
        await this.revokeSession(userId, did);
      }
    }
  }
}