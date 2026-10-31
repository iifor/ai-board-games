import type { CompiledGame } from '../compiler/compile';
import type { Seat } from '../runtime/types';

/** viewer 为 null 表示公开视角（观众或主持播报） */
export function roleVisibleTo(game: CompiledGame, target: Seat, viewer: Seat | null): boolean {
  if (game.spec.roles[target.role]?.publicRole) return true;
  if (!viewer) return false;
  if (viewer.seat === target.seat) return true;
  return Boolean(game.spec.roles[viewer.role]?.knowsTeammates) && viewer.team === target.team;
}
