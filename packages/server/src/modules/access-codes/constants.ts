/** 明文码字符集：去掉容易看错的 0/O、1/I/L，30 个字符 */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
/** 16 位约 78 bit 熵，按 4 位一组以连字符展示 */
export const CODE_LENGTH = 16;
export const CODE_GROUP_SIZE = 4;
export const CODE_HINT_LENGTH = 4;

/** C 端凭证的 JWT audience，与后台令牌互不通用 */
export const ACCESS_TOKEN_AUDIENCE = 'access';
/** 凭证最长有效期；身份码先到期则以身份码为准 */
export const ACCESS_TOKEN_MAX_TTL_SECONDS = 30 * 24 * 60 * 60;

/** 同一来源在窗口期内允许输错身份码的次数 */
export const MAX_FAILED_ACCESS_PER_SOURCE = 10;
export const FAILED_ACCESS_WINDOW_MS = 15 * 60 * 1000;

/** 有效期最长可设到多久之后 */
export const MAX_ACCESS_CODE_DAYS = 366;
