import type { CompiledGame, SeatProfile } from '@battle/engine';
import type { SeatRow } from './types';

/** 只有引擎快照需要玩家标识。调试座位独立于玩家、模型与音色资源。 */
export function generateSeats(game: CompiledGame, requestedVariant?: string) {
  const variant = requestedVariant ?? game.spec.defaultVariant;
  const variantRange = variant === undefined ? undefined : game.spec.variants?.[variant]?.players;
  const count = (variantRange ?? game.spec.players).min;
  const profiles: SeatProfile[] = [];
  const seats: SeatRow[] = [];
  for (let seat = 1; seat <= count; seat++) {
    const name = `${String(seat).padStart(2, '0')} 号模拟玩家`;
    profiles.push({ playerId: `debug-${seat}`, name, persona: '用于脚本化对局的模拟玩家', avatar: null });
    seats.push({ seat, playerId: null, playerName: name, modelId: null, voiceId: null });
  }
  return { profiles, seats };
}
