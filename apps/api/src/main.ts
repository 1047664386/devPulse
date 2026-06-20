// 引入Nest核心工厂，用于创建应用实例
import { NestFactory } from '@nestjs/core';
// 全局参数校验管道，校验请求DTO参数合法性
import { ValidationPipe } from '@nestjs/common';
// Swagger相关，自动生成接口在线文档
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
// 项目根模块，所有业务模块入口
import { AppModule } from './app.module';
// 全局异常过滤器，统一格式化所有接口报错返回体
import { AllExceptionFilter } from './common/filters/all-exception.filter';
// 全局响应拦截器，统一封装成功接口返回格式
import { TransformInterceptor } from './common/interceptors/transform.interceptor';

/**
 * 项目启动入口函数
 * 初始化Nest应用、全局中间件、过滤器、拦截器、文档、跨域并监听端口
 */
async function bootstrap() {
  // 根据根模块创建Nest应用实例
  const app = await NestFactory.create(AppModule);

  // 统一接口全局路由前缀：所有接口地址前拼接 /api/v1
  app.setGlobalPrefix('api/v1');

  // 注册全局参数校验管道，统一校验POST/PUT等请求入参
  app.useGlobalPipes(
    new ValidationPipe({
      // whitelist: 自动过滤DTO中未声明的多余字段，客户端传多余参数直接丢弃
      whitelist: true,
      // forbidNonWhitelisted: 存在多余未定义字段时，直接抛出参数错误异常
      forbidNonWhitelisted: false,
      // transform: 自动将请求原始参数转为DTO实例对象
      transform: true,
      transformOptions: {
        // enableImplicitConversion: 自动类型转换（字符串数字自动转number、布尔自动转换等）
        enableImplicitConversion: true,
      },
    }),
  );

  // 注册全局异常过滤器
  // 捕获程序所有异常（业务异常、数据库异常、系统报错），统一返回标准化错误结构
  app.useGlobalFilters(new AllExceptionFilter());

  // 注册全局响应拦截器
  // 统一封装正常接口返回格式，外层包裹 { data, meta } 结构，前端统一解析
  app.useGlobalInterceptors(new TransformInterceptor());

  // 开启跨域CORS，允许前端页面跨域请求后端接口
  // 支持多个来源：FRONTEND_URL 用逗号分隔多个地址（IP + 域名）
  const allowedOrigins = (process.env.FRONTEND_URL || 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim());
  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      // 允许无 origin 的请求（服务端调用、curl 等）
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    // 允许跨域携带Cookie、Token凭证
    credentials: true,
    maxAge: 86400, // 预检缓存24小时，大幅减少OPTIONS请求
  });

  // 配置Swagger在线接口文档
  const config = new DocumentBuilder()
    .setTitle('DevPulse API') // 文档标题
    .setDescription('Developer community platform API') // 文档描述
    .setVersion('1.0') // 接口版本
    .addBearerAuth() // 开启Bearer Token鉴权（JWT登录认证）
    .build();
  // 根据配置生成完整接口文档对象
  const document = SwaggerModule.createDocument(app, config);
  // 挂载文档访问路由：访问 /api/docs 打开在线接口文档页面
  SwaggerModule.setup('api/docs', app, document);

  // 读取环境变量端口，未配置默认3000
  const port = process.env.API_PORT || 3000;
  // 启动服务监听端口
  await app.listen(port);
  // 打印服务与文档访问地址日志
  console.log(`API running on http://localhost:${port}`);
  console.log(`Swagger docs: http://localhost:${port}/api/docs`);
}

// 执行启动函数
bootstrap();