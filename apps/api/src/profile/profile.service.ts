import {
  Injectable,
  Inject,
  forwardRef,
  HttpStatus,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { AuthService } from '../auth/auth.service';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { UpdatePasswordDto } from './dto/update-password.dto';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrUserNotFound, ErrPasswordWrong } from '../common/constants/error-codes';

@Injectable()
export class ProfileService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => AuthService))
    private authService: AuthService,
  ) {}

  // ─── Get Current User Profile ────────────────────────

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        roles: {
          select: {
            role: { select: { id: true, name: true } },
          },
        },
        isBanned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new BusinessException(ErrUserNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    return user;
  }

  // ─── Update Profile ──────────────────────────────────

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const user = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.displayName !== undefined && { displayName: dto.displayName }),
        ...(dto.bio !== undefined && { bio: dto.bio }),
        ...(dto.avatar !== undefined && { avatar: dto.avatar }),
      },
      select: {
        id: true,
        email: true,
        username: true,
        displayName: true,
        avatar: true,
        bio: true,
        roles: {
          select: {
            role: { select: { id: true, name: true } },
          },
        },
        isBanned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return user;
  }

  // ─── Update Password ─────────────────────────────────

  async updatePassword(userId: string, dto: UpdatePasswordDto) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, passwordHash: true },
    });

    if (!user) {
      throw new BusinessException(ErrUserNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    const isValid = await bcrypt.compare(dto.currentPassword, user.passwordHash);
    if (!isValid) {
      throw new BusinessException(ErrPasswordWrong, { httpStatus: HttpStatus.BAD_REQUEST });
    }

    const passwordHash = await bcrypt.hash(dto.newPassword, 12);

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // 修改密码后强制所有设备下线（安全事件）
    await this.authService.logoutAll(userId);

    return { success: true };
  }

  // ─── Get Bookmarks ───────────────────────────────────

  async getBookmarks(userId: string, page: number, pageSize: number) {
    const where = {
      userId,
      article: {
        status: 'PUBLISHED' as const,
        deletedAt: null,
      },
    };

    const [data, total] = await Promise.all([
      this.prisma.bookmark.findMany({
        where,
        select: {
          id: true,
          createdAt: true,
          article: {
            select: {
              id: true,
              title: true,
              slug: true,
              summary: true,
              coverImage: true,
              viewCount: true,
              likeCount: true,
              commentCount: true,
              readTimeMinutes: true,
              publishedAt: true,
              createdAt: true,
              author: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  avatar: true,
                },
              },
              tags: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  color: true,
                },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.bookmark.count({ where }),
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
