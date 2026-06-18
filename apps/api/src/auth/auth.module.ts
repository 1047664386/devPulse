import { Module } from '@nestjs/common';
// JWT 模块，用于签发、解析、校验 Access/Refresh Token
import { JwtModule } from '@nestjs/jwt';
// Passport 身份认证核心模块，封装策略调度逻辑
import { PassportModule } from '@nestjs/passport';
// 认证接口控制器：登录、注册、刷新token、登出、获取用户信息
import { AuthController } from './auth.controller';
// 认证业务服务：密码加密、生成双Token、Redis刷新Token管理
import { AuthService } from './auth.service';
// JWT 校验策略：解析请求头Bearer Token，查询并返回用户信息
import { JwtStrategy } from './jwt.strategy';

/**
 * 认证模块
 * 职责：统一管理登录、注册、鉴权、Token刷新相关能力
 * 依赖说明：
 *  1. PassportModule：全局默认使用 jwt 策略，配合 JwtAuthGuard 做接口鉴权
 *  2. JwtModule：提供 jwtService 用于签名、解析 JWT，配置抽离到全局/环境变量读取
 * 对外导出：
 *  AuthService：其他模块可注入调用登录、刷新、登出逻辑
 *  JwtModule：其他模块可注入 JwtService 自行签发解析令牌
 */
@Module({
  imports: [
    // 注册Passport，设置全局默认鉴权策略为 jwt
    PassportModule.register({ defaultStrategy: 'jwt' }),
    // 注册JWT模块，配置统一在JwtService内部读取环境变量，此处留空占位
    JwtModule.register({}),
  ],
  // 注册当前模块接口控制器
  controllers: [AuthController],
  // 注册业务服务与JWT校验策略
  providers: [AuthService, JwtStrategy],
  // 对外暴露服务与JWT模块，其他模块import AuthModule后可直接注入使用
  exports: [AuthService, JwtModule],
})
export class AuthModule {}