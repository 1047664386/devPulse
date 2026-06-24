import { Injectable, Logger, HttpStatus, Inject } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Observable } from 'rxjs';
import Redis from 'ioredis';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';
import { BusinessException } from '../common/exceptions/business.exception';
import { ErrNotificationNotFound, ErrNotificationNoPerm } from '../common/constants/error-codes';

// SSE 通知频道前缀
const SSE_CHANNEL_PREFIX = 'sse:notif:';

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name);

  constructor(
    private prisma: PrismaService,
    @InjectQueue('notification') private notificationQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly configService: ConfigService,
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

    // 通知前端更新未读数
    await this.publishUnreadUpdate(userId);

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

    // 通知前端更新未读数
    await this.publishUnreadUpdate(userId);

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

  // ─── SSE: 创建实时通知流 ────────────────────────────
  // 订阅 Redis Pub/Sub 频道，有新通知时实时推送给客户端
  createStream(userId: string): Observable<MessageEvent> {
    const channel = `${SSE_CHANNEL_PREFIX}${userId}`;

    return new Observable<MessageEvent>((subscriber) => {
      // 为每个 SSE 连接创建独立的 Redis 订阅客户端
      // （不能复用主 Redis 客户端，因为 subscribe 会独占连接模式）
      const subscriberClient = new Redis({
        host: this.configService.get<string>('REDIS_HOST', 'localhost'),
        port: this.configService.get<number>('REDIS_PORT', 6379),
        password: this.configService.get<string>('REDIS_PASSWORD') || undefined,
      });

      void subscriberClient.subscribe(channel);

      // 立即推送一次未读数，让前端初始化角标
      void this.publishUnreadUpdate(userId);

      subscriberClient.on('message', (_channel, message) => {
        try {
          const data = JSON.parse(message) as { type?: string };
          subscriber.next({
            type: data.type ?? 'message',
            data: message,
          } as MessageEvent);
        } catch {
          // 非 JSON 消息直接推送
          subscriber.next({ data: message } as MessageEvent);
        }
      });

      // 心跳：每 30 秒发送一次注释行，防止代理超时断开连接
      const heartbeat = setInterval(() => {
        subscriber.next({ data: 'heartbeat' } as MessageEvent);
      }, 30_000);

      // 客户端断开连接时清理资源
      return () => {
        clearInterval(heartbeat);
        void subscriberClient.unsubscribe(channel);
        subscriberClient.disconnect();
        this.logger.log(`用户 ${userId} SSE 连接已断开`);
      };
    });
  }

  // ─── SSE: 通过 Redis Pub/Sub 推送未读数更新 ──────────
  async publishUnreadUpdate(userId: string) {
    const channel = `${SSE_CHANNEL_PREFIX}${userId}`;
    const count = await this.prisma.notification.count({
      where: { recipientId: userId, isRead: false },
    });
    await this.redis.publish(
      channel,
      JSON.stringify({ type: 'unread', count }),
    );
  }

  // ─── SSE: 推送新通知给在线用户（由 Processor 调用）──
  async publishNotification(userId: string, notification: unknown) {
    const channel = `${SSE_CHANNEL_PREFIX}${userId}`;
    await this.redis.publish(
      channel,
      JSON.stringify({ type: 'notification', data: notification }),
    );
  }
}
