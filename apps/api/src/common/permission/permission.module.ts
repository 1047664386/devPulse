import { Global, Module } from '@nestjs/common';
// 权限业务服务
import { PermissionService } from './permission.service';
// 全局接口权限守卫
import { PermissionsGuard } from './permissions.guard';

/**
 * 权限全局模块
 * 功能：统一提供角色、权限管理能力 + 接口权限校验守卫
 * 标记 @Global() 后，全项目任意模块无需手动 imports 即可注入内部服务、守卫
 */
@Global()
@Module({
  // imports: [
  //   // 引入数据库模块，供PermissionService操作角色、权限数据表
  //   // forwardRef 处理模块循环依赖问题
  //   forwardRef(() => PrismaModule),
  // ],
  providers: [
    // 权限业务逻辑服务
    PermissionService,
    // 接口权限守卫，全局可通过 @UseGuards(PermissionsGuard) 使用
    PermissionsGuard,
  ],
  exports: [
    // 导出服务，其他模块可注入使用权限查询、缓存清理、角色管理方法
    PermissionService,
    // 导出守卫，控制器可直接引入使用
    PermissionsGuard,
  ],
})
export class PermissionModule {}