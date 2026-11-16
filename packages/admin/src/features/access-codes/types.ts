/** 新建 / 编辑表单的值：有效期按"从现在起多少天"填写，编辑时留空表示不改 */
export interface AccessCodeFormValues {
  username: string;
  validityDays: number | null;
  limited: boolean;
  maxMatches: number | null;
  disabled: boolean;
}

/** 刚生成的明文码：只在这一次展示 */
export interface RevealedSecret {
  readonly username: string;
  readonly secret: string;
  readonly expiresAt: string;
}
