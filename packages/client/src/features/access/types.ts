import type { AccessProfile } from '@battle/shared';

/** 本机保存的开局凭证与持有人信息；只是便利缓存，权限以服务端校验为准 */
export interface StoredAccess extends AccessProfile {
  readonly token: string;
  readonly tokenExpiresAt: string;
}

/** 输入身份码后要继续执行的动作（通常是开局），拿到新凭证后调用 */
export type AccessContinuation = (token: string) => void;
