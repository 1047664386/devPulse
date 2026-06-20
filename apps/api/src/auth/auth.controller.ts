import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Req,
  Res,
  UseGuards,
  HttpCode,
  HttpStatus,
  Headers,
} from '@nestjs/common';
// Swagger 接口文档装饰器
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
// Express 原生请求、响应、Cookie 配置类型
import type { Request, Response, CookieOptions } from 'express';
// 登录注册刷新业务服务层
import { AuthService } from './auth.service';
// JWT 工具，用于解码 Bearer Token 提取 deviceId
import { JwtService } from '@nestjs/jwt';
// 注册接口入参DTO
import { RegisterDto } from './dto/register.dto';
// 登录接口入参DTO
import { LoginDto } from './dto/login.dto';
// 刷新令牌接口入参DTO
import { RefreshDto } from './dto/refresh.dto';
// 忘记密码接口入参DTO
import { ForgotPasswordDto } from './dto/forgot-password.dto';
// 重置密码接口入参DTO
import { ResetPasswordDto } from './dto/reset-password.dto';
// JWT访问令牌守卫，校验接口Authorization头
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
// 自定义装饰器，从Token中解析当前登录用户ID
import { CurrentUser } from '../common/decorators/current-user.decorator';

/**
 * RefreshToken Cookie名称常量
 * Web端长效刷新令牌存储在HttpOnly Cookie，JS无法读取，防御XSS窃取
 */
const RT_COOKIE_NAME = 'refresh_token';

/**
 * RefreshToken Cookie全局安全配置
 * httpOnly: true → JS禁止读取，防止XSS盗取长期刷新凭证
 * secure: 生产环境仅HTTPS下携带Cookie，HTTP明文不传输
 * sameSite: lax 防御大部分CSRF跨站请求伪造攻击
 * path: 仅/auth路径下自动携带Cookie，缩小Cookie暴露范围
 * maxAge: 7天有效期，单位毫秒，和Redis会话过期时间对齐
 */
const RT_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
  maxAge: 7 * 24 * 60 * 60 * 1000,
};

/**
 * 清除Cookie专用配置
 * 清除时配置必须和写入完全一致，否则浏览器无法正常删除对应Cookie
 */
const CLEAR_COOKIE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  path: '/api/v1/auth',
};

/**
 * 认证模块控制器
 * 统一处理注册、登录、刷新令牌、登出、设备会话管理接口
 * 双端兼容设计：
    1. Web网页端：RefreshToken通过HttpOnly Cookie自动传递，不暴露给前端JS
    2. APP/小程序客户端：无Cookie机制，RefreshToken从请求Body传入
 */
@ApiTags('Auth') // Swagger文档分组标签
@Controller('auth') // 路由统一前缀 /api/v1/auth
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly jwtService: JwtService,
  ) {}

  /**
   * 用户注册接口
   * 1. 调用service完成注册、创建用户、绑定默认角色、生成双Token
   * 2. 将长效refreshToken写入HttpOnly安全Cookie（网页端自动携带）
   * 3. 返回用户脱敏信息 + accessToken（短期访问令牌，前端内存存储）
   * @param dto 注册表单入参
   * @param res 响应对象，passthrough: true 允许同时返回JSON + 设置Cookie
   */
  @Post('register')
  @HttpCode(HttpStatus.CREATED) // 成功返回201
  async register(
    @Body() dto: RegisterDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.register(dto);
    // 下发refreshToken到HttpOnly Cookie
    this.setRefreshCookie(res, result.refreshToken);
    // 返回用户信息+accessToken，response不暴露refreshToken明文
    return result;
  }

  /**
   * 用户账号密码登录接口
   * 1. 提取客户端真实IP、UA设备标识，用于会话元数据存储
   * 2. service校验账号密码、设备上限控制、生成双Token
   * 3. refreshToken写入HttpOnly Cookie
   * @param dto 登录账号密码
   * @param req 请求对象，获取IP与UA
   * @param res 响应对象，设置Cookie
   */
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // 优先取反向代理真实IP，无则使用req原生ip
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    // 获取浏览器/设备User-Agent
    const ua = req.headers['user-agent'] || '';
    const result = await this.authService.login(dto, ip, ua);
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  /**
   * 刷新AccessToken接口（令牌轮换安全机制）
   * 兼容双端逻辑：
   * 1. Web网页：浏览器自动携带Cookie内refreshToken，无需前端手动传参
   * 2. APP/小程序：无Cookie，refreshToken从请求体body传入兜底
   * 流程：校验RT、检测令牌重用劫持、生成全新双Token、轮换销毁旧会话
   * @param dto 刷新接口入参，存放APP端refreshToken
   * @param req 请求对象，读取Cookie、IP、UA
   * @param res 响应对象，写入新的refreshToken Cookie
   */
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(
    @Body() dto: RefreshDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    // 优先级：Cookie > 请求体，优先使用网页安全Cookie凭证
    const token = req.cookies?.[RT_COOKIE_NAME] || dto.refreshToken;
    // 提取客户端IP、UA用于更新会话活跃信息
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || '';
    const ua = req.headers['user-agent'] || '';
    // 调用服务刷新令牌，完成会话轮换
    const result = await this.authService.refresh(token, ip, ua);
    // 将新生成的refreshToken重新写入HttpOnly Cookie
    this.setRefreshCookie(res, result.refreshToken);
    return result;
  }

  /**
   * 单设备登出接口（常规页面退出）
   * 逻辑：
   * 1. 从Cookie/请求体获取refreshToken，解码得到当前设备deviceId
   * 2. 仅销毁当前设备会话，其他设备保持登录状态
   * 3. 清除浏览器本地refreshToken Cookie
   * 兜底：无有效token时，直接清空该用户全部设备会话，防止残留会话
   * @param userId 当前登录用户ID（由JwtAuthGuard解析）
   * @param req 请求对象，读取Cookie
   * @param res 响应对象，清除Cookie
   * @param bodyBodyToken 前端传入的refreshToken（APP端使用）
   */
  @Post('logout')
  @UseGuards(JwtAuthGuard) // 需要携带accessToken鉴权
  @ApiBearerAuth() // Swagger文档标记该接口需要Bearer Token
  @HttpCode(HttpStatus.OK)
  async logout(
    @CurrentUser('id') userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
    @Body('refreshToken') bodyToken?: string,
  ) {
    // 优先读取Cookie中的refreshToken，兜底body参数
    const refreshToken = req.cookies?.[RT_COOKIE_NAME] || bodyToken;
    if (refreshToken) {
      // 仅解码提取deviceId，不做签名校验
      const deviceId = this.authService.decodeDeviceId(refreshToken);
      if (deviceId) {
        // 清除本地Cookie
        this.clearRefreshCookie(res);
        // 仅登出当前设备
        return this.authService.logout(userId, deviceId);
      }
    }
    // token不存在/解码失败，执行全部设备下线兜底策略
    this.clearRefreshCookie(res);
    return this.authService.logout(userId);
  }

  /**
   * 忘记密码接口 — 发送重置邮件
   * 安全设计：无论邮箱是否存在都返回统一消息，防止枚举邮箱
   * 冷却机制：同一邮箱60秒内只能发送一次重置邮件
   * @param dto 仅含 email 字段
   */
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  /**
   * 重置密码接口 — 验证令牌并更新密码
   * 流程：校验JWT令牌 → Redis防重放 → 更新密码 → 强制全部设备下线
   * 安全设计：令牌使用一次后失效，重置密码后所有设备必须重新登录
   * @param dto 含 token（邮件中的重置令牌）+ newPassword（新密码）
   */
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.token, dto.newPassword);
  }

  /**
   * 强制全部设备下线接口
   * 使用场景：修改密码、账号封禁、用户主动点击「退出所有设备」
   * 作用：清空该用户Redis内所有登录设备会话，清除本地Cookie
   * @param userId 当前登录用户ID
   * @param res 响应对象，清除Cookie
   */
  @Post('logout-all')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  async logoutAll(
    @CurrentUser('id') userId: string,
    @Res({ passthrough: true }) res: Response,
  ) {
    // 清除浏览器本地刷新凭证Cookie
    this.clearRefreshCookie(res);
    // 服务端销毁全部设备会话
    return this.authService.logoutAll(userId);
  }

  /**
   * 获取当前登录用户基础信息（携带角色）
   * @param userId JWT解析出的用户ID
   */
  @Get('me')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getMe(@CurrentUser('id') userId: string) {
    return this.authService.getMe(userId);
  }

  /**
   * 查询当前用户所有活跃登录设备会话列表
   * 用于个人中心「登录设备管理」页面展示所有在线终端
   * 从 Bearer Token 解码当前 deviceId，标记 isCurrent 供前端识别"本机"
   * @param userId 当前登录用户ID
   * @param authorization 请求头 Authorization: Bearer <accessToken>
   */
  @Get('sessions')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  getSessions(
    @CurrentUser('id') userId: string,
    @Headers('authorization') authorization?: string,
  ) {
    // 从 Bearer Token 中解码 deviceId（不验签，仅提取载荷）
    let currentDeviceId: string | null = null;
    if (authorization?.startsWith('Bearer ')) {
      try {
        const payload = this.jwtService.decode(authorization.slice(7)) as { deviceId?: string } | null;
        currentDeviceId = payload?.deviceId ?? null;
      } catch { /* 解码失败则不标记 */ }
    }
    return this.authService.getSessions(userId, currentDeviceId);
  }

  /**
   * 手动踢除指定一台登录设备
   * 用户在设备管理页主动下线其他终端时调用
   * @param userId 当前登录用户ID
   * @param deviceId 需要销毁的设备唯一标识
   */
  @Delete('sessions/:deviceId')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  logoutDevice(
    @CurrentUser('id') userId: string,
    @Param('deviceId') deviceId: string,
  ) {
    return this.authService.logoutDevice(userId, deviceId);
  }

  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
  // 私有工具辅助方法
  // ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

  /**
   * 设置HttpOnly刷新令牌Cookie
   * @param res 响应对象
   * @param refreshToken 服务端新生成的长效刷新令牌
   */
  private setRefreshCookie(res: Response, refreshToken: string) {
    res.cookie(RT_COOKIE_NAME, refreshToken, RT_COOKIE_OPTIONS);
  }

  /**
   * 清除客户端存储的refresh_token Cookie
   * 清除配置必须和写入配置完全一致，否则浏览器无法匹配删除
   * @param res 响应对象
   */
  private clearRefreshCookie(res: Response) {
    res.clearCookie(RT_COOKIE_NAME, CLEAR_COOKIE_OPTIONS);
  }
}