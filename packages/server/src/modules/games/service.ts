import type { CompiledGame } from '@battle/engine';
import type { GameCatalogItem, PhaseGraphDto, VariantRoleItem } from '@battle/shared';
import { notFound } from '../../utils/errors';

/** 按声明顺序展示角色构成，rest 的数量来自合法人数范围。 */
function variantRoles(game: CompiledGame, assign: Readonly<Record<string, number | 'rest'>>, players: GameCatalogItem['players']): VariantRoleItem[] {
  const fixed = Object.values(assign).reduce<number>((sum, count) => sum + (count === 'rest' ? 0 : count), 0);
  return Object.entries(assign).map(([role, count]) => {
    const spec = game.spec.roles[role];
    return {
      name: spec?.name ?? role, team: spec?.team ?? '',
      count: count === 'rest' ? players.max - fixed : count,
      ...(count === 'rest' && players.min !== players.max ? { minCount: players.min - fixed } : {}),
    };
  });
}

function toCatalogItem(game: CompiledGame): GameCatalogItem {
  const { spec } = game;
  const roles = Object.keys(spec.setup.assign);
  const publicFixedSeats = spec.setup.shuffle === false && !spec.setup.deal && !spec.variants &&
    roles.every((role) => spec.roles[role]?.publicRole) &&
    roles.slice(0, -1).every((role) => spec.setup.assign[role] !== 'rest');
  return {
    key: spec.key,
    title: spec.title,
    description: spec.description,
    players: spec.players,
    layout: spec.presentation.layout,
    ...(publicFixedSeats ? { seatGroups: variantRoles(game, spec.setup.assign, spec.players) } : {}),
    variants: Object.entries(spec.variants ?? {}).map(([key, variant]) => ({
      key,
      name: variant.name,
      description: variant.description ?? '',
      players: variant.players ?? spec.players,
      roles: variantRoles(game, variant.assign, variant.players ?? spec.players),
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
