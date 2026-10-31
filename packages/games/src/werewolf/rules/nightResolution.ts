import type { ComputeOutcome } from '@battle/engine';
import { evilKnightReflect } from '../special/evilKnight';
import { stalkerAssassination } from '../special/stalker';
import { wolfBeautyNightLink } from '../special/wolfBeauty';
import type { PendingDeath, WerewolfState } from '../state';
import { roleTraits } from './board';
import type { WerewolfContext } from './context';
import { addDeath } from './tally';
import type { NightStep, NightTally } from './types';

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

/**
 * 结算顺序：狼刀 → 毒药 → 特殊角色的结算步骤（按此顺序插入）。
 * 恶灵骑士反伤排在狼刀、毒药之后（反伤对象已死亡则不消耗反伤），殉情最后，覆盖前面所有的死亡。
 */
const NIGHT_STEPS: readonly NightStep[] = [wolfKill, poison, evilKnightReflect, stalkerAssassination, wolfBeautyNightLink];

/** 夜间结算：只算出死亡名单，天亮公布时才真正出局 */
export function resolveNight(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const tally = NIGHT_STEPS.reduce<NightTally>((current, step) => step(ctx, current), { state: ctx.state, deaths: [] });
  const pendingDeaths: PendingDeath[] = [...tally.deaths].sort((a, b) => a.seat - b.seat);
  return { state: { ...tally.state, pendingDeaths } };
}
