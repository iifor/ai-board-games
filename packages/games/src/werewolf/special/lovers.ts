import type { ComputeOutcome, TriggerEvent, TriggerSpec } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import type { WerewolfContext } from '../rules/context';
import { LOVER_BY_DAY } from '../rules/death';
import { addDeath, isDying } from '../rules/tally';
import type { NightStep } from '../rules/types';
import { NIGHT_DEATH_CAUSES, type WerewolfParams, type WerewolfState } from '../state';

// 情侣（丘比特连的两人、魅魔与她连的人、鬼魂新娘与新郎，state.lovers）：一方出局时另一方殉情。
// 夜里殉情并入当晚死讯（原因 lover，与其他夜间死亡不作区分，首夜有遗言）；白天殉情由触发器立即结算（原因 lover_day，没有遗言）。
// 殉情者不能发动出局技能（猎人、狼王不能开枪，见 rules/death.ts 的 NO_SHOT_CAUSES）。

export function partnerOf(ctx: WerewolfContext, seat: number): number | null {
  const [first, second] = ctx.state.lovers;
  if (first === undefined || second === undefined) return null;
  if (seat === first) return second;
  return seat === second ? first : null;
}

/** 夜里一方死亡：另一方一起列入死讯 */
export const loverNightLink: NightStep = (ctx, tally) => {
  const [first, second] = ctx.state.lovers;
  if (first === undefined || second === undefined) return tally;
  const firstDies = isDying(tally, first);
  if (firstDies === isDying(tally, second)) return tally;
  const partner = firstDies ? second : first;
  return ctx.seats.get(partner).alive ? addDeath(tally, partner, 'lover') : tally;
};

/** 白天出局的情侣（夜间死亡已在夜里结算），另一方仍存活 */
function diesByDay(ctx: WerewolfContext, event: TriggerEvent): boolean {
  if (event.kind !== 'seat_eliminated' || NIGHT_DEATH_CAUSES.has(event.cause)) return false;
  const partner = partnerOf(ctx, event.seat);
  return partner !== null && ctx.seats.get(partner).alive;
}

function resolveDayLink(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const partner = ctx.trigger ? partnerOf(ctx, ctx.trigger.seat) : null;
  if (partner === null || !ctx.seats.get(partner).alive) return {};
  return {
    log: [{ kind: 'narration', text: `${partner}号殉情出局。` }],
    eliminate: [{ seat: partner, reason: '殉情', cause: LOVER_BY_DAY }],
  };
}

export const loversPhases = {
  lover_link: { kind: 'compute', title: '殉情', run: resolveDayLink, next: 'return' },
} satisfies WerewolfPhases;

export const loversTriggers: readonly TriggerSpec<WerewolfState, WerewolfParams>[] = [
  { id: 'lover-link', on: 'seat_eliminated', when: diesByDay, push: 'lover_link' },
];
