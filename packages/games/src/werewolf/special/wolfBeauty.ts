import { definePrompts, type ActDecision, type ComputeOutcome, type TriggerEvent } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import { boardConfig, hasRole, roleTraits } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { CHARM_BY_DAY } from '../rules/death';
import { nightAfter } from '../rules/order';
import { addDeath } from '../rules/tally';
import type { NightStep } from '../rules/types';
import { NIGHT_DEATH_CAUSES, type WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 狼美人：狼人阵营，狼人击杀后单独魅惑一名其他存活玩家（可不魅惑）。狼美人在当晚或天亮后的白天出局时，
// 当晚被魅惑者随之殉情：夜里死亡时并入当晚死讯，白天出局时由触发器立即结算。殉情的猎人不能开枪。不能自爆。
// 不受魅惑影响的角色（老流氓，特性 charmImmune）不会殉情；板子参数 wolfBeautyPoisonLink 为 false 时，狼美人被毒杀不带人。

const wolfBeautyPrompts = definePrompts({
  wolfBeauty: [
    '你是{{me.label}}，身份是狼美人（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '每晚狼人击杀后，你可以单独魅惑一名玩家；你在当晚或天亮后的白天出局时，被魅惑的玩家会随你殉情。你不能自爆。',
  ].join(''),
  wolfBeautyCharm: '狼美人请睁眼，选择今晚要魅惑的玩家，也可以输出空数组不魅惑。',
});

function applyCharm(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const charmed = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, charmed } };
}

/** 当晚被魅惑、仍会受殉情影响的人 */
function linkedLover(ctx: WerewolfContext): number | null {
  const { charmed } = ctx.state.night;
  if (charmed === null || !ctx.seats.get(charmed).alive || roleTraits(ctx.seats.get(charmed)).charmImmune) return null;
  return charmed;
}

/** 狼美人当晚死亡：被魅惑者一起列入死讯（削弱版狼美人被毒杀时不带人） */
const wolfBeautyNightLink: NightStep = (ctx, tally) => {
  const lover = linkedLover(ctx);
  if (lover === null) return tally;
  const poisonLinks = boardConfig(ctx).wolfBeautyPoisonLink;
  const beautyDies = ctx.seats.withRole('wolf_beauty').ids()
    .some((seat) => tally.deaths.some((death) => death.seat === seat && (poisonLinks || death.cause !== 'poison')));
  return beautyDies ? addDeath(tally, lover, 'charm') : tally;
};

/** 狼美人在白天出局（天亮公布的夜间死亡已在夜里结算），被魅惑者仍存活 */
function diesByDay(ctx: WerewolfContext, event: TriggerEvent): boolean {
  if (event.kind !== 'seat_eliminated' || NIGHT_DEATH_CAUSES.has(event.cause)) return false;
  return ctx.seats.get(event.seat).role === 'wolf_beauty' && linkedLover(ctx) !== null;
}

function resolveDayLink(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const charmed = linkedLover(ctx);
  if (charmed === null) return {};
  return {
    log: [{ kind: 'narration', text: `${charmed}号随狼美人殉情出局。` }],
    eliminate: [{ seat: charmed, reason: '殉情', cause: CHARM_BY_DAY }],
  };
}

const wolfBeautyPhases = {
  wolf_beauty_charm: {
    kind: 'act',
    title: '狼美人魅惑',
    action: '魅惑',
    enabled: (ctx) => hasRole(ctx, 'wolf_beauty'),
    actors: (ctx) => nightActors(ctx, 'wolf_beauty'),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: wolfBeautyPrompts.wolfBeautyCharm,
    describe: (_ctx, _seat, targets) => (targets.length ? `魅惑 ${targets[0]}号` : '今晚不魅惑'),
    apply: applyCharm,
    next: nightAfter('wolf_beauty_charm'),
  },
  wolf_beauty_link: { kind: 'compute', title: '殉情', run: resolveDayLink, next: 'return' },
} satisfies WerewolfPhases;

const wolfBeautyTriggers: WerewolfTriggers = [
  { id: 'wolf-beauty-link', on: 'seat_eliminated', when: diesByDay, push: 'wolf_beauty_link' },
];

export const wolfBeautySpecial: SpecialDescriptor = {
  key: 'wolfBeauty',
  prompts: wolfBeautyPrompts,
  identities: { wolf_beauty: wolfBeautyPrompts.wolfBeauty },
  phases: wolfBeautyPhases,
  linkTriggers: wolfBeautyTriggers,
  nightStep: wolfBeautyNightLink,
};
