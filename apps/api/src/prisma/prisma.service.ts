import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common';
// Prisma自动生成的数据库客户端类型与实例
import { PrismaClient } from '../generated/prisma/client';
// Postgres官方适配器，替代默认连接方式，精细化控制连接池
import { PrismaPg } from '@prisma/adapter-pg';
// 密码加密库，用于管理员密码哈希存储
import * as bcrypt from 'bcrypt';
// 全局权限静态常量配置（角色、权限标识、描述、角色绑定权限集合）
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  SYSTEM_ROLES,
} from '../common/constants/permissions';

/**
 * 全局唯一Prisma数据库服务
 * 1. 继承PrismaClient，拥有全量ORM增删改查能力
 * 2. 实现Nest生命周期钩子，自动连接/释放数据库
 * 3. 开机自动幂等填充RBAC角色、权限、超级管理员账号
 * 4. 全局单例，整个项目共用一套数据库连接池
 */
@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  // Nest日志工具，打印数据库连接、初始化、异常信息
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
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

    // 幂等填充系统角色、权限、角色权限关联数据
    await this.seedRolesAndPermissionsIfEmpty();

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

  // ─── 角色&权限自动填充（幂等函数：重复执行不会重复插入、不会报错） ─────────
  /**
   * 仅当角色/权限表为空时，批量初始化整套RBAC基础数据
   * upsert模式：存在则更新、不存在则新建，适配后续配置微调场景
   */
  private async seedRolesAndPermissionsIfEmpty(): Promise<void> {
    try {
      // 查询当前库内角色总数、权限总数
      const roleCount = await this.role.count();
      const permCount = await this.permission.count();

      // 角色、权限都已有数据，直接跳过填充逻辑
      if (roleCount > 0 && permCount > 0) {
        this.logger.log(`Roles (${roleCount}) and permissions (${permCount}) already seeded`);
        return;
      }

      this.logger.log('Seeding roles and permissions...');

      // 1. 批量插入/更新系统内置角色（ADMIN、USER等）
      for (const [, config] of Object.entries(SYSTEM_ROLES)) {
        await this.role.upsert({
          // 唯一匹配条件：角色名称
          where: { name: config.name },
          // 角色已存在，更新描述、是否系统内置标记
          update: { description: config.description, isSystem: config.isSystem },
          // 角色不存在，创建全新角色记录
          create: {
            name: config.name,
            description: config.description,
            isSystem: config.isSystem,
          },
        });
      }
      this.logger.log(`Upserted ${Object.keys(SYSTEM_ROLES).length} system roles`);

      // 2. 批量插入/更新全部权限标识（格式 resource:action 如 article:create）
      for (const perm of ALL_PERMISSIONS) {
        // 拆分权限字符串：资源、操作（支持多级action，如 user:info:edit）
        const [resource, ...actionParts] = perm.split(':');
        const action = actionParts.join(':');
        await this.permission.upsert({
          // 联合唯一键：资源+操作
          where: { resource_action: { resource, action } },
          // 存在则更新权限描述
          update: { description: PERMISSION_DESCRIPTIONS[perm] ?? null },
          // 不存在则新建权限
          create: {
            resource,
            action,
            description: PERMISSION_DESCRIPTIONS[perm] ?? null,
          },
        });
      }
      this.logger.log(`Upserted ${ALL_PERMISSIONS.length} permissions`);

      // 3. 绑定角色与权限多对多关联关系
      // 先查询全量角色、全量权限，构建权限名→权限ID映射表
      const allRoles = await this.role.findMany();
      const allPerms = await this.permission.findMany();
      const permMap = new Map(allPerms.map((p) => [`${p.resource}:${p.action}`, p.id]));

      // 遍历预设角色权限配置
      for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
        // 匹配当前遍历的角色库内实体
        const role = allRoles.find((r) => r.name === roleName);
        if (!role) continue;

        // 根据权限标识取出对应数据库ID，过滤空值
        const permIds = perms.map((p) => permMap.get(p)).filter(Boolean) as string[];
        if (permIds.length > 0) {
          // 先清空该角色旧的所有权限关联，避免旧脏数据残留
          await this.rolePermission.deleteMany({ where: { roleId: role.id } });
          // 批量插入最新角色-权限关联
          await this.rolePermission.createMany({
            data: permIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
          });
        }
      }

      this.logger.log('Roles and permissions seeded successfully');
    } catch (error) {
      // 填充异常仅打印警告，不阻断Nest服务启动
      this.logger.warn(`Role/Permission seeding skipped: ${(error as Error).message}`);
    }
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