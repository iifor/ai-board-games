import type { ComputeOutcome } from '@battle/engine';
import type { NightDeathCause, PendingDeath, WerewolfState } from '../state';
import { roleTraits } from './board';
import type { WerewolfContext } from './context';
import type { NightStep, NightTally } from './types';

/** 追加一名死者；已在名单中的不重复记录（先记录的原因优先） */
export function addDeath(tally: NightTally, seat: number, cause: NightDeathCause): NightTally {
  if (tally.deaths.some((death) => death.seat === seat)) return tally;
  return { ...tally, deaths: [...tally.deaths, { seat, cause }] };
}

export function isDying(tally: NightTally, seat: number): boolean {
  return tally.deaths.some((death) => death.seat === seat);
}

/** 狼刀：守护与解药各自能挡下狼刀，同守同救则死亡；狼刀与毒药同一人时按毒杀记（猎人因此不能开枪） */
const wolfKill: NightStep = (ctx, tally) => {
  const { wolfTarget, saved, poisoned, guarded } = ctx.state.night;
  const blocked = (guarded !== null && guarded === wolfTarget) !== saved;
  if (wolfTarget === null || blocked || wolfTarget === poisoned) return tally;
  return addDeath(tally, wolfTarget, 'wolf');
};

/** 毒药：免疫毒药的角色不受影响（毒药照常消耗） */
const poison: NightStep = (ctx, tally) => {
  const { poisoned } = ctx.state.night;
  if (poisoned === null || roleTraits(ctx.seats.get(poisoned)).poisonImmune) return tally;
  return addDeath(tally, poisoned, 'poison');
};

/** 结算顺序：狼刀 → 毒药；特殊角色的结算步骤按顺序插入这里 */
const NIGHT_STEPS: readonly NightStep[] = [wolfKill, poison];

/** 夜间结算：只算出死亡名单，天亮公布时才真正出局 */
export function resolveNight(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const tally = NIGHT_STEPS.reduce<NightTally>((current, step) => step(ctx, current), { state: ctx.state, deaths: [] });
  const pendingDeaths: PendingDeath[] = [...tally.deaths].sort((a, b) => a.seat - b.seat);
  return { state: { ...tally.state, pendingDeaths } };
}
