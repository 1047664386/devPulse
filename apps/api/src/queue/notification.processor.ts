import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';

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
  constructor(private prisma: PrismaService) {
    super();
  }

  async process(job: Job<NotificationJobData>) {
    const { type, recipientId, actorId, articleId, commentId, content } = job.data;

    // Don't notify self
    if (recipientId === actorId) {
      return;
    }

    await this.prisma.notification.create({
      data: {
        type: type as any,
        recipientId,
        actorId,
        articleId,
        commentId,
        content,
      },
    });
  }
}
