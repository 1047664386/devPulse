# DevPulse Web

React 19 前端，SPA 架构，对接 DevPulse API。

## 技术栈

- **框架**: React 19 + TypeScript 6
- **构建**: Vite 8
- **样式**: Tailwind CSS 4
- **路由**: React Router 7
- **数据请求**: TanStack Query 5 (React Query)
- **状态管理**: Zustand 5
- **富文本**: TipTap 3
- **表单**: React Hook Form 7 + Zod 4
- **图标**: Lucide React
- **HTTP**: Axios

## 目录结构

```
src/
├── main.tsx                     # 入口
├── App.tsx                      # 路由配置
├── lib/
│   ├── api.ts                   # Axios 实例 + 拦截器（自动刷新 token）
│   ├── api-services.ts          # 全部 API 调用封装
│   └── utils.ts                 # cn() 工具函数
├── types/
│   └── api.ts                   # TypeScript 类型定义 + hasRole/getRoleNames 工具
├── stores/
│   └── authStore.ts             # Zustand 认证状态
├── layouts/
│   ├── MainLayout.tsx           # 主布局（顶部导航 + 页脚）
│   ├── AuthLayout.tsx           # 认证布局（登录/注册，已登录自动重定向）
│   └── ...
└── features/
    ├── article/                 # 文章模块
    │   ├── HomePage.tsx         #   首页文章列表
    │   ├── ArticleDetailPage.tsx#   文章详情 + 评论
    │   ├── ArticleEditorPage.tsx#   富文本编辑器
    │   └── TagsPage.tsx         #   标签浏览
    ├── auth/                    # 认证模块
    │   ├── LoginPage.tsx
    │   └── RegisterPage.tsx
    ├── user/                    # 用户模块
    │   ├── UserProfilePage.tsx  #   用户主页 + 统计
    │   ├── SettingsPage.tsx     #   个人设置
    │   └── BookmarksPage.tsx    #   收藏列表
    ├── notification/            # 通知模块
    │   └── NotificationsPage.tsx
    ├── search/                  # 搜索模块
    │   └── SearchPage.tsx
    └── admin/                   # 管理后台
        ├── AdminLayout.tsx      #   侧栏布局 + ADMIN 路由守卫
        ├── DashboardPage.tsx    #   仪表盘统计图表
        ├── UsersManagePage.tsx  #   用户管理（多角色分配 + 封禁）
        ├── ArticlesManagePage.tsx#  文章管理
        ├── TagsManagePage.tsx   #   标签管理
        ├── RolesManagePage.tsx  #   角色管理（创建/删除自定义角色）
        └── PermissionsManagePage.tsx # 权限矩阵管理
```

## 路由

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | HomePage | 文章列表（分页/排序/标签筛选） |
| `/article/:slug` | ArticleDetailPage | 文章详情 + 评论 |
| `/editor` | ArticleEditorPage | 创建文章 |
| `/editor/:id` | ArticleEditorPage | 编辑文章 |
| `/tags` | TagsPage | 标签浏览 |
| `/users/:id` | UserProfilePage | 用户主页 |
| `/settings` | SettingsPage | 个人设置 |
| `/bookmarks` | BookmarksPage | 收藏列表 |
| `/notifications` | NotificationsPage | 通知中心 |
| `/search` | SearchPage | 全文搜索 |
| `/login` | LoginPage | 登录（已登录自动跳转） |
| `/register` | RegisterPage | 注册（已登录自动跳转） |
| `/admin` | AdminLayout | 管理后台（ADMIN 守卫） |
| `/admin/users` | UsersManagePage | 用户管理 |
| `/admin/articles` | ArticlesManagePage | 文章管理 |
| `/admin/tags` | TagsManagePage | 标签管理 |
| `/admin/roles` | RolesManagePage | 角色管理 |
| `/admin/permissions` | PermissionsManagePage | 权限管理 |

## 认证流程

1. 登录成功 → 存储 accessToken + refreshToken + user 到 Zustand
2. Axios 拦截器自动在请求头附加 `Authorization: Bearer <token>`
3. 收到 401 → 自动用 refreshToken 刷新 → 重试原请求
4. refresh 失败 → 清除状态 → 跳转登录页
5. AdminLayout 检查 `hasRole(user, 'ADMIN')`，非管理员重定向到首页

## 脚本

```bash
pnpm dev        # 启动开发服务器（HMR）
pnpm build      # TypeScript 编译 + Vite 构建
pnpm preview    # 预览构建产物
```

## 环境变量

Vite 环境变量通过 `.env` 文件配置，以 `VITE_` 前缀暴露给客户端代码。当前 API 地址硬编码为 `http://localhost:3000/api/v1`（见 `src/lib/api.ts`）。
