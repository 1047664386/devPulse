import { Injectable, OnModuleInit, OnModuleDestroy, Logger, Inject, forwardRef } from '@nestjs/common';
// Prisma自动生成的数据库客户端类型与实例
import { PrismaClient } from '../generated/prisma/client';
// Postgres官方适配器，替代默认连接方式，精细化控制连接池
import { PrismaPg } from '@prisma/adapter-pg';
// 密码加密库，用于管理员密码哈希存储
import * as bcrypt from 'bcrypt';
// 权限服务（负责角色/权限 seed + 缓存管理）
import { PermissionService } from '../common/permission/permission.service';

/**
 * 全局唯一Prisma数据库服务
 * 1. 继承PrismaClient，拥有全量ORM增删改查能力
 * 2. 实现Nest生命周期钩子，自动连接/释放数据库
 * 3. 启动时委托 PermissionService 填充 RBAC 角色权限 + 自动创建管理员
 * 4. 全局单例，整个项目共用一套数据库连接池
 *
 * Seed 职责划分：
 * - 角色/权限/关联数据 → PermissionService.seedRolesAndPermissions()（唯一入口）
 * - 超级管理员初始化 → PrismaService.bootstrapAdminIfNoneExists()（本服务私有）
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Nest日志工具，打印数据库连接、初始化、异常信息
  private readonly logger = new Logger(PrismaService.name);

  constructor(
    // 使用 forwardRef 解决 PrismaService ↔ PermissionService 循环依赖
    @Inject(forwardRef(() => PermissionService))
    private permissionService: PermissionService,
  ) {
    // 读取环境变量中的Postgres连接地址
    const connectionString = process.env.DATABASE_URL!;
    // 初始化pg适配器，注入连接字符串
    const adapter = new PrismaPg({ connectionString });
    // 调用父类PrismaClient构造，传入适配器配置
    super({ adapter });
  }

  /**
   * Nest模块初始化完成钩子
   * 项目启动时自动执行：连接数据库 → 初始化角色权限 → 自动创建管理员
   */
  async onModuleInit() {
    // 建立Postgres长连接
    await this.$connect();
    this.logger.log('Database connected');

    // 委托 PermissionService 幂等填充角色/权限数据（唯一入口，避免重复 seed）
    await this.permissionService.seedRolesAndPermissions();

    // 检测无管理员时，读取环境变量自动创建超级管理员账号
    await this.bootstrapAdminIfNoneExists();
  }

  /**
   * Nest应用销毁关闭钩子
   * 服务停止、进程退出时优雅断开数据库连接，防止连接池泄漏
   */
  async onModuleDestroy() {
    await this.$disconnect();
  }

  // ─── 超级管理员账号自动初始化（生产部署开箱即用） ─────────
  /**
   * 检测系统无任何管理员时，读取环境变量自动创建/提升管理员
   */
  private async bootstrapAdminIfNoneExists(): Promise<void> {
    try {
      // 1. 先查询ADMIN系统角色是否存在
      const adminRole = await this.role.findUnique({ where: { name: 'ADMIN' } });
      if (!adminRole) {
        this.logger.warn('ADMIN role not found in DB, skipping admin bootstrap');
        return;
      }

      // 2. 统计绑定ADMIN角色的用户数量
      const adminUserRoleCount = await this.userRole.count({
        where: { roleId: adminRole.id },
      });

      // 已有管理员，直接跳过
      if (adminUserRoleCount > 0) {
        this.logger.log(`${adminUserRoleCount} admin(s) exist, skipping bootstrap`);
        return;
      }

      // 3. 读取环境变量配置的管理员邮箱、密码
      const email = process.env.ADMIN_EMAIL;
      const password = process.env.ADMIN_PASSWORD;

      // 环境变量缺失，打印提示，不崩溃
      if (!email || !password) {
        this.logger.warn(
          'No admin accounts found and ADMIN_EMAIL/ADMIN_PASSWORD env vars not set. ' +
          'Run `pnpm seed` to create initial admin, or set env vars and restart.',
        );
        return;
      }

      // 4. 邮箱已存在用户，直接把该用户升级为管理员
      const existingUser = await this.user.findUnique({ where: { email } });
      if (existingUser) {
        // 查询该用户是否已经拥有管理员角色
        const hasAdminRole = await this.userRole.findUnique({
          where: { userId_roleId: { userId: existingUser.id, roleId: adminRole.id } },
        });
        // 无管理员权限，则新增关联
        if (!hasAdminRole) {
          await this.userRole.create({
            data: { userId: existingUser.id, roleId: adminRole.id },
          });
          this.logger.log(`Promoted existing user ${email} to ADMIN`);
        }
        return;
      }

      // 5. 邮箱无用户，全新创建管理员账号
      // 密码加盐哈希加密，12轮加密强度
      const passwordHash = await bcrypt.hash(password, 12);
      // 用户名默认截取邮箱@前面部分
      const username = email.split('@')[0];

      // 创建用户基础信息
      const user = await this.user.create({
        data: {
          email,
          username,
          passwordHash,
          displayName: 'Administrator',
          bio: 'System administrator',
        },
      });

      // 给新用户绑定ADMIN角色
      await this.userRole.create({
        data: { userId: user.id, roleId: adminRole.id },
      });

      this.logger.log(`Initial admin account created: ${email}`);
    } catch (error) {
      // 管理员创建失败仅告警，服务正常启动
      this.logger.warn(`Admin bootstrap failed: ${(error as Error).message}`);
    }
  }
}
