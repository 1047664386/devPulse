/**
 * 业务错误码常量
 *
 * 编码规则：
 *   0         → 成功
 *   1         → 未知错误（兜底）
 *   1001~1099 → 通用 / 参数校验 / 系统级
 *   20001~20099 → 认证与令牌
 *   30001~30099 → 用户与资料
 *   40001~40099 → 文章
 *   50001~50099 → 评论
 *   60001~60099 → 标签
 *   70001~70099 → 通知
 *   80001~80099 → 上传 / 文件
 *   81001~81099 → 搜索
 *   90001~90099 → 管理后台
 *   99001~99099 → 系统内部
 *
 * 约定：
 *   code === 0  → 成功
 *   code !== 0  → 失败
 *   code 为纯数字，不含英文
 */

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  成功
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrSuccess = 0;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  兜底
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrUnknown = 1;

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  1001~1099 — 通用 / 参数校验 / 系统级
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrParamInvalid      = 1001; // 参数校验失败
export const ErrParamMissing      = 1002; // 缺少必要参数
export const ErrMethodNotAllowed  = 1003; // 请求方法不允许
export const ErrRateLimited       = 1004; // 请求过于频繁
export const ErrSystemBusy        = 1005; // 系统繁忙，请稍后重试
export const ErrServiceUnavailable = 1006; // 服务暂不可用
export const ErrDataConflict      = 1010; // 数据冲突（唯一约束）

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  20001~20099 — 认证与令牌
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrNotAuthenticated  = 20001; // 未登录或令牌已过期
export const ErrEmailOrPwdWrong   = 20010; // 邮箱或密码错误
export const ErrAccountBanned     = 20011; // 账号已被封禁
export const ErrTokenExpired      = 20012; // 令牌已过期
export const ErrTokenInvalid      = 20013; // 令牌无效
export const ErrTokenRevoked      = 20014; // 令牌已被撤销
export const ErrTokenReuse        = 20015; // 令牌重用检测，所有会话已撤销
export const ErrEmailRegistered   = 20020; // 邮箱已被注册
export const ErrUsernameTaken     = 20021; // 用户名已被占用

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  30001~30099 — 用户与资料
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrUserNotFound      = 30001; // 用户不存在
export const ErrCannotFollowSelf  = 30010; // 不能关注自己
export const ErrPasswordWrong     = 30020; // 当前密码不正确

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  40001~40099 — 文章
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrArticleNotFound     = 40001; // 文章不存在
export const ErrArticleNoPerm       = 40002; // 无权操作此文章
export const ErrArticleConflict     = 40003; // 文章已被他人修改，请刷新后重试
export const ErrArticleNotPublished = 40004; // 文章未发布

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  50001~50099 — 评论
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrCommentNotFound    = 50001; // 评论不存在
export const ErrCommentNoPerm      = 50002; // 无权操作此评论
export const ErrCommentParentWrong = 50003; // 父评论不属于该文章

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  60001~60099 — 标签
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrTagNotFound   = 60001; // 标签不存在
export const ErrTagDuplicate  = 60002; // 标签名已存在

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  70001~70099 — 通知
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrNotificationNotFound = 70001; // 通知不存在
export const ErrNotificationNoPerm   = 70002; // 无权操作此通知

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  80001~80099 — 上传 / 文件
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrFileEmpty        = 80001; // 未选择文件
export const ErrFileTypeInvalid  = 80002; // 不支持的文件类型
export const ErrFileTooLarge     = 80003; // 文件超过大小限制

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  81001~81099 — 搜索
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrSearchQueryEmpty = 81001; // 搜索关键词不能为空

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  90001~90099 — 管理后台
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrCannotModifySelf    = 90001; // 不能修改自己的角色
export const ErrCannotBanSelf       = 90002; // 不能封禁自己
export const ErrLastAdmin           = 90003; // 不能移除最后一个管理员
export const ErrRoleNotFound        = 90004; // 角色不存在
export const ErrCannotDeleteSysRole = 90005; // 不能删除系统内置角色

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  99001~99099 — 系统内部
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ErrDatabaseError   = 99001; // 数据库异常
export const ErrRedisError      = 99002; // 缓存服务异常

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//  错误码 → 对外脱敏消息 映射表
//  （对外只展示这些消息，内部日志记详细信息）
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
export const ERROR_MESSAGES: Record<number, string> = {
  [ErrSuccess]:           '操作成功',
  [ErrUnknown]:           '服务异常，请稍后重试',
  [ErrParamInvalid]:      '参数校验失败',
  [ErrParamMissing]:      '缺少必要参数',
  [ErrMethodNotAllowed]:  '请求方法不允许',
  [ErrRateLimited]:       '请求过于频繁，请稍后再试',
  [ErrSystemBusy]:        '系统繁忙，请稍后重试',
  [ErrServiceUnavailable]:'服务暂不可用',
  [ErrDataConflict]:      '数据冲突',

  [ErrNotAuthenticated]:  '请先登录',
  [ErrEmailOrPwdWrong]:   '邮箱或密码错误',
  [ErrAccountBanned]:     '账号已被封禁',
  [ErrTokenExpired]:      '登录已过期，请重新登录',
  [ErrTokenInvalid]:      '登录状态无效',
  [ErrTokenRevoked]:      '登录已被撤销',
  [ErrTokenReuse]:        '检测到账号在其他设备登录',
  [ErrEmailRegistered]:   '该邮箱已被注册',
  [ErrUsernameTaken]:     '该用户名已被占用',

  [ErrUserNotFound]:      '用户不存在',
  [ErrCannotFollowSelf]:  '不能关注自己',
  [ErrPasswordWrong]:     '当前密码不正确',

  [ErrArticleNotFound]:     '内容不存在',
  [ErrArticleNoPerm]:       '没有操作权限',
  [ErrArticleConflict]:     '内容已被修改，请刷新后重试',
  [ErrArticleNotPublished]: '内容未发布',

  [ErrCommentNotFound]:    '评论不存在',
  [ErrCommentNoPerm]:      '没有操作权限',
  [ErrCommentParentWrong]: '回复的评论不存在',

  [ErrTagNotFound]:   '标签不存在',
  [ErrTagDuplicate]:  '标签已存在',

  [ErrNotificationNotFound]: '通知不存在',
  [ErrNotificationNoPerm]:   '没有操作权限',

  [ErrFileEmpty]:        '请选择文件',
  [ErrFileTypeInvalid]:  '不支持的文件类型',
  [ErrFileTooLarge]:     '文件超过大小限制',

  [ErrSearchQueryEmpty]: '请输入搜索关键词',

  [ErrCannotModifySelf]:    '不能修改自己的角色',
  [ErrCannotBanSelf]:       '不能封禁自己',
  [ErrLastAdmin]:           '不能移除最后一个管理员',
  [ErrRoleNotFound]:        '角色不存在',
  [ErrCannotDeleteSysRole]: '不能删除系统内置角色',

  [ErrDatabaseError]:  '服务异常，请稍后重试',
  [ErrRedisError]:     '服务异常，请稍后重试',
};
