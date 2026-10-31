import type { CompiledGame } from '../compiler/compile';
import type { Seat } from './types';

export function seatLabel(game: CompiledGame, seat: Seat): string {
  return game.spec.seatLabel?.(seat) ?? `${seat.seat}号 ${seat.profile.name}`;
}

export function phaseTitle(game: CompiledGame, phaseId: string | null): string {
  if (phaseId === null) return '';
  return game.spec.phases[phaseId]?.title ?? phaseId;
}
