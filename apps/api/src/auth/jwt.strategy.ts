import { Injectable, HttpStatus } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrNotAuthenticated, ErrAccountBanned } from '../common/constants/error-codes';

export interface JwtPayload {
  sub: string;
  email: string;
  tokenVersion: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    private prisma: PrismaService,
    configService: ConfigService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: configService.get<string>('JWT_SECRET')!,
    });
  }

  async validate(payload: JwtPayload) {
    const user = await this.prisma.user.findUnique({
      where: { id: payload.sub },
      select: {
        id: true, email: true, username: true, displayName: true,
        avatar: true, bio: true, isBanned: true, tokenVersion: true,
        createdAt: true, updatedAt: true,
      },
    });

    if (!user) {
      throw new BusinessException(ErrNotAuthenticated, {
        httpStatus: HttpStatus.UNAUTHORIZED,
        detail: `JWT载荷中用户 ${payload.sub} 不存在`,
      });
    }

    if (user.isBanned) {
      throw new BusinessException(ErrAccountBanned, {
        httpStatus: HttpStatus.FORBIDDEN,
        detail: `用户 ${payload.sub} 账号已被封禁`,
      });
    }

    // tokenVersion 校验：AT 签发时的版本号必须与数据库当前版本一致
    // 修改密码、退出所有设备等安全事件会递增 tokenVersion
    // 不匹配意味着该 AT 在安全事件之前签发，应立即拒绝
    if (payload.tokenVersion !== user.tokenVersion) {
      throw new BusinessException(ErrNotAuthenticated, {
        httpStatus: HttpStatus.UNAUTHORIZED,
        detail: `用户 ${payload.sub} 的令牌版本已过期（tokenVersion 不匹配）`,
      });
    }

    return user;
  }
}
