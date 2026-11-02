export type StageLayout = 'versus' | 'circle';

/** 变体的角色构成（展示用）：按声明顺序，rest 按人数上限折算 */
export interface VariantRoleItem {
  readonly name: string;
  readonly team: string;
  readonly count: number;
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
  /** 玩法变体（如狼人杀板子）；没有变体时为空 */
  readonly variants: readonly GameVariantItem[];
  readonly defaultVariant: string | null;
}
