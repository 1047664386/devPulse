import {
  Controller,
  Get,
  Put,
  Post,
  Delete,
  Param,
  Query,
  Body,
  UseGuards,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger';
import { AdminService } from './admin.service';
import { PermissionService } from '../common/permission/permission.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PermissionsGuard } from '../common/permission/permissions.guard';
import { RequirePermission } from '../common/permission/require-permission.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { UpdateUserRoleDto } from './dto/update-user-role.dto';
import { BanUserDto } from './dto/ban-user.dto';
import { CreateRoleDto } from './dto/create-role.dto';
import { UpdateRolePermissionsDto } from './dto/update-role-permissions.dto';

@ApiTags('Admin')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, PermissionsGuard)
@RequirePermission('admin:access')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly permissionService: PermissionService,
  ) {}

  // ─── Dashboard ─────────────────────────────────────
  @Get('dashboard')
  getDashboard() {
    return this.adminService.getDashboard();
  }

  // ─── Users ─────────────────────────────────────────
  @Get('users')
  getUsers(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
  ) {
    return this.adminService.getUsers(page, pageSize, search);
  }

  @Put('users/:id/roles')
  updateUserRoles(
    @Param('id') id: string,
    @Body() dto: UpdateUserRoleDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.updateUserRoles(id, dto.roleIds, adminId);
  }

  @Post('users/:id/ban')
  banUser(
    @Param('id') id: string,
    @Body() dto: BanUserDto,
    @CurrentUser('id') adminId: string,
  ) {
    return this.adminService.banUser(id, dto.action, dto.reason, adminId);
  }

  // ─── Roles ─────────────────────────────────────────
  @Get('roles')
  @RequirePermission('role:manage')
  getAllRoles() {
    return this.adminService.getAllRoles();
  }

  @Post('roles')
  @RequirePermission('role:manage')
  createRole(@Body() dto: CreateRoleDto) {
    return this.permissionService.createRole(dto.name, dto.description);
  }

  @Delete('roles/:id')
  @RequirePermission('role:manage')
  deleteRole(@Param('id') id: string) {
    return this.permissionService.deleteRole(id);
  }

  // ─── Articles ──────────────────────────────────────
  @Get('articles')
  getArticles(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
    @Query('pageSize', new DefaultValuePipe(20), ParseIntPipe) pageSize: number,
    @Query('search') search?: string,
    @Query('status') status?: string,
  ) {
    return this.adminService.getArticles(page, pageSize, search, status);
  }

  @Delete('articles/:id')
  deleteArticle(@Param('id') id: string) {
    return this.adminService.deleteArticle(id);
  }

  // ─── Tags ──────────────────────────────────────────
  @Get('tags')
  getTags() {
    return this.adminService.getTags();
  }

  @Delete('tags/:id')
  deleteTag(@Param('id') id: string) {
    return this.adminService.deleteTag(id);
  }

  // ─── Permissions ─────────────────────────────────────
  @Get('permissions')
  @RequirePermission('permission:manage')
  getAllPermissions() {
    return this.permissionService.getAllPermissions();
  }

  @Get('roles/permissions')
  @RequirePermission('permission:manage')
  getRolesWithPermissions() {
    return this.permissionService.getAllRolesWithPermissions();
  }

  @Put('roles/:roleId/permissions')
  @RequirePermission('permission:manage')
  updateRolePermissions(
    @Param('roleId') roleId: string,
    @Body() dto: UpdateRolePermissionsDto,
  ) {
    return this.permissionService.setRolePermissions(roleId, dto.permissionIds);
  }
}
