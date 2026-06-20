import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

/**
 * 邮件发送服务
 *
 * 模式判定：
 *   - 生产模式：SMTP_HOST + SMTP_USER + SMTP_PASS 均已配置 → 真实 SMTP 发送
 *   - 开发模式：SMTP_HOST 为 127.0.0.1/localhost 或未配置认证信息 → 连接本地 Mailpit
 *
 * 开发模式下，发送前会把重置链接打印到终端日志辅助调试；但若 SMTP 连接失败仍会
 * 抛出错误（不再静默吞掉），以便上层走「失败不设冷却 + 返回错误」的逻辑，前端能
 * 看到失败提示。如需真实收到邮件，请先启动 Mailpit：
 *   docker compose up -d mailpit   （Web UI 查看邮件：http://localhost:8025）
 *
 * 注意：SMTP_HOST 务必使用 127.0.0.1 而非 localhost，否则 macOS 下 localhost 会被
 * 解析为 IPv6 ::1，连接 Mailpit 时报 ECONNREFUSED ::1:1025。
 */
@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;
  /** 是否为开发模式（无 SMTP 认证 / localhost） */
  private readonly isDevMode: boolean;

  constructor(private configService: ConfigService) {
    const smtpHost = this.configService.get<string>('SMTP_HOST');
    const smtpUser = this.configService.get<string>('SMTP_USER');
    const smtpPass = this.configService.get<string>('SMTP_PASS');

    // 开发模式：localhost 或无认证信息
    const isLocalhost = !smtpHost || smtpHost === 'localhost' || smtpHost === '127.0.0.1';
    const hasAuth = !!(smtpUser && smtpPass);
    this.isDevMode = isLocalhost && !hasAuth;

    if (!this.isDevMode && smtpHost) {
      // 生产模式：配置了 SMTP 且有认证信息
      const smtpPort = this.configService.get<number>('SMTP_PORT', 587);
      this.transporter = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser!, pass: smtpPass! },
      });
      this.logger.log(`SMTP 已配置: ${smtpHost}:${smtpPort}`);
    } else if (this.isDevMode) {
      // 开发模式：连接本地 Mailpit（默认 127.0.0.1，避免 IPv6 解析问题）
      const smtpPort = this.configService.get<number>('SMTP_PORT', 1025);
      this.transporter = nodemailer.createTransport({
        host: smtpHost || '127.0.0.1',
        port: smtpPort,
        secure: false,
      });
      this.logger.log(
        `开发模式: SMTP=${smtpHost || '127.0.0.1'}:${smtpPort}，` +
          `请确保 Mailpit 已启动（docker compose up -d mailpit）`,
      );
    }
  }

  /**
   * 发送密码重置邮件
   *
   * 行为：
   *   - 开发模式：发送前先把重置链接打印到终端日志辅助调试；SMTP 发送失败 → 抛出错误
   *   - 生产模式：SMTP 发送失败 → 抛出错误
   *
   * 无论哪种模式，失败都会抛错，由调用方（AuthService）负责清理令牌、不设冷却期、
   * 返回 ErrMailSendFailed，使前端能看到「邮件发送失败」的提示。
   *
   * @param to 收件人邮箱
   * @param resetUrl 重置密码链接（前端页面 + token 参数）
   * @throws SMTP 发送失败时抛出错误
   */
  async sendResetPasswordEmail(to: string, resetUrl: string): Promise<void> {
    const mailFrom = this.configService.get<string>('MAIL_FROM') || 'noreply@devpulse.com';

    // 开发模式：无论 SMTP 是否可用，都在控制台打印重置链接（辅助调试）
    if (this.isDevMode) {
      this.logger.log(`\n📧 [开发模式] 密码重置邮件 → ${to}\n   重置链接: ${resetUrl}\n`);
    }

    // 无 transporter（极少数情况）→ 开发模式已打印链接，但仍抛错让上层感知
    if (!this.transporter) {
      throw new Error('邮件 transporter 未初始化');
    }

    try {
      await this.transporter.sendMail({
        from: `"DevPulse" <${mailFrom}>`,
        to,
        subject: 'DevPulse — 重置密码',
        html: this.buildResetEmailHtml(resetUrl),
      });

      this.logger.debug(`邮件已发送至 ${to}`);
    } catch (err) {
      // SMTP 连接/发送失败：打印错误日志（开发模式下重置链接已在上方打印）
      // 无论开发/生产模式都抛出错误，由 AuthService 捕获后不设冷却并返回失败提示
      this.logger.error(`邮件发送失败 [${to}]: ${(err as Error).message}`);
      throw new Error('邮件发送失败');
    }
  }

  /**
   * 构建重置密码邮件 HTML 模板
   */
  private buildResetEmailHtml(resetUrl: string): string {
    return `
      <div style="max-width:480px;margin:0 auto;padding:32px;font-family:sans-serif;">
        <h2 style="color:#2563eb;margin:0 0 24px;">重置密码</h2>
        <p style="color:#374151;font-size:14px;line-height:1.6;">
          你收到这封邮件是因为有人请求重置你 DevPulse 账号的密码。<br/>
          请点击下方按钮在 30 分钟内完成重置，链接过期后需要重新申请。
        </p>
        <a href="${resetUrl}"
           style="display:inline-block;padding:12px 24px;background:#2563eb;color:#fff;
                  text-decoration:none;border-radius:6px;font-size:14px;margin:16px 0;">
          重置密码
        </a>
        <p style="color:#9ca3af;font-size:12px;margin-top:24px;">
          如果按钮无法点击，请复制以下链接到浏览器打开：<br/>
          <a href="${resetUrl}" style="color:#2563eb;word-break:break-all;">${resetUrl}</a>
        </p>
        <hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;"/>
        <p style="color:#9ca3af;font-size:12px;">
          如果你没有请求重置密码，请忽略此邮件，你的密码不会被更改。
        </p>
      </div>
    `;
  }
}
