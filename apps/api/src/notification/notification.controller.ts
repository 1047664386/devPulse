import {
  Controller,
  Get,
  Put,
  Param,
  Query,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
  Sse,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { Observable } from 'rxjs';
import { NotificationService } from './notification.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { CurrentUser } from '../common/decorators/current-user.decorator';

@ApiTags('Notification')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // ─── List notifications ────────────────────────────
  @Get()
  findAll(
    @CurrentUser('id') userId: string,
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
  ) {
    return this.notificationService.findAll(userId, page, pageSize);
  }

  // ─── Get unread count ──────────────────────────────
  @Get('unread-count')
  getUnreadCount(@CurrentUser('id') userId: string) {
    return this.notificationService.getUnreadCount(userId);
  }

  // ─── SSE stream (real-time push) ───────────────────
  // 使用 JwtAuthGuard 鉴权（前端用 fetch + Authorization Header 消费 SSE）
  @Sse('stream')
  stream(@CurrentUser('id') userId: string): Observable<MessageEvent> {
    return this.notificationService.createStream(userId);
  }

  // ─── Mark all as read ──────────────────────────────
  @Put('read-all')
  markAllAsRead(@CurrentUser('id') userId: string) {
    return this.notificationService.markAllAsRead(userId);
  }

  // ─── Mark single as read ──────────────────────────
  @Put(':id/read')
  markAsRead(@Param('id') id: string, @CurrentUser('id') userId: string) {
    return this.notificationService.markAsRead(id, userId);
  }
}
