import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationProcessor } from './notification.processor';
import { ViewCountProcessor } from './view-count.processor';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notification' }),
    BullModule.registerQueue({ name: 'view-count' }),
  ],
  providers: [NotificationProcessor, ViewCountProcessor],
})
export class QueueModule {}
