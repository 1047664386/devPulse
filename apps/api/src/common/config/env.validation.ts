// class-transformer：环境变量 plain 对象转类实例、类型自动转换装饰器
import { plainToInstance, Type } from 'class-transformer';
// class-validator：各类校验装饰器 + 同步校验方法
import {
  IsString,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  Min,
  validateSync,
} from 'class-validator';

/**
 * 全局环境变量校验模型
 * 作用：统一约束 .env 内所有环境变量类型、必填规则、数值范围
 * Nest ConfigModule 使用，启动时自动校验，非法配置直接阻断服务启动
 */
class EnvironmentVariables {
  /** 数据库连接字符串，必须配置 */
  @IsString()
  @IsNotEmpty({ message: 'DATABASE_URL 未配置，请检查 .env 文件' })
  DATABASE_URL: string;

  /** AccessToken 签名密钥，生产必须自定义强密钥 */
  @IsString()
  @IsNotEmpty({ message: 'JWT_SECRET 未配置，生产环境禁止使用默认密钥' })
  JWT_SECRET: string;

  /** RefreshToken 独立签名密钥，与AccessToken密钥隔离提升安全 */
  @IsString()
  @IsNotEmpty({ message: 'JWT_REFRESH_SECRET 未配置' })
  JWT_REFRESH_SECRET: string;

  /** AccessToken 过期时长，可选，默认15m */
  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string;

  /** RefreshToken 过期时长，可选，默认7d */
  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN?: string;

  /** Redis 服务地址，可选，不填默认 localhost */
  @IsString()
  @IsOptional()
  REDIS_HOST?: string;

  /** Redis 端口，自动转为数字，最小值1 */
  @Type(() => Number) // 将.env字符串自动转Number类型
  @IsNumber()
  @IsOptional()
  @Min(1)
  REDIS_PORT?: number;

  /** Redis 连接密码，无密码可省略 */
  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string;

  /** 服务监听端口，数字类型，最小1 */
  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(1)
  API_PORT?: number;

  /** 前端页面域名，用于CORS、Cookie跨域配置 */
  @IsString()
  @IsOptional()
  FRONTEND_URL?: string;

  /** 初始超级管理员邮箱 */
  @IsString()
  @IsOptional()
  ADMIN_EMAIL?: string;

  /** 初始超级管理员密码 */
  @IsString()
  @IsOptional()
  ADMIN_PASSWORD?: string;
}

/**
 * ConfigModule 专用环境变量校验函数
 * @param config 原始 env 键值对象（全部值默认是string）
 * @returns 类型安全的 EnvironmentVariables 实例
 * 启动时校验失败直接抛出异常，阻止项目启动，提前暴露配置错误
 */
export function validate(config: Record<string, unknown>) {
  // 将原始env纯文本对象转为类实例，自动转换数字类型
  const validatedConfig = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  // 同步执行校验，跳过未提供的可选字段
  const errors = validateSync(validatedConfig, { skipMissingProperties: true });

  // 存在校验错误，拼接所有提示并抛出启动异常
  if (errors.length > 0) {
    const messages = errors
      .map((validationError) => Object.values(validationError.constraints || {}).join(', '))
      .join('; ');
    throw new Error(`环境变量校验失败: ${messages}`);
  }

  // 校验通过，返回带完整TS类型的环境变量对象
  return validatedConfig;
}
