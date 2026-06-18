import { SetMetadata } from '@nestjs/common';

/**
 * 权限元数据存储Key，用于守卫读取接口绑定的权限列表
 */
export const PERMISSIONS_KEY = 'permissions';

/**
 * 接口权限校验装饰器
 * 作用：给控制器/路由方法绑定访问所需权限，PermissionsGuard 会读取该元数据做鉴权校验
 * 支持传入单个或多个权限字符串，可变参数自动打包为数组
 * 匹配规则：满足任意一个权限即可放行；支持 :any / :own 私有资源权限兼容
 *
 * 使用示例：
 * 1. 单个权限
 *    @RequirePermission('article:create')
 * 2. 多个权限（满足其一即可）
 *    @RequirePermission(['user:any', 'user:own'])
 * 3. 类上全局绑定（该控制器所有接口共用权限）
 *    @Controller('article')
 *    @RequirePermission('article:read:any')
 */
export const RequirePermission = (...permissions: string[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions); 