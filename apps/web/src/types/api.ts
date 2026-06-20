// ==================== API Response Types ====================

/**
 * 统一成功响应格式
 *
 * code: 0       → 成功
 * code: 非 0    → 失败（数字业务错误码）
 * requestId     → 关联后端日志，排查问题时提供给后端
 */
export interface ApiResponse<T> {
  code: number;
  message: string;
  data: T;
  meta?: PaginationMeta;
  requestId?: string;
}

/**
 * 统一错误响应格式
 *
 * code: 非 0 的业务错误码
 * message: 对外脱敏的错误消息（中文）
 * details: 参数校验时的字段级错误（仅参数校验有）
 * requestId: 关联后端日志
 */
export interface ApiError {
  code: number;
  message: string;
  details?: Array<{ field: string; message: string }>;
  requestId?: string;
}

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

// ==================== User ====================

export interface RoleInfo {
  id: string;
  name: string;
  isSystem: boolean;
}

export interface UserRoleItem {
  role: RoleInfo;
}

export interface User {
  id: string;
  email: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
  roles: UserRoleItem[];
  isBanned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface UserPublic {
  id: string;
  username: string;
  displayName: string;
  avatar: string | null;
  bio: string | null;
  roles: UserRoleItem[];
  createdAt: string;
}

/** Helper: check if a user has a specific role */
export function hasRole(user: { roles: UserRoleItem[] }, roleName: string): boolean {
  return user.roles.some((ur) => ur.role.name === roleName);
}

/** Helper: get all role names from a user */
export function getRoleNames(user: { roles: UserRoleItem[] }): string[] {
  return user.roles.map((ur) => ur.role.name);
}

/**
 * Helper: check if a user can create articles
 *
 * 对应后端权限 article:create，仅 ADMIN 和 AUTHOR 角色拥有此权限。
 * READER 只有评论权限，不能写文章。前端据此隐藏"写文章"入口，
 * 避免用户点进去后被 403 拒绝。
 */
export function canCreateArticle(user: { roles: UserRoleItem[] }): boolean {
  return user.roles.some(
    (ur) => ur.role.name === 'ADMIN' || ur.role.name === 'AUTHOR',
  );
}

export interface UserStats {
  articleCount: number;
  totalLikes: number;
  followerCount: number;
  followingCount: number;
}

export interface UserProfile extends UserPublic {
  stats: UserStats;
}

// ==================== Auth ====================

export interface LoginRequest {
  email: string;
  password: string;
  fingerprint?: string;
}

export interface RegisterRequest {
  email: string;
  username: string;
  password: string;
  displayName: string;
}

export interface AuthResponse {
  user: User;
  accessToken: string;
  refreshToken: string;
}

export interface RefreshRequest {
  refreshToken: string;
}

export interface Session {
  deviceId: string;
  deviceName: string;
  platform: string;
  ip: string;
  loginAt: string;
  lastActiveAt: string;
  fingerprint?: string;
}

// ==================== Article ====================

export type ArticleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export interface ArticleListItem {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  coverImage: string | null;
  status: ArticleStatus;
  viewCount: number;
  likeCount: number;
  commentCount: number;
  readTimeMinutes: number;
  author: UserPublic;
  tags: Tag[];
  publishedAt: string | null;
  createdAt: string;
}

export interface ArticleDetail extends ArticleListItem {
  content: string;
  version: number;
  isLiked: boolean;
  isBookmarked: boolean;
}

export interface CreateArticleRequest {
  title: string;
  content: string;
  summary?: string;
  coverImage?: string;
  tagIds?: string[];
  status?: ArticleStatus;
}

export interface UpdateArticleRequest {
  title?: string;
  content?: string;
  summary?: string;
  coverImage?: string;
  tagIds?: string[];
  version: number;
}

export interface ArticleListParams {
  page?: number;
  pageSize?: number;
  tag?: string;
  authorId?: string;
  sortBy?: 'publishedAt' | 'viewCount' | 'likeCount';
  sortOrder?: 'asc' | 'desc';
}

// ==================== Tag ====================

export interface Tag {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  color: string | null;
  articleCount: number;
}

export interface CreateTagRequest {
  name: string;
  description?: string;
  color?: string;
}

// ==================== Comment ====================

export interface Comment {
  id: string;
  content: string;
  author: UserPublic;
  likeCount: number;
  isLiked: boolean;
  replyCount: number;
  replies: CommentReply[];
  parentId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CommentReply {
  id: string;
  content: string;
  author: UserPublic;
  likeCount: number;
  isLiked: boolean;
  createdAt: string;
}

export interface CreateCommentRequest {
  content: string;
  parentId?: string | null;
}

// ==================== Like / Bookmark ====================

export interface ToggleResponse {
  liked: boolean;
  likeCount: number;
}

export interface BookmarkToggleResponse {
  bookmarked: boolean;
}

export interface BookmarkItem {
  id: string;
  article: ArticleListItem;
  createdAt: string;
}

// ==================== Follow ====================

export interface FollowToggleResponse {
  followed: boolean;
}

export interface FollowUser extends UserPublic {
  isFollowing: boolean;
  isFollowedBy: boolean;
}

// ==================== Notification ====================

export type NotificationType =
  | 'ARTICLE_LIKED'
  | 'COMMENT_RECEIVED'
  | 'COMMENT_REPLIED'
  | 'COMMENT_LIKED'
  | 'USER_FOLLOWED'
  | 'ARTICLE_PUBLISHED';

export interface Notification {
  id: string;
  type: NotificationType;
  actor: UserPublic;
  articleId: string | null;
  commentId: string | null;
  content: string;
  isRead: boolean;
  createdAt: string;
}

// ==================== Search ====================

export interface SearchResult {
  id: string;
  title: string;
  slug: string;
  summary: string | null;
  titleHighlight: string;
  rank: number;
  author: UserPublic;
  publishedAt: string | null;
}

export interface SearchSuggestion {
  title: string;
  slug: string;
}

// ==================== Admin ====================

export interface DashboardStats {
  totalUsers: number;
  totalArticles: number;
  todayNewUsers: number;
  todayNewArticles: number;
  activeUsers7d: number;
  topTags: Array<{ name: string; articleCount: number }>;
  articleGrowth: Array<{ date: string; count: number }>;
}

export interface UserAdmin extends UserPublic {
  email: string;
  isBanned: boolean;
  bannedAt: string | null;
  banReason: string | null;
}

export interface BanRequest {
  action: 'ban' | 'unban';
  reason?: string;
}

export interface RoleDetail {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: Array<{
    id: string;
    resource: string;
    action: string;
    description: string | null;
  }>;
}

export interface RoleListItem {
  id: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  createdAt: string;
  _count?: { users: number };
}

// ==================== Update Profile ====================

export interface UpdateProfileRequest {
  displayName?: string;
  bio?: string;
  avatar?: string;
}

export interface UpdatePasswordRequest {
  currentPassword: string;
  newPassword: string;
}
