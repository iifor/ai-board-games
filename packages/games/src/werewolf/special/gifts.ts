import { definePrompts, type ActDecision, type TriggerEvent } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import { hasRole } from '../rules/board';
import { canUseNightSkill, skillsLost } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { recordShot, settleShot, shotAllowed, triggerSeat } from '../rules/death';
import { seerVerdict } from '../rules/night';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import { NO_GIFTS, type GiftSkill } from '../stateExtended';
import type { SpecialDescriptor } from './types';

// 额外技能（黑商的幸运儿、祈求者）：预言家的验、女巫的毒各用一次，可以当晚使用也可以留到之后的夜晚；
// 猎人的枪在出局时直接开枪，不翻牌（公开记录只写"开枪带走 X号"，被带走者的出局原因为"被枪杀"）。
// 额外技能不覆盖原有技能；神职持有者在大树倒下后同样失去额外技能。

const giftPrompts = definePrompts({
  giftCheck: '你持有额外的一次查验：选择一名玩家查验他是好人还是狼人，也可以输出空数组留到之后的夜晚再用。',
  giftPoison: '你持有额外的一瓶毒药：选择一名玩家毒杀，也可以输出空数组留到之后的夜晚再用。',
  giftShot: '你已出局，可以用额外获得的枪带走一名存活玩家（不会翻牌），也可以输出空数组放弃开枪。',
});

export const GIFT_LABELS: Readonly<Record<GiftSkill, string>> = { check: '预言家的验', gun: '猎人的枪', poison: '女巫的毒' };

function hasGift(ctx: WerewolfContext, seat: number, skill: GiftSkill): boolean {
  return (ctx.state.gifts[String(seat)] ?? NO_GIFTS)[skill];
}

function setGift(state: WerewolfState, seat: number, skill: GiftSkill, owned: boolean): WerewolfState {
  const current = state.gifts[String(seat)] ?? NO_GIFTS;
  return { ...state, gifts: { ...state.gifts, [String(seat)]: { ...current, [skill]: owned } } };
}

export function grantGift(state: WerewolfState, seat: number, skill: GiftSkill): WerewolfState {
  return setGift(state, seat, skill, true);
}

function spendGift(state: WerewolfState, seat: number, skill: GiftSkill): WerewolfState {
  return state.gifts[String(seat)]?.[skill] ? setGift(state, seat, skill, false) : state;
}

/** 本局可能出现额外技能（公开信息） */
function giftsPossible(ctx: WerewolfContext): boolean {
  return hasRole(ctx, 'black_merchant') || hasRole(ctx, 'requester');
}

/** 今晚能用该额外技能的座位：持有、存活、没有被封锁、没有失去技能 */
function giftActors(ctx: WerewolfContext, skill: GiftSkill): number[] {
  return ctx.seats.alive().where((seat) => hasGift(ctx, seat.seat, skill) && canUseNightSkill(ctx, seat)).ids();
}

function applyCheck(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  return decisions.reduce<WerewolfState>((state, { seat, targets }) => {
    const [target] = targets;
    if (target === undefined) return state;
    const checks = state.giftChecks[String(seat)] ?? [];
    const check = { night: ctx.round, target, result: seerVerdict(ctx, target) };
    return spendGift({ ...state, giftChecks: { ...state.giftChecks, [String(seat)]: [...checks, check] } }, seat, 'check');
  }, ctx.state);
}

function applyPoison(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const decision = decisions.find((item) => item.targets.length > 0);
  const target = decision?.targets[0];
  if (!decision || target === undefined) return ctx.state;
  return spendGift({ ...ctx.state, night: { ...ctx.state.night, giftPoisoned: target } }, decision.seat, 'poison');
}

/** 出局时还持有额外的枪：出局原因允许开枪（被毒、殉情、被炸死不行），且没有失去技能 */
function canGiftShoot(ctx: WerewolfContext, event: TriggerEvent): boolean {
  if (event.kind !== 'seat_eliminated' || !hasGift(ctx, event.seat, 'gun')) return false;
  return shotAllowed(ctx, event) && !skillsLost(ctx, ctx.seats.get(event.seat));
}

function applyShot(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const shooter = ctx.trigger?.seat;
  const state = recordShot(ctx, decisions);
  return shooter === undefined ? state : spendGift(state, shooter, 'gun');
}

const giftPhases = {
  gift_check: {
    kind: 'act',
    action: '查验',
    enabled: giftsPossible,
    actors: (ctx) => giftActors(ctx, 'check'),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: giftPrompts.giftCheck,
    describe: (ctx, _seat, targets) => (targets[0] === undefined ? '暂不使用额外的查验' : `查验 ${targets[0]}号：${seerVerdict(ctx, targets[0])}`),
    apply: applyCheck,
    next: nightAfter('gift_check'),
  },
  gift_poison: {
    kind: 'act',
    action: '使用额外的毒药',
    enabled: giftsPossible,
    actors: (ctx) => giftActors(ctx, 'poison').slice(0, 1),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: giftPrompts.giftPoison,
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '暂不使用额外的毒药' : `毒杀 ${targets[0]}号`),
    apply: applyPoison,
    next: nightAfter('gift_poison'),
  },
  gift_shot: {
    kind: 'act',
    title: '开枪',
    action: '开枪',
    actors: triggerSeat,
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: giftPrompts.giftShot,
    channel: () => 'public',
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '放弃开枪' : `开枪带走 ${targets[0]}号`),
    apply: applyShot,
    next: 'gift_shot_resolve',
  },
  gift_shot_resolve: { kind: 'compute', run: (ctx) => settleShot(ctx, '被枪杀'), next: 'return' },
} satisfies WerewolfPhases;

const giftTriggers: WerewolfTriggers = [
  { id: 'gift-shot', on: 'seat_eliminated', when: canGiftShoot, push: 'gift_shot' },
];

export const giftsSpecial: SpecialDescriptor = {
  key: 'gifts',
  prompts: giftPrompts,
  phases: giftPhases,
  deathTriggers: giftTriggers,
};
