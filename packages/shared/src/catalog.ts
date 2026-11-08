export type StageLayout = 'versus' | 'circle';

/** 变体的角色构成（展示用）：按声明顺序，rest 按人数上限折算 */
export interface VariantRoleItem {
  readonly name: string;
  readonly team: string;
  readonly count: number;
  /** 角色数随人数变化时的最小值，count 仍表示最大值。 */
  readonly minCount?: number;
}

export interface GameVariantItem {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly roles: readonly VariantRoleItem[];
}

export interface GameCatalogItem {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly layout: StageLayout;
  /** 开局就能确定的公开席位分组，按座号排列，数量按游戏人数上限计算。 */
  readonly seatGroups?: readonly VariantRoleItem[];
  /** 玩法变体（如狼人杀板子）；没有变体时为空 */
  readonly variants: readonly GameVariantItem[];
  readonly defaultVariant: string | null;
}
