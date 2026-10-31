import type { ComputeOutcome } from '@battle/engine';
import { bigBadWolfKill } from '../special/bigBadWolf';
import { dreamDeaths, isDreamed } from '../special/dreamer';
import { evilKnightReflect } from '../special/evilKnight';
import { swapTarget } from '../special/magician';
import { woundRogue } from '../special/oldRogue';
import { stalkerAssassination } from '../special/stalker';
import { wolfBeautyNightLink } from '../special/wolfBeauty';
import type { PendingDeath, WerewolfState } from '../state';
import { roleTraits } from './board';
import type { WerewolfContext } from './context';
import { addDeath, isDying } from './tally';
import type { NightStep, NightTally } from './types';

/** 毒药实际落在谁身上（魔术师换号后） */
function poisonedSeat(ctx: WerewolfContext): number | null {
  const { poisoned } = ctx.state.night;
  return poisoned === null ? null : swapTarget(ctx, poisoned);
}

/** 毒药能否直接毒死该座位：梦游者（毒药浪费）、免疫毒药者、老流氓（延迟出局）不会当晚死于毒药 */
function poisonKills(ctx: WerewolfContext, seat: number): boolean {
  const traits = roleTraits(ctx.seats.get(seat));
  return poisonedSeat(ctx) === seat && !isDreamed(ctx, seat) && !traits.poisonImmune && !traits.delayedDeath;
}

/**
 * 狼刀：守护与解药各自能挡下狼刀，同守同救则死亡；梦游者被刀视为空刀；
 * 狼刀与毒药落在同一人且毒药致死时按毒杀记（猎人因此不能开枪）。魔术师换号后按实际落点结算。
 */
const wolfKill: NightStep = (ctx, tally) => {
  const { wolfTarget, saved, guarded } = ctx.state.night;
  if (wolfTarget === null) return tally;
  const victim = swapTarget(ctx, wolfTarget);
  const guardedSeat = guarded === null ? null : swapTarget(ctx, guarded);
  const blocked = (guardedSeat === victim) !== saved;
  if (blocked || isDreamed(ctx, victim) || poisonKills(ctx, victim)) return tally;
  return addDeath(tally, victim, 'wolf');
};

/** 毒药：致死则记毒杀；老流氓进入中毒状态（不公布）；梦游者、免疫毒药者不受影响（毒药照常消耗） */
const poison: NightStep = (ctx, tally) => {
  const seat = poisonedSeat(ctx);
  if (seat === null || isDying(tally, seat)) return tally;
  if (poisonKills(ctx, seat)) return addDeath(tally, seat, 'poison');
  if (roleTraits(ctx.seats.get(seat)).delayedDeath && !isDreamed(ctx, seat)) {
    return { ...tally, state: woundRogue(tally.state, seat, ctx.round, false) };
  }
  return tally;
};

/**
 * 结算顺序：狼刀 → 毒药 → 特殊角色的结算步骤（按此顺序插入）。
 * 恶灵骑士反伤排在狼刀、毒药之后（反伤对象已死亡则不消耗反伤）；摄梦死亡要知道摄梦人当晚是否死亡，排在其他死亡之后；
 * 殉情最后，覆盖前面所有的死亡。
 */
const NIGHT_STEPS: readonly NightStep[] = [
  wolfKill,
  poison,
  evilKnightReflect,
  stalkerAssassination,
  bigBadWolfKill,
  dreamDeaths,
  wolfBeautyNightLink,
];

/** 夜间结算：只算出死亡名单，天亮公布时才真正出局 */
export function resolveNight(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const tally = NIGHT_STEPS.reduce<NightTally>((current, step) => step(ctx, current), { state: ctx.state, deaths: [] });
  const pendingDeaths: PendingDeath[] = [...tally.deaths].sort((a, b) => a.seat - b.seat);
  return { state: { ...tally.state, pendingDeaths } };
}
