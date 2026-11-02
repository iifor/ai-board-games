import type { GameCatalogItem } from '@battle/shared';

/** 人数范围，来自游戏目录（板子有自己的范围时以板子为准） */
export type PlayerRange = GameCatalogItem['players'];

/**
 * 从终局带到开局页的初值（路由 state）：终局"同样阵容再来一局"用 rematchStateOf 生成，
 * 开局页用 isSetupInitial 校验后作为 SetupForm 的 initial。只认识这两个字段
 */
export interface SetupInitial {
  readonly variant?: string | null;
  readonly playerIds?: readonly number[];
}

export interface TopicDraft {
  readonly title: string;
  readonly pro: string;
  readonly con: string;
}
