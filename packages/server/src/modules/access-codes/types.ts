import type { Selectable } from 'kysely';
import type { AccessCodesTable } from '../../db/schema';

export type AccessCodeRow = Selectable<AccessCodesTable>;

/** 新建与编辑写入的字段；码哈希只在新建与重新生成时写 */
export interface AccessCodeValues {
  readonly username: string;
  readonly expiresAt: Date;
  readonly maxMatches: number | null;
  readonly disabled: boolean;
}
