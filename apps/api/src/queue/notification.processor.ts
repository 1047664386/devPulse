import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { NotificationService } from '../notification/notification.service';

interface NotificationJobData {
  type: string;
  recipientId: string;
  actorId: string;
  articleId?: string;
  commentId?: string;
  content: string;
}

@Processor('notification')
export class NotificationProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationProcessor.name);

  constructor(
    private prisma: PrismaService,
    private notificationService: NotificationService,
  ) {
    super();
  }

  async process(job: Job<NotificationJobData>) {
    const { type, recipientId, actorId, articleId, commentId, content } = job.data;

    // Don't notify self
    if (recipientId === actorId) {
      return;
    }

    const notification = await this.prisma.notification.create({
      data: {
        type: type as never,
        recipientId,
        actorId,
        articleId,
        commentId,
        content,
      },
    });

    // 通过 Redis Pub/Sub 实时推送给在线用户的 SSE 连接
    await this.notificationService.publishNotification(recipientId, notification);
    await this.notificationService.publishUnreadUpdate(recipientId);

    this.logger.debug(`通知已创建并推送: type=${type}, recipient=${recipientId}`);
  }
}
