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
} from '../common/constants/error-codes';

/** 单个账号允许同时在线最大设备数量，超过自动淘汰最早登录设备 */
const MAX_DEVICES = 10;

/** Refresh Token 过期时间（单位：秒）7天 */
const RT_TTL = 7 * 24 * 60 * 60;

/**
 * Redis 单设备会话存储结构（Hash结构）
 * tokenHash：refreshToken明文bcrypt哈希，Redis不存明文防泄露
 * deviceName：前端自定义设备名称
 * platform：客户端系统 iOS/Android/macOS/Windows
 * ip：登录客户端IP地址
 * loginAt：会话创建登录时间
 * lastActiveAt：最后一次调用刷新接口的时间
 */
interface SessionMeta {
  tokenHash: string;
  deviceName: string;
  platform: string;
  ip: string;
  loginAt: string;
  lastActiveAt: string;
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
          httpStatus: HttpStatus.CONFLICT,
          detail: `邮箱 ${dto.email} 已被注册`,
        });
      }
      // 用户名冲突
      throw new BusinessException(ErrUsernameTaken, {
        httpStatus: HttpStatus.CONFLICT,
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
    const deviceId = crypto.randomUUID();
    // 生成accessToken、refreshToken（新用户 tokenVersion 为默认值 0）
    const tokens = await this.generateTokens(user.id, user.email, deviceId, 0);
    // 存入Redis会话，注册默认设备信息未知
    await this.storeSession(user.id, deviceId, tokens.refreshToken, {
      deviceName: 'Unknown',
      platform: 'Unknown',
      ip: '',
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
        httpStatus: HttpStatus.UNAUTHORIZED,
      });
    }

    // 比对密码哈希
    const valid = await bcrypt.compare(dto.password, user.passwordHash);
    if (!valid) {
      throw new BusinessException(ErrEmailOrPwdWrong, {
        httpStatus: HttpStatus.UNAUTHORIZED,
      });
    }

    // 账号封禁拦截
    if (user.isBanned) {
      throw new BusinessException(ErrAccountBanned, {
        httpStatus: HttpStatus.FORBIDDEN,
        detail: `用户 ${dto.email} 账号已被封禁`,
      });
    }

    // 校验设备数量上限，超出自动踢最早登录设备
    await this.enforceSessionLimit(user.id);

    // 生成本次登录设备唯一ID
    const deviceId = crypto.randomUUID();
    // 签发双令牌（携带当前 tokenVersion，用于 AccessToken 主动失效检测）
    const tokens = await this.generateTokens(user.id, user.email, deviceId, user.tokenVersion);

    // 解析UA获取设备平台
    const platform = this.parsePlatform(userAgent);
    // 存储当前设备会话到Redis
    await this.storeSession(user.id, deviceId, tokens.refreshToken, {
      deviceName: dto.deviceName || `${platform}`,
      platform,
      ip,
    });

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
    const newDeviceId = crypto.randomUUID();
    const tokens = await this.generateTokens(userId, user.email, newDeviceId, user.tokenVersion);

    // 存储新设备会话
    const platform = this.parsePlatform(userAgent);
    await this.storeSession(userId, newDeviceId, tokens.refreshToken, {
      deviceName: session.deviceName,
      platform,
      ip,
    });
    // 删除旧设备会话，旧RT彻底作废
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
   */
  async getSessions(userId: string) {
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
        };
      })
      .filter((s): s is NonNullable<typeof s> => s !== null);

    // 按最后活跃时间倒序，最新设备排在最上方
    sessions.sort(
      (a, b) =>
        new Date(b.lastActiveAt).getTime() - new Date(a.lastActiveAt).getTime(),
    );
    return sessions;
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
        { sub: userId, email, tokenVersion },
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
   */
  private async storeSession(
    userId: string,
    deviceId: string,
    refreshToken: string,
    meta: { deviceName: string; platform: string; ip: string },
  ) {
    const tokenHash = await bcrypt.hash(refreshToken, 12);
    const now = new Date().toISOString();
    const key = `rt:${userId}:${deviceId}`;

    // 写入设备全部元数据
    await this.redis.hset(key, {
      tokenHash,
      deviceName: meta.deviceName,
      platform: meta.platform,
      ip: meta.ip,
      loginAt: now,
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
}