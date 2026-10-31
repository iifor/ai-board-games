export type StageLayout = 'versus' | 'circle';

export interface GameCatalogItem {
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly players: { readonly min: number; readonly max: number };
  readonly layout: StageLayout;
}
