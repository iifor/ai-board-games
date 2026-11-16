export interface AdminIdentity {
  readonly id: number;
  readonly username: string;
  readonly mustChangePassword: boolean;
}

/** C 端凭证对应的身份码：开局时据此扣减局数并记录发起人 */
export interface AccessGrant {
  readonly codeId: number;
  /** 签发凭证时身份码的版本；重新生成后旧凭证不再匹配 */
  readonly generation: number;
  readonly username: string;
}

export interface AppEnv {
  Variables: {
    requestId: string;
    admin: AdminIdentity;
    access: AccessGrant;
  };
}
