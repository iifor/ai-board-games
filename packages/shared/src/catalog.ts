export type StageLayout = 'versus' | 'circle';

export interface GameVariantItem {
  readonly key: string;
  readonly name: string;
  readonly description: string;
  readonly players: { readonly min: number; readonly max: number };
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
