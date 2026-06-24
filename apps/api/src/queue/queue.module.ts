import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { NotificationProcessor } from './notification.processor';
import { ViewCountProcessor } from './view-count.processor';
import { NotificationModule } from '../notification/notification.module';

@Module({
  imports: [
    BullModule.registerQueue({ name: 'notification' }),
    BullModule.registerQueue({ name: 'view-count' }),
    NotificationModule, // NotificationProcessor 依赖 NotificationService
  ],
  providers: [NotificationProcessor, ViewCountProcessor],
})
export class QueueModule {}
