/** 身份码的当前状态：由停用标记、有效期与局数上限推算，不单独存储 */
export type AccessCodeStatus = 'active' | 'disabled' | 'expired' | 'exhausted';

/** 后台列表中的身份码；明文码只在创建或重新生成时返回一次 */
export interface AccessCodeDto {
  readonly id: number;
  readonly username: string;
  /** 明文码末 4 位，便于核对发出的是哪一个 */
  readonly codeHint: string;
  readonly expiresAt: string;
  /** null 表示不限局数 */
  readonly maxMatches: number | null;
  readonly usedMatches: number;
  readonly disabled: boolean;
  readonly status: AccessCodeStatus;
  readonly lastUsedAt: string | null;
  readonly createdAt: string;
}

/** 新建与编辑共用：编辑时可同时停用或恢复 */
export interface AccessCodeInput {
  readonly username: string;
  readonly expiresAt: string;
  readonly maxMatches: number | null;
  readonly disabled?: boolean | undefined;
}

/** 创建或重新生成后的响应：secret 是明文码，服务端不再保存 */
export interface AccessCodeSecret {
  readonly accessCode: AccessCodeDto;
  readonly secret: string;
}

export interface AccessSessionRequest {
  readonly code: string;
}

/** C 端凭证的持有人信息；remainingMatches 为 null 表示不限局数 */
export interface AccessProfile {
  readonly username: string;
  readonly expiresAt: string;
  readonly remainingMatches: number | null;
}

export interface AccessSessionResponse extends AccessProfile {
  readonly token: string;
  /** 凭证到期时间，不晚于身份码有效期 */
  readonly tokenExpiresAt: string;
}
