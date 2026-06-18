import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, OnModuleInit } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Job, Queue } from 'bullmq';
import Redis from 'ioredis';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CLIENT } from '../common/redis/redis.module';

@Processor('view-count')
export class ViewCountProcessor extends WorkerHost implements OnModuleInit {
  constructor(
    private prisma: PrismaService,
    @InjectQueue('view-count') private viewCountQueue: Queue,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {
    super();
  }

  async onModuleInit() {
    // Add a repeatable job that fires every 60 seconds
    await this.viewCountQueue.add(
      'flush',
      {},
      {
        repeat: { every: 60_000 },
        jobId: 'view-count-flush',
      },
    );
  }

  async process(_job: Job) {
    // Get all buffered view counts from Redis
    const keys = await this.redis.keys('view_buffer:*');
    if (keys.length === 0) {
      return;
    }

    for (const key of keys) {
      const articleId = key.replace('view_buffer:', '');
      const count = parseInt((await this.redis.get(key)) || '0', 10);

      if (count > 0) {
        await this.prisma.$executeRawUnsafe(
          `UPDATE articles SET view_count = view_count + $1 WHERE id = $2`,
          count,
          articleId,
        );
      }

      await this.redis.del(key);
    }
  }
}
