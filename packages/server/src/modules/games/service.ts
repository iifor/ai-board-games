import type { CompiledGame } from '@battle/engine';
import type { GameCatalogItem, PhaseGraphDto } from '@battle/shared';
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
    /** 调试台用的阶段图：阶段、类型、标题与可能的跳转目标 */
    phaseGraph(key: string): PhaseGraphDto {
      const { spec } = this.find(key);
      return {
        gameKey: spec.key,
        start: spec.start,
        phases: Object.entries(spec.phases).map(([id, phase]) => ({
          id,
          kind: phase.kind,
          title: phase.title ?? null,
          next: typeof phase.next === 'string' ? [phase.next] : phase.next.map((transition) => transition.goto),
        })),
      };
    },
    find(key: string): CompiledGame {
      const game = registry.get(key);
      if (!game) throw notFound(`游戏 ${key}`);
      return game;
    },
  };
}

export type GameService = ReturnType<typeof createGameService>;
