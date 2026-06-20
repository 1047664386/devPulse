import api from './api';
import type {
  ApiResponse,
  ArticleDetail,
  ArticleListItem,
  ArticleListParams,
  BookmarkItem,
  BookmarkToggleResponse,
  Comment,
  CreateArticleRequest,
  CreateCommentRequest,
  CreateTagRequest,
  DashboardStats,
  FollowToggleResponse,
  Notification,
  PaginationMeta,
  RoleDetail,
  RoleListItem,
  SaveDraftRequest,
  SearchResult,
  SearchSuggestion,
  Session,
  Tag,
  ToggleResponse,
  UpdateArticleRequest,
  UpdatePasswordRequest,
  UpdateProfileRequest,
  User,
  UserAdmin,
  UserProfile,
  BanRequest,
} from '@/types/api';

// ==================== Auth ====================

export const authApi = {
  getMe: () => api.get<ApiResponse<User>>('/auth/me').then((r) => r.data.data),

  /** 登出当前设备（传 refreshToken，服务端解码出 deviceId 单设备下线） */
  logout: (refreshToken?: string) =>
    api.post('/auth/logout', refreshToken ? { refreshToken } : {}),

  /** 强制所有设备下线 */
  logoutAll: () => api.post('/auth/logout-all'),

  /** 获取所有活跃设备会话 */
  getSessions: () =>
    api.get<ApiResponse<Session[]>>('/auth/sessions').then((r) => r.data.data),

  /** 注销指定设备 */
  logoutDevice: (deviceId: string) =>
    api.delete(`/auth/sessions/${deviceId}`),
};

// ==================== Articles ====================

export const articleApi = {
  list: (params?: ArticleListParams) =>
    api
      .get<{ data: ArticleListItem[]; meta: PaginationMeta }>('/articles', { params })
      .then((r) => r.data),

  getBySlug: (slug: string) =>
    api.get<ApiResponse<ArticleDetail>>(`/articles/${slug}`).then((r) => r.data.data),

  getById: (id: string) =>
    api.get<ApiResponse<ArticleDetail>>(`/articles/id/${id}`).then((r) => r.data.data),

  create: (data: CreateArticleRequest) =>
    api.post<ApiResponse<ArticleDetail>>('/articles', data).then((r) => r.data.data),

  update: (id: string, data: UpdateArticleRequest) =>
    api.put<ApiResponse<ArticleDetail>>(`/articles/${id}`, data).then((r) => r.data.data),

  remove: (id: string) => api.delete(`/articles/${id}`),

  toggleLike: (id: string) =>
    api.post<ApiResponse<ToggleResponse>>(`/articles/${id}/like`).then((r) => r.data.data),

  toggleBookmark: (id: string) =>
    api.post<ApiResponse<BookmarkToggleResponse>>(`/articles/${id}/bookmark`).then((r) => r.data.data),

  // ─── Draft ──────────────────────────────────────────

  /** 创建新草稿（无格式校验） */
  saveDraft: (data: SaveDraftRequest) =>
    api.post<ApiResponse<ArticleDetail>>('/articles/save-draft', data).then((r) => r.data.data),

  /** 更新已有草稿（无格式校验） */
  updateDraft: (id: string, data: SaveDraftRequest) =>
    api.put<ApiResponse<ArticleDetail>>(`/articles/${id}/save-draft`, data).then((r) => r.data.data),

  /** 获取当前用户的草稿列表 */
  getDrafts: (params?: { page?: number; pageSize?: number }) =>
    api
      .get<{ data: ArticleListItem[]; meta: PaginationMeta }>('/articles/drafts', { params })
      .then((r) => r.data),
};

// ==================== Tags ====================

export const tagApi = {
  list: () => api.get<ApiResponse<Tag[]>>('/tags').then((r) => r.data.data),

  getBySlug: (slug: string) =>
    api.get<ApiResponse<Tag>>(`/tags/${slug}`).then((r) => r.data.data),

  create: (data: CreateTagRequest) =>
    api.post<ApiResponse<Tag>>('/tags', data).then((r) => r.data.data),
};

// ==================== Users ====================

export const userApi = {
  getProfile: (id: string) =>
    api.get<ApiResponse<UserProfile>>(`/users/${id}`).then((r) => r.data.data),

  getArticles: (id: string, params?: { page?: number; pageSize?: number }) =>
    api
      .get<{ data: ArticleListItem[]; meta: PaginationMeta }>(`/users/${id}/articles`, { params })
      .then((r) => r.data),

  toggleFollow: (id: string) =>
    api.post<ApiResponse<FollowToggleResponse>>(`/users/${id}/follow`).then((r) => r.data.data),

  getFollowers: (id: string) =>
    api.get<ApiResponse<User[]>>('/users/' + id + '/followers').then((r) => r.data.data),

  getFollowing: (id: string) =>
    api.get<ApiResponse<User[]>>('/users/' + id + '/following').then((r) => r.data.data),
};

// ==================== Profile (current user) ====================

export const profileApi = {
  update: (data: UpdateProfileRequest) =>
    api.put<ApiResponse<User>>('/profile', data).then((r) => r.data.data),

  changePassword: (data: UpdatePasswordRequest) =>
    api.put('/profile/password', data),

  getBookmarks: (params?: { page?: number; pageSize?: number }) =>
    api
      .get<{ data: BookmarkItem[]; meta: PaginationMeta }>('/profile/bookmarks', { params })
      .then((r) => r.data),

  uploadAvatar: (file: File) => {
    const form = new FormData();
    form.append('file', file);
    return api
      .post<ApiResponse<{ url: string }>>('/upload/image', form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then((r) => r.data.data);
  },
};

// ==================== Comments ====================

export const commentApi = {
  list: (articleId: string) =>
    api.get<ApiResponse<Comment[]>>(`/articles/${articleId}/comments`).then((r) => r.data.data),

  create: (articleId: string, data: CreateCommentRequest) =>
    api
      .post<ApiResponse<Comment>>(`/articles/${articleId}/comments`, data)
      .then((r) => r.data.data),

  remove: (articleId: string, id: string) => api.delete(`/articles/${articleId}/comments/${id}`),

  toggleLike: (articleId: string, id: string) =>
    api.post<ApiResponse<ToggleResponse>>(`/articles/${articleId}/comments/${id}/like`).then((r) => r.data.data),
};

// ==================== Notifications ====================

export const notificationApi = {
  list: (params?: { page?: number; pageSize?: number }) =>
    api
      .get<{ data: Notification[]; meta: PaginationMeta & { unreadCount: number } }>(
        '/notifications',
        { params },
      )
      .then((r) => r.data),

  markRead: (id: string) => api.put(`/notifications/${id}/read`),

  markAllRead: () => api.put('/notifications/read-all'),

  unreadCount: () =>
    api.get<ApiResponse<{ count: number }>>('/notifications/unread-count').then((r) => r.data.data),
};

// ==================== Search ====================

export const searchApi = {
  search: (q: string, params?: { page?: number; pageSize?: number }) =>
    api
      .get<{ data: SearchResult[]; meta: PaginationMeta }>('/search', {
        params: { q, ...params },
      })
      .then((r) => r.data),

  suggest: (q: string) =>
    api.get<ApiResponse<SearchSuggestion[]>>('/search/suggest', { params: { q } }).then((r) => r.data.data),
};

// ==================== Admin ====================

export const adminApi = {
  dashboard: () =>
    api.get<ApiResponse<DashboardStats>>('/admin/dashboard').then((r) => r.data.data),

  // Users
  listUsers: (params?: { page?: number; pageSize?: number; search?: string }) =>
    api
      .get<{ data: UserAdmin[]; meta: PaginationMeta }>('/admin/users', { params })
      .then((r) => r.data),

  updateRoles: (userId: string, roleIds: string[]) =>
    api.put(`/admin/users/${userId}/roles`, { roleIds }),

  ban: (userId: string, data: BanRequest) =>
    api.post(`/admin/users/${userId}/ban`, data),

  // Roles
  listRoles: () =>
    api.get<ApiResponse<RoleListItem[]>>('/admin/roles').then((r) => r.data.data),

  createRole: (data: { name: string; description?: string }) =>
    api.post<ApiResponse<RoleListItem>>('/admin/roles', data).then((r) => r.data.data),

  deleteRole: (roleId: string) =>
    api.delete(`/admin/roles/${roleId}`),

  // Articles
  listArticles: (params?: { page?: number; pageSize?: number }) =>
    api
      .get<{ data: ArticleListItem[]; meta: PaginationMeta }>('/admin/articles', { params })
      .then((r) => r.data),

  deleteArticle: (id: string) => api.delete(`/admin/articles/${id}`),

  // Tags
  listTags: () => api.get<ApiResponse<Tag[]>>('/admin/tags').then((r) => r.data.data),

  deleteTag: (id: string) => api.delete(`/admin/tags/${id}`),

  // Permissions
  getAllPermissions: () =>
    api
      .get<ApiResponse<Array<{ id: string; resource: string; action: string; description: string | null }>>>(
        '/admin/permissions',
      )
      .then((r) => r.data.data),

  getRolesWithPermissions: () =>
    api
      .get<ApiResponse<RoleDetail[]>>('/admin/roles/permissions')
      .then((r) => r.data.data),

  updateRolePermissions: (roleId: string, permissionIds: string[]) =>
    api.put(`/admin/roles/${roleId}/permissions`, { permissionIds }),
};
