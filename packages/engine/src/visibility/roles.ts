import type { CompiledGame } from '../compiler/compile';
import type { EngineSnapshot, Seat } from '../runtime/types';

/** viewer 为 null 表示公开视角（观众或主持播报）；revealRoles 之后所有身份公开 */
export function roleVisibleTo(game: CompiledGame, s: EngineSnapshot, target: Seat, viewer: Seat | null): boolean {
  if (s.rolesRevealed || game.spec.roles[target.role]?.publicRole) return true;
  if (!viewer) return false;
  if (viewer.seat === target.seat) return true;
  return Boolean(game.spec.roles[viewer.role]?.knowsTeammates) && viewer.team === target.team;
}
