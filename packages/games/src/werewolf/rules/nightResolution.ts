import type { ComputeOutcome } from '@battle/engine';
import { specialNightSteps } from '../special';
import type { PendingDeath, WerewolfState } from '../state';
import { roleTraits } from './board';
import type { WerewolfContext } from './context';
import { woundRogue } from './death';
import { isDreamed, swapTarget } from './nightEffects';
import { antidotedTonight } from './spiritWolfSkills';
import { addDeath, isDying } from './tally';
import type { NightStep, NightTally } from './types';

// 夜间结算管线：消费 special/index.ts 登记表中的结算步骤；特殊角色模块不得引用本文件。

/** 今晚毒药实际落在谁身上（魔术师换号后）：女巫的毒药（被灵狼的解毒剂解救的除外）与赠送 / 祈求得到的毒药 */
function poisonedSeats(ctx: WerewolfContext): number[] {
  const { poisoned, giftPoisoned } = ctx.state.night;
  const witchPoison = poisoned !== null && antidotedTonight(ctx, poisoned) ? null : poisoned;
  return [witchPoison, giftPoisoned].flatMap((seat) => (seat === null ? [] : [swapTarget(ctx, seat)]));
}

/** 毒药能否直接毒死该座位：梦游者（毒药浪费）、免疫毒药者、老流氓（延迟出局）不会当晚死于毒药 */
function poisonKills(ctx: WerewolfContext, seat: number): boolean {
  const traits = roleTraits(ctx.seats.get(seat));
  return poisonedSeats(ctx).includes(seat) && !isDreamed(ctx, seat) && !traits.poisonImmune && !traits.delayedDeath;
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
const poison: NightStep = (ctx, tally) => poisonedSeats(ctx).reduce<NightTally>((current, seat) => {
  if (isDying(current, seat)) return current;
  if (poisonKills(ctx, seat)) return addDeath(current, seat, 'poison');
  if (roleTraits(ctx.seats.get(seat)).delayedDeath && !isDreamed(ctx, seat)) {
    return { ...current, state: woundRogue(current.state, seat, ctx.round, false) };
  }
  return current;
}, tally);

/** 结算顺序：狼刀 → 毒药 → 特殊角色的结算步骤（顺序与理由见 special/index.ts 的 specialNightSteps） */
const NIGHT_STEPS: readonly NightStep[] = [wolfKill, poison, ...specialNightSteps];

/** 夜间结算：只算出死亡名单，天亮公布时才真正出局；结算中改变身份的座位与私下告知的信息随之生效 */
export function resolveNight(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const tally = NIGHT_STEPS.reduce<NightTally>((current, step) => step(ctx, current), { state: ctx.state, deaths: [] });
  const pendingDeaths: PendingDeath[] = [...tally.deaths].sort((a, b) => a.seat - b.seat);
  return { state: { ...tally.state, pendingDeaths }, reassign: tally.reassign ?? [], log: tally.log ?? [] };
}
