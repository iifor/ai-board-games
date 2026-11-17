/** 后台令牌的 JWT audience，与 C 端开局凭证互不通用 */
export const ADMIN_TOKEN_AUDIENCE = 'admin';
export const TOKEN_TTL_SECONDS = 12 * 60 * 60;
export const EXPIRED_SESSION = '登录已失效，请重新登录';
/** 同一来源对同一用户名在窗口期内允许的失败次数（按来源区分，别处猜错密码锁不住正常管理员） */
export const MAX_FAILED_LOGINS = 10;
/** 同一来源在窗口期内对任意用户名累计允许的失败次数（防止换用户名无限猜） */
export const MAX_FAILED_LOGINS_PER_SOURCE = 30;
export const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
