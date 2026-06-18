import { Injectable, Logger, HttpStatus } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrNotificationNotFound, ErrNotificationNoPerm } from '../common/constants/error-codes';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('notification') private notificationQueue: Queue,
  ) {}

  // ─── Find all notifications for a user ─────────────
  async findAll(userId: string, page: number, pageSize: number) {
    const where = { recipientId: userId };

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        include: {
          actor: {
            select: {
              id: true,
              username: true,
              displayName: true,
              avatar: true,
              bio: true,
              roles: {
                select: {
                  role: { select: { id: true, name: true, isSystem: true } },
                },
              },
              createdAt: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { ...where, isRead: false } }),
    ]);

    const totalPages = Math.ceil(total / pageSize);

    return {
      data,
      meta: { page, pageSize, total, totalPages, unreadCount },
    };
  }

  // ─── Mark a single notification as read ────────────
  async markAsRead(notificationId: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({
      where: { id: notificationId },
    });

    if (!notification) {
      throw new BusinessException(ErrNotificationNotFound, { httpStatus: HttpStatus.NOT_FOUND });
    }

    if (notification.recipientId !== userId) {
      throw new BusinessException(ErrNotificationNoPerm, { httpStatus: HttpStatus.FORBIDDEN });
    }

    await this.prisma.notification.update({
      where: { id: notificationId },
      data: { isRead: true },
    });

    return { isRead: true };
  }

  // ─── Mark all notifications as read ────────────────
  async markAllAsRead(userId: string) {
    const result = await this.prisma.notification.updateMany({
      where: {
        recipientId: userId,
        isRead: false,
      },
      data: { isRead: true },
    });

    return { updatedCount: result.count };
  }

  // ─── Get unread count ──────────────────────────────
  async getUnreadCount(userId: string) {
    const count = await this.prisma.notification.count({
      where: {
        recipientId: userId,
        isRead: false,
      },
    });

    return { count };
  }

  // ─── Dispatch notification via BullMQ ────────────────
  async dispatch(data: {
    type: string;
    recipientId: string;
    actorId: string;
    articleId?: string;
    commentId?: string;
    content: string;
  }) {
    // Don't notify self
    if (data.recipientId === data.actorId) return;

    await this.notificationQueue.add('create-notification', data, {
      attempts: 3,
      backoff: { type: 'exponential', delay: 1000 },
      removeOnComplete: { count: 100 },
    });
    this.logger.debug(`Queued ${data.type} notification for user ${data.recipientId}`);
  }
}
