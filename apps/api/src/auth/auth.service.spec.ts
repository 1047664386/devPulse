import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { HttpStatus } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { AuthService } from './auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { BusinessException } from '../common/exceptions/business.exception';

// ─── Mock 依赖模块，阻止 Jest 解析 Prisma 生成代码 ──────────
jest.mock('../prisma/prisma.service');
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashed-password'),
  compare: jest.fn(),
}));

// 错误码常量
import {
  ErrEmailRegistered,
  ErrUsernameTaken,
  ErrEmailOrPwdWrong,
  ErrAccountBanned,
  ErrTokenInvalid,
  ErrTokenRevoked,
  ErrTokenReuse,
  ErrNotAuthenticated,
  ErrSessionNotFound,
} from '../common/constants/error-codes';

describe('AuthService', () => {
  let service: AuthService;
  let prisma: any;
  let jwtService: any;
  let configService: any;
  let redis: any;

  const mockUser = {
    id: 'user-1',
    email: 'test@example.com',
    username: 'testuser',
    displayName: 'Test User',
    passwordHash: 'hashed-password',
    isBanned: false,
    tokenVersion: 0,
    roles: [{ role: { name: 'READER' } }],
  };

  beforeEach(async () => {
    prisma = {
      user: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn().mockResolvedValue({}),
      },
      role: { findUnique: jest.fn() },
      userRole: { create: jest.fn() },
      $transaction: jest.fn(),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('mock-token'),
      verify: jest.fn(),
      decode: jest.fn(),
    };

    configService = {
      get: jest.fn((key: string, defaultVal?: string) => {
        const map: Record<string, string> = {
          JWT_SECRET: 'test-jwt-secret',
          JWT_REFRESH_SECRET: 'test-refresh-secret',
          JWT_EXPIRES_IN: '15m',
          JWT_REFRESH_EXPIRES_IN: '7d',
        };
        return map[key] ?? defaultVal;
      }),
    };

    // Redis mock — 支持多设备会话所需的全部方法
    redis = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      hset: jest.fn().mockResolvedValue(1),
      hgetall: jest.fn().mockResolvedValue({}),
      expire: jest.fn().mockResolvedValue(1),
      sadd: jest.fn().mockResolvedValue(1),
      smembers: jest.fn().mockResolvedValue([]),
      srem: jest.fn().mockResolvedValue(1),
      hmget: jest.fn().mockResolvedValue([]),
      pipeline: jest.fn().mockReturnValue({
        hgetall: jest.fn().mockReturnThis(),
        hmget: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: PrismaService, useValue: prisma },
        { provide: JwtService, useValue: jwtService },
        { provide: ConfigService, useValue: configService },
        { provide: REDIS_CLIENT, useValue: redis },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  注册 register
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('register', () => {
    const dto = {
      email: 'new@example.com',
      username: 'newuser',
      password: 'Password123',
      displayName: 'New User',
    };

    it('注册成功 → 返回脱敏用户 + token', async () => {
      prisma.user.findFirst.mockResolvedValue(null);
      prisma.$transaction.mockImplementation(async (fn: any) =>
        fn({
          user: {
            create: jest.fn().mockResolvedValue({ id: 'user-2' }),
            findUnique: jest.fn().mockResolvedValue({ ...mockUser, id: 'user-2' }),
          },
          role: { findUnique: jest.fn().mockResolvedValue({ id: 'role-1', name: 'READER' }) },
          userRole: { create: jest.fn() },
        }),
      );

      const result = await service.register(dto);

      expect(result).toHaveProperty('user');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
      expect(result.user).not.toHaveProperty('passwordHash');
      // 验证 Redis 存储了会话
      expect(redis.hset).toHaveBeenCalled();
      expect(redis.sadd).toHaveBeenCalled();
    });

    it('邮箱冲突 → 抛出 BusinessException(ErrEmailRegistered, 409)', async () => {
      prisma.user.findFirst.mockResolvedValue({ email: dto.email });

      try {
        await service.register(dto);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrEmailRegistered);
        expect((e as BusinessException).getStatus()).toBe(HttpStatus.CONFLICT);
      }
    });

    it('用户名冲突 → 抛出 BusinessException(ErrUsernameTaken, 409)', async () => {
      prisma.user.findFirst.mockResolvedValue({ username: dto.username, email: 'other@example.com' });

      try {
        await service.register(dto);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrUsernameTaken);
      }
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  登录 login
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('login', () => {
    const dto = { email: 'test@example.com', password: 'Password123' };

    it('登录成功 → 返回脱敏用户 + token，并存储设备会话', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      const result = await service.login(dto, '127.0.0.1', 'Mozilla/5.0 Macintosh');

      expect(result.user.email).toBe('test@example.com');
      expect(result.user).not.toHaveProperty('passwordHash');
      expect(result).toHaveProperty('accessToken');
      expect(redis.hset).toHaveBeenCalled();
      expect(redis.sadd).toHaveBeenCalledWith(
        expect.stringContaining('rt:user-1:_devices'),
        expect.any(String),
      );
    });

    it('邮箱不存在 → 抛出 BusinessException(ErrEmailOrPwdWrong, 401)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      try {
        await service.login(dto);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrEmailOrPwdWrong);
        expect((e as BusinessException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });

    it('密码错误 → 抛出 BusinessException(ErrEmailOrPwdWrong, 401)', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      try {
        await service.login(dto);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrEmailOrPwdWrong);
      }
    });

    it('账号封禁 → 抛出 BusinessException(ErrAccountBanned, 403)', async () => {
      prisma.user.findUnique.mockResolvedValue({ ...mockUser, isBanned: true });
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);

      try {
        await service.login(dto);
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrAccountBanned);
        expect((e as BusinessException).getStatus()).toBe(HttpStatus.FORBIDDEN);
      }
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  刷新 Token refresh
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('refresh', () => {
    it('Token 无效 → 抛出 BusinessException(ErrTokenInvalid, 401)', async () => {
      jwtService.verify.mockImplementation(() => { throw new Error('invalid'); });

      try {
        await service.refresh('bad-token');
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrTokenInvalid);
      }
    });

    it('会话不存在 → 抛出 BusinessException(ErrTokenRevoked, 401)', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', deviceId: 'dev-1' });
      redis.hgetall.mockResolvedValue({}); // 空 = 不存在

      try {
        await service.refresh('valid-refresh-token');
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrTokenRevoked);
      }
    });

    it('Token 复用检测 → 抛出 BusinessException(ErrTokenReuse, 401) + 撤销该设备', async () => {
      jwtService.verify.mockReturnValue({ sub: 'user-1', deviceId: 'dev-1' });
      redis.hgetall.mockResolvedValue({
        tokenHash: 'stored-hash',
        deviceName: 'Chrome',
        platform: 'macOS',
        ip: '127.0.0.1',
        loginAt: '2026-01-01T00:00:00.000Z',
        lastActiveAt: '2026-01-01T00:00:00.000Z',
      });
      (bcrypt.compare as jest.Mock).mockResolvedValue(false); // 哈希不匹配 = 复用

      try {
        await service.refresh('reused-token');
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrTokenReuse);
        // 验证仅撤销该设备，不影响其他设备
        expect(redis.del).toHaveBeenCalledWith('rt:user-1:dev-1');
        expect(redis.srem).toHaveBeenCalledWith('rt:user-1:_devices', 'dev-1');
      }
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  登出 logout
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('logout', () => {
    it('指定 deviceId → 仅登出该设备', async () => {
      const result = await service.logout('user-1', 'dev-1');

      expect(redis.del).toHaveBeenCalledWith('rt:user-1:dev-1');
      expect(redis.srem).toHaveBeenCalledWith('rt:user-1:_devices', 'dev-1');
      expect(result).toEqual({ success: true, scope: 'device', deviceId: 'dev-1' });
    });

    it('不传 deviceId → 登出所有设备', async () => {
      redis.smembers.mockResolvedValue(['dev-1', 'dev-2']);

      const result = await service.logout('user-1');

      expect(redis.del).toHaveBeenCalledWith('rt:user-1:dev-1', 'rt:user-1:dev-2');
      expect(redis.del).toHaveBeenCalledWith('rt:user-1:_devices');
      expect(result).toEqual({ success: true, scope: 'all' });
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  获取当前用户 getMe
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('getMe', () => {
    it('用户存在 → 返回脱敏用户', async () => {
      prisma.user.findUnique.mockResolvedValue(mockUser);

      const result = await service.getMe('user-1');

      expect(result.email).toBe('test@example.com');
      expect(result).not.toHaveProperty('passwordHash');
    });

    it('用户不存在 → 抛出 BusinessException(ErrNotAuthenticated, 401)', async () => {
      prisma.user.findUnique.mockResolvedValue(null);

      try {
        await service.getMe('non-existent');
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrNotAuthenticated);
        expect((e as BusinessException).getStatus()).toBe(HttpStatus.UNAUTHORIZED);
      }
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  获取会话列表 getSessions
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('getSessions', () => {
    it('无活跃设备 → 返回空数组', async () => {
      redis.smembers.mockResolvedValue([]);

      const result = await service.getSessions('user-1');
      expect(result).toEqual([]);
    });

    it('多个活跃设备 → 返回会话列表（按 lastActiveAt 降序）', async () => {
      redis.smembers.mockResolvedValue(['dev-1', 'dev-2']);
      const pipelineExec = jest.fn().mockResolvedValue([
        [null, {
          tokenHash: 'h1',
          deviceName: 'Chrome',
          platform: 'macOS',
          ip: '1.1.1.1',
          loginAt: '2026-01-01T00:00:00.000Z',
          lastActiveAt: '2026-01-01T10:00:00.000Z',
        }],
        [null, {
          tokenHash: 'h2',
          deviceName: 'Safari',
          platform: 'iOS',
          ip: '2.2.2.2',
          loginAt: '2026-01-02T00:00:00.000Z',
          lastActiveAt: '2026-01-02T12:00:00.000Z',
        }],
      ]);
      redis.pipeline.mockReturnValue({
        hgetall: jest.fn().mockReturnThis(),
        exec: pipelineExec,
      });

      const result = await service.getSessions('user-1');

      expect(result).toHaveLength(2);
      // 降序：dev-2 更晚活跃
      expect(result[0].deviceId).toBe('dev-2');
      expect(result[1].deviceId).toBe('dev-1');
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  注销指定设备 logoutDevice
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('logoutDevice', () => {
    it('会话存在 → 撤销成功', async () => {
      redis.hgetall.mockResolvedValue({
        tokenHash: 'stored-hash',
        deviceName: 'Chrome',
        platform: 'macOS',
      });

      const result = await service.logoutDevice('user-1', 'dev-1');
      expect(result).toEqual({ success: true });
      expect(redis.del).toHaveBeenCalledWith('rt:user-1:dev-1');
    });

    it('会话不存在 → 抛出 BusinessException(ErrSessionNotFound, 404)', async () => {
      redis.hgetall.mockResolvedValue({});

      try {
        await service.logoutDevice('user-1', 'nonexistent');
        fail('should have thrown');
      } catch (e) {
        expect(e).toBeInstanceOf(BusinessException);
        expect((e as BusinessException).code).toBe(ErrSessionNotFound);
        expect((e as BusinessException).getStatus()).toBe(HttpStatus.NOT_FOUND);
      }
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  全部下线 logoutAll
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('logoutAll', () => {
    it('撤销用户所有设备会话 + 递增 tokenVersion', async () => {
      redis.smembers.mockResolvedValue(['dev-1', 'dev-2', 'dev-3']);

      const result = await service.logoutAll('user-1');

      expect(redis.del).toHaveBeenCalledWith('rt:user-1:dev-1', 'rt:user-1:dev-2', 'rt:user-1:dev-3');
      expect(redis.del).toHaveBeenCalledWith('rt:user-1:_devices');
      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { tokenVersion: { increment: 1 } },
      });
      expect(result).toEqual({ success: true });
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  令牌版本号递增 incrementTokenVersion
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('incrementTokenVersion', () => {
    it('递增用户 tokenVersion → 旧 AccessToken 自动失效', async () => {
      prisma.user.update.mockResolvedValue({ tokenVersion: 1 });

      await service.incrementTokenVersion('user-1');

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { tokenVersion: { increment: 1 } },
      });
    });
  });

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  //  解码 deviceId decodeDeviceId
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  describe('decodeDeviceId', () => {
    it('合法 token → 返回 deviceId', () => {
      jwtService.decode.mockReturnValue({ sub: 'user-1', deviceId: 'dev-42' });

      expect(service.decodeDeviceId('valid-token')).toBe('dev-42');
    });

    it('无效 token → 返回 null', () => {
      jwtService.decode.mockReturnValue(null);

      expect(service.decodeDeviceId('garbage')).toBeNull();
    });

    it('解码异常 → 返回 null', () => {
      jwtService.decode.mockImplementation(() => { throw new Error('boom'); });

      expect(service.decodeDeviceId('bad')).toBeNull();
    });
  });
});
