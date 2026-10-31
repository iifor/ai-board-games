import type { LogDraft, SeatReassignment } from '@battle/engine';
import type { NightDeathCause } from '../state';
import type { NightTally } from './types';

/** 追加一名夜间死者；已在名单中的不重复记录（先记录的原因优先） */
export function addDeath(tally: NightTally, seat: number, cause: NightDeathCause): NightTally {
  if (isDying(tally, seat)) return tally;
  return { ...tally, deaths: [...tally.deaths, { seat, cause }] };
}

export function isDying(tally: NightTally, seat: number): boolean {
  return tally.deaths.some((death) => death.seat === seat);
}

/** 从名单中移除（如大树挡下第一刀、被感染者不死） */
export function removeDeath(tally: NightTally, seat: number): NightTally {
  return { ...tally, deaths: tally.deaths.filter((death) => death.seat !== seat) };
}

export function deathCause(tally: NightTally, seat: number): NightDeathCause | null {
  return tally.deaths.find((death) => death.seat === seat)?.cause ?? null;
}

export function noteTally(tally: NightTally, ...log: readonly LogDraft[]): NightTally {
  return { ...tally, log: [...(tally.log ?? []), ...log] };
}

export function reassignTally(tally: NightTally, ...reassign: readonly SeatReassignment[]): NightTally {
  return { ...tally, reassign: [...(tally.reassign ?? []), ...reassign] };
}
