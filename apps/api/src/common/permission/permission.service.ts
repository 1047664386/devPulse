import { Injectable, Logger, Inject, HttpStatus, forwardRef } from '@nestjs/common';
// Redis 客户端实例，用于操作 Redis 缓存
import Redis from 'ioredis';
// Prisma ORM 数据库操作工具（forwardRef 解决 PrismaService ↔ PermissionService 循环依赖）
import { PrismaService } from '../../prisma/prisma.service';
// Redis 模块的注入标识，用于构造函数注入 Redis 实例
import { REDIS_CLIENT } from '../redis/redis.module';
// 全局统一自定义业务异常，用于抛出带业务错误码的报错
import { BusinessException } from '../exceptions/business.exception';
// 权限模块专属错误码常量
import { ErrRoleNotFound, ErrCannotDeleteSysRole } from '../constants/error-codes';
// 全局权限静态配置常量：所有权限、角色绑定权限、权限描述、系统内置角色
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  PERMISSION_DESCRIPTIONS,
  SYSTEM_ROLES,
} from '../constants/permissions';

/**
 * Redis 中存储用户权限的缓存数据结构
 * 因为 Set 不能直接 JSON 序列化，所以权限存数组，读取后再转 Set
 * permissions：权限标识数组，格式统一为 resource:action，例如 user:read、article:create
 * roleNames：用户拥有的全部角色名称数组，大写格式，如 ['ADMIN', 'OPERATOR']
 */
interface CachedPermissionData {
  permissions: string[];
  roleNames: string[];
}

/**
 * 权限管理服务
 * 核心整体作用：
  1. 用户登录后鉴权底层支撑：查询用户角色、权限，做 Redis 缓存减轻数据库压力
  2. 后台角色管理：新增/删除角色、给角色绑定权限、保护系统内置角色不可删除
  3. 系统初始化种子脚本：自动创建系统角色、全部权限、默认角色权限绑定
  4. 缓存统一管理：修改角色/权限后自动清空缓存，保证权限实时生效
 * 配套鉴权流程：
  JwtAuthGuard（校验登录） → PermissionsGuard（调用本服务校验权限）
 */
@Injectable()
export class PermissionService {
  // Nest 日志工具，打印权限操作、缓存、初始化相关日志
  private readonly logger = new Logger(PermissionService.name);
  // 权限缓存过期时间，单位秒：60秒自动失效，避免权限长期不更新
  private readonly CACHE_TTL = 60;
  // Redis key 统一前缀，区分不同业务缓存，防止 key 冲突
  private readonly KEY_PREFIX = 'perm:';
  // Redis Set 集合 key，存放所有生成过权限缓存的用户ID，用于一键批量清空所有缓存
  private readonly USERS_SET_KEY = 'perm:_users';

  constructor(
    // 数据库操作工具，查询用户、角色、权限关联表（forwardRef 处理循环依赖）
    @Inject(forwardRef(() => PrismaService))
    private prisma: PrismaService,
    // 注入全局 Redis 客户端，用于读写权限缓存
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) { }

  /**
   * 获取用户完整角色与权限集合（核心方法，鉴权守卫会调用）
   * 执行逻辑：
    1. 拼接用户专属缓存 key，先查询 Redis
    2. 如果缓存存在且 JSON 解析正常，直接返回缓存数据
    3. 如果缓存不存在 / 缓存JSON损坏，去数据库联表查询完整权限并写入缓存
   * @param userId 当前登录用户ID
   * @returns permissions 权限集合(Set快速判断有无权限)、roleNames 用户角色数组
   */
  async getUserPermissions(userId: string): Promise<{
    permissions: Set<string>;
    roleNames: string[];
  }> {
    // 拼接当前用户权限缓存唯一key：perm:用户ID
    const cacheKey = `${this.KEY_PREFIX}${userId}`;
    // 从Redis读取缓存，返回 string | null
    const cached = await this.redis.get(cacheKey);

    // 缓存命中
    if (cached) {
      try {
        // 将JSON字符串转回对象
        const data: CachedPermissionData = JSON.parse(cached);
        // 数组转Set，Set.has() 判断权限效率远高于数组includes
        return { permissions: new Set(data.permissions), roleNames: data.roleNames };
      } catch {
        // 缓存脏数据、JSON格式损坏，捕获异常，打印日志后走数据库刷新权限
        this.logger.warn(`权限缓存 JSON 解析失败，用户 ${userId}，重新查库`);
      }
    }

    // 无缓存 / 缓存损坏，执行数据库查询并写入缓存
    return this.loadUserPermissions(userId);
  }

  /**
   * 工具方法：判断用户是否拥有某一条指定权限
   * @param userId 用户ID
   * @param permission 权限标识，如 article:delete
   * @returns true=拥有权限，false=无权限
   */
  async userHasPermission(userId: string, permission: string): Promise<boolean> {
    // 调用核心方法获取用户全部权限
    const { permissions } = await this.getUserPermissions(userId);
    // Set 快速匹配权限
    return permissions.has(permission);
  }

  /**
   * 工具方法：判断用户是否拥有指定角色
   * @param userId 用户ID
   * @param roleName 大写角色名，如 ADMIN
   * @returns true=用户绑定该角色
   */
  async userHasRole(userId: string, roleName: string): Promise<boolean> {
    const { roleNames } = await this.getUserPermissions(userId);
    return roleNames.includes(roleName);
  }

  /**
   * 清理权限缓存，两种模式：单用户清理 / 全量清理
   * 使用场景：角色新增/删除、角色权限修改、用户角色变更后调用，使缓存立即失效
   * @param userId 可选参数：传用户ID则只清该用户缓存；不传清空全部用户权限缓存
   */
  async invalidateCache(userId?: string): Promise<void> {
    if (userId) {
      // 1. 单用户缓存清理
      // 删除该用户对应的 perm:xxx 缓存key
      await this.redis.del(`${this.KEY_PREFIX}${userId}`);
      // 从记录用户ID的Set集合中移除该用户ID
      await this.redis.srem(this.USERS_SET_KEY, userId);
    } else {
      // 2. 全局全部缓存清理
      // 取出所有存在缓存的用户ID列表
      const cachedUserIds = await this.redis.smembers(this.USERS_SET_KEY);
      if (cachedUserIds.length > 0) {
        // 批量拼接所有缓存key
        const keys = cachedUserIds.map((id) => `${this.KEY_PREFIX}${id}`);
        // 批量删除所有用户缓存key + 清空存储用户ID的Set集合
        await this.redis.del(...keys, this.USERS_SET_KEY);
      }
    }
  }

  /**
   * 查询系统所有角色，同时携带每个角色绑定的完整权限详情
   * 页面管理角色列表接口使用，用于前端渲染角色和对应权限树
   */
  async getAllRolesWithPermissions() {
    // 查询所有角色，按创建时间升序；关联角色权限、权限详情
    const roles = await this.prisma.role.findMany({
      orderBy: { createdAt: 'asc' },
      // 关联查询角色绑定的所有权限中间表、权限完整信息
      include: { permissions: { include: { permission: true } } },
    });

    // 格式化返回数据，剔除数据库多余中间字段，简化前端接收结构
    return roles.map((role) => ({
      id: role.id,
      name: role.name,
      description: role.description,
      isSystem: role.isSystem, // 是否系统内置角色
      permissions: role.permissions.map((rp) => ({
        id: rp.permission.id,
        resource: rp.permission.resource,
        action: rp.permission.action,
        description: rp.permission.description,
      })),
    }));
  }

  /**
   * 更新某个角色绑定的权限列表
   * 逻辑：先清空角色原有全部权限，再批量新增传入的权限ID
   * 修改完成后全局清空所有权限缓存，所有用户权限立即刷新
   * @param roleId 要修改的角色ID
   * @param permissionIds 前端勾选的权限ID数组
   */
  async setRolePermissions(roleId: string, permissionIds: string[]): Promise<void> {
    // 删除该角色下所有旧的角色-权限关联记录
    await this.prisma.rolePermission.deleteMany({ where: { roleId } });
    // 传入权限数组不为空，批量插入新的权限绑定关系
    if (permissionIds.length > 0) {
      await this.prisma.rolePermission.createMany({
        data: permissionIds.map((pid) => ({ roleId, permissionId: pid })),
      });
    }
    // 角色权限发生变更，全局缓存失效，所有用户重新加载权限
    await this.invalidateCache();
  }

  /**
   * 创建自定义角色（仅允许创建非系统角色）
   * 角色名称自动转为大写统一存储规范
   * @param name 角色名称
   * @param description 角色描述，可为空
   */
  async createRole(name: string, description?: string) {
    return this.prisma.role.create({
      data: {
        name: name.toUpperCase(), // 统一大写，避免大小写匹配问题
        description: description ?? null,
        isSystem: false, // 手动创建的角色都标记为非系统角色，支持删除
      },
    });
  }

  /**
   * 删除角色接口逻辑
   * 限制：系统内置角色禁止删除，防止基础权限体系损坏
   * @param roleId 待删除角色ID
   */
  async deleteRole(roleId: string) {
    // 根据ID查询角色是否存在
    const role = await this.prisma.role.findUnique({ where: { id: roleId } });
    if (!role) {
      // 角色不存在，抛出404业务异常
      throw new BusinessException(ErrRoleNotFound, {
        httpStatus: HttpStatus.NOT_FOUND,
        detail: `角色 ${roleId} 不存在`,
      });
    }
    // 拦截系统内置角色删除操作
    if (role.isSystem) {
      throw new BusinessException(ErrCannotDeleteSysRole, {
        httpStatus: HttpStatus.FORBIDDEN,
        detail: `尝试删除系统内置角色 ${role.name}`,
      });
    }
    // 数据库删除角色记录
    await this.prisma.role.delete({ where: { id: roleId } });
    // 角色数据变更，清空全部权限缓存
    await this.invalidateCache();
  }

  /**
   * 获取系统全部权限资源列表
   * 前端权限选择框、权限树渲染使用，按资源、操作升序排序
   */
  async getAllPermissions() {
    return this.prisma.permission.findMany({
      orderBy: [{ resource: 'asc' }, { action: 'asc' }],
    });
  }

  /**
   * 初始化种子数据脚本
   * 执行时机：项目首次启动/手动调用初始化接口
   * 作用：自动创建系统角色、全部权限、绑定系统角色默认权限
   * 特性：使用 upsert 幂等操作，重复执行不会报错，只会更新不重复新增
   */
  async seedRolesAndPermissions(): Promise<void> {
    try {
      // 步骤1：初始化所有系统内置角色
      for (const [, config] of Object.entries(SYSTEM_ROLES)) {
        await this.prisma.role.upsert({
          where: { name: config.name }, // 根据角色名唯一匹配
          update: { description: config.description, isSystem: config.isSystem }, // 存在则更新信息
          create: { name: config.name, description: config.description, isSystem: config.isSystem }, // 不存在则新建
        });
      }
      this.logger.log(`Upserted ${Object.keys(SYSTEM_ROLES).length} system roles`);

      // 步骤2：初始化全量权限资源
      for (const perm of ALL_PERMISSIONS) {
        // 拆分权限标识 "user:any" → resource=user action=any
        const [resource, ...actionParts] = perm.split(':');
        const action = actionParts.join(':');
        // 基于 resource+action 联合唯一约束 upsert 权限
        await this.prisma.permission.upsert({
          where: { resource_action: { resource, action } },
          update: { description: PERMISSION_DESCRIPTIONS[perm] ?? null },
          create: { resource, action, description: PERMISSION_DESCRIPTIONS[perm] ?? null },
        });
      }
      this.logger.log(`Upserted ${ALL_PERMISSIONS.length} permissions`);

      // 步骤3：给系统角色绑定默认权限
      // 查询所有角色、所有权限，构建映射表快速匹配ID
      const allRoles = await this.prisma.role.findMany();
      const allPerms = await this.prisma.permission.findMany();
      // Map key=权限标识 resource:action  value=权限ID，避免循环查找
      const permMap = new Map(allPerms.map((p) => [`${p.resource}:${p.action}`, p.id]));

      // 遍历预设角色权限配置，批量绑定
      for (const [roleName, perms] of Object.entries(ROLE_PERMISSIONS)) {
        const role = allRoles.find((r) => r.name === roleName);
        if (!role) continue;
        // 根据权限标识取出对应权限ID，过滤空值
        const permIds = perms.map((p) => permMap.get(p)).filter(Boolean) as string[];
        if (permIds.length > 0) {
          // 清空旧权限绑定，写入默认权限
          await this.prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
          await this.prisma.rolePermission.createMany({
            data: permIds.map((pid) => ({ roleId: role.id, permissionId: pid })),
          });
        }
      }
      this.logger.log('Default role-permission mappings seeded');

      // 初始化完成，清空所有权限缓存，使用新权限配置
      await this.invalidateCache();
    } catch (error) {
      // 捕获初始化异常，仅打印警告，不中断服务启动
      this.logger.warn(`Role/Permission seeding skipped: ${(error as Error).message}`);
    }
  }

  /**
   * 私有底层方法：数据库联表查询用户角色权限，并写入Redis缓存
   * 只有缓存失效/无缓存时才会调用，封装数据库复杂联表逻辑
   * @param userId 用户ID
   * @returns 处理完成的权限集合、角色数组
   */
  private async loadUserPermissions(userId: string): Promise<{
    permissions: Set<string>;
    roleNames: string[];
  }> {
    // 多表深度联查：用户 → 用户角色中间表 → 角色 → 角色权限中间表 → 权限详情
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        // 用户绑定的所有UserRole中间记录
        roles: {
          include: {
            // 中间表关联对应Role角色
            role: {
              include: {
                // 角色绑定的所有RolePermission中间记录
                permissions: { include: { permission: true } },
              },
            },
          },
        },
      },
    });

    // let auth = {
    //   "id": "user_123",
    //   "username": "admin",
    //   "roles": [
    //     {
    //       // UserRole 中间表字段
    //       "id": "ur_001",
    //       "userId": "user_123",
    //       "roleId": "role_admin",
    //       "role": {
    //         "id": "role_admin",
    //         "name": "ADMIN",
    //         "isSystem": true,
    //         "permissions": [
    //           {
    //             // RolePermission 中间表
    //             "id": "rp_001",
    //             "roleId": "role_admin",
    //             "permissionId": "p_001",
    //             "permission": {
    //               "id": "p_001",
    //               "resource": "user",
    //               "action": "any",
    //               "description": "管理全部用户"
    //             }
    //           }
    //         ]
    //       }
    //     }
    //   ]
    // }

    // 权限Set去重，角色数组存储角色名称
    const permissions = new Set<string>();
    const roleNames: string[] = [];

    // 用户存在则遍历提取角色、权限
    if (user) {
      // 遍历用户所有绑定的角色中间记录
      for (const userRole of user.roles) {
        // 收集角色名称
        roleNames.push(userRole.role.name);
        // 遍历当前角色所有绑定权限
        for (const rp of userRole.role.permissions) {
          // 拼接统一格式权限标识存入Set自动去重
          permissions.add(`${rp.permission.resource}:${rp.permission.action}`);
        }
      }
    }

    // 序列化缓存对象：Set无法JSON存储，转为普通数组
    const cacheData: CachedPermissionData = {
      permissions: Array.from(permissions),
      roleNames,
    };
    // 写入Redis，设置过期时间
    await this.redis.set(`${this.KEY_PREFIX}${userId}`, JSON.stringify(cacheData), 'EX', this.CACHE_TTL);
    // 将当前用户ID存入Set集合，用于后续批量清理缓存
    await this.redis.sadd(this.USERS_SET_KEY, userId);

    // 返回给上层调用方法
    return { permissions, roleNames };
  }
}