import { Injectable, CanActivate, ExecutionContext, HttpStatus } from '@nestjs/common';
// Nest反射工具，用于读取控制器/方法上的自定义装饰器元数据
import { Reflector } from '@nestjs/core';
// 权限装饰器常量Key，用于标记接口所需权限
import { PERMISSIONS_KEY } from './require-permission.decorator';
// 权限业务服务，读取用户角色权限缓存
import { PermissionService } from './permission.service';
// 全局统一业务异常
import { BusinessException } from '../exceptions/business.exception';
// 鉴权相关错误码常量
import { ErrNotAuthenticated, ErrForbidden } from '../constants/error-codes';

/**
 * 接口权限守卫
 * 作用：校验当前登录用户是否拥有接口标注的访问权限
 * 校验规则：
    1. 接口未标注 @RequirePermission → 直接放行
    2. 用户未登录（request.user 不存在）→ 抛出未登录401
    3. 用户是ADMIN超级管理员角色 → 直接放行所有接口
    4. 匹配任意一个所需权限即可通过；支持 :any / :own 私有资源权限兼容
    5. 无匹配权限则抛出403禁止访问
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    // 反射器，读取路由上绑定的权限元数据
    private reflector: Reflector,
    // 权限服务，查询用户权限集合
    private permissionService: PermissionService,
  ) {}

  /**
   * 守卫核心执行方法，请求进入控制器前自动执行
   * @param context 请求上下文，包含路由、请求对象、控制器信息
   * @returns true=放行接口，false/抛异常=拦截请求
   */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    // 从「当前方法 + 当前控制器类」合并读取所需权限数组，方法权限优先级高于类权限
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );
    
    // 接口没有标注任何权限要求，无需校验直接放行
    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    // 获取HTTP原始请求对象
    const request = context.switchToHttp().getRequest();
    // JwtStrategy校验通过后，用户信息会挂载到 request.user
    const user = request.user;

    // 无用户信息 = 未携带有效AccessToken，未登录
    if (!user) {
      throw new BusinessException(ErrNotAuthenticated, {
        httpStatus: HttpStatus.UNAUTHORIZED,
      });
    }

    // 兼容两种用户ID存储字段：user.id（数据库完整用户对象）/ user.sub（原始JWT载荷）
    const userId: string = user.id ?? user.sub;
    // 读取用户缓存权限、角色列表
    const { permissions, roleNames } = await this.permissionService.getUserPermissions(userId);

    // ADMIN超级管理员拥有全部权限，跳过后续校验直接放行
    if (roleNames.includes('ADMIN')) {
      return true;
    }

    // 遍历接口要求的全部权限，满足任意一条即可通过校验
    for (const permission of requiredPermissions) {
      // 1. 用户拥有完整全局权限，直接放行
      if (permissions.has(permission)) {
        return true;
      }
      // 2. 兼容私有资源权限：接口要求 xxx:any（全部资源），用户拥有 xxx:own（仅自己资源）也允许访问
      if (permission.endsWith(':any')) {
        const ownPermission = permission.replace(':any', ':own');
        if (permissions.has(ownPermission)) {
          return true;
        }
      }
    }

    // 循环结束无匹配权限，拦截接口，抛出无权限异常
    throw new BusinessException(ErrForbidden, {
      httpStatus: HttpStatus.FORBIDDEN,
      detail: `缺少所需权限: ${requiredPermissions.join(', ')}`,
    });
  }
}