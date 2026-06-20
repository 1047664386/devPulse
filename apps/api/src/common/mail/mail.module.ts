import { Module } from '@nestjs/common';
import { MailService } from './mail.service';

/**
 * 邮件模块
 * 全局可用，其他模块直接注入 MailService 即可发送邮件
 */
@Module({
  providers: [MailService],
  exports: [MailService],
})
export class MailModule {}
