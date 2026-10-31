import type { CompiledGame } from '../compiler/compile';
import type { Seat } from '../runtime/types';
import type { Visibility } from '../spec/types';

function project(visibility: Visibility, value: unknown, viewer: Seat | null): unknown {
  if (visibility === 'public') return value;
  if (visibility === 'host' || !viewer) return undefined;
  if (visibility === 'ownerOnly') {
    if (value === null || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[String(viewer.seat)];
  }
  if ('team' in visibility) return visibility.team === viewer.team ? value : undefined;
  return visibility.project(value, viewer);
}

/** 按可见性声明投影状态：未声明的字段一律不可见；viewer 为 null 表示公开视角 */
export function projectState(game: CompiledGame, state: unknown, viewer: Seat | null): Record<string, unknown> {
  if (state === null || typeof state !== 'object') return {};
  const declared = (game.spec.state.visibility ?? {}) as Readonly<Record<string, Visibility | undefined>>;
  const projected: Record<string, unknown> = {};
  for (const [field, visibility] of Object.entries(declared)) {
    if (!visibility) continue;
    const value = project(visibility, (state as Record<string, unknown>)[field], viewer);
    if (value !== undefined) projected[field] = value;
  }
  return projected;
}
