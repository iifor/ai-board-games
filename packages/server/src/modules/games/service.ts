import type { CompiledGame } from '@battle/engine';
import type { GameCatalogItem } from '@battle/shared';
import { notFound } from '../../utils/errors';

function toCatalogItem(game: CompiledGame): GameCatalogItem {
  const { spec } = game;
  return {
    key: spec.key,
    title: spec.title,
    description: spec.description,
    players: spec.players,
    layout: spec.presentation.layout,
    variants: Object.entries(spec.variants ?? {}).map(([key, variant]) => ({
      key,
      name: variant.name,
      description: variant.description ?? '',
      players: variant.players ?? spec.players,
    })),
    defaultVariant: spec.defaultVariant ?? null,
  };
}

/** 游戏目录来自注册表，前端不硬编码游戏列表 */
export function createGameService(registry: ReadonlyMap<string, CompiledGame>) {
  return {
    catalog: (): GameCatalogItem[] => [...registry.values()].map(toCatalogItem),
    find(key: string): CompiledGame {
      const game = registry.get(key);
      if (!game) throw notFound(`游戏 ${key}`);
      return game;
    },
  };
}

export type GameService = ReturnType<typeof createGameService>;
