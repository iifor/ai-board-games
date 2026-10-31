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
