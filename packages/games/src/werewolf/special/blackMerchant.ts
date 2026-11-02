import { definePrompts, type ActDecision, type ActPhase, type ComputeOutcome, type Seat, type Transition } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { boardConfig, hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import { isWolf, type WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import { addDeath } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { WerewolfParams, WerewolfState } from '../state';
import type { GiftSkill } from '../stateExtended';
import { GIFT_LABELS, grantGift } from './gifts';
import type { SpecialDescriptor } from './types';

// 黑商：神职，全场交易一次——选择一名玩家，把预言家的验、猎人的枪、女巫的毒之一交给他（依次询问验、枪，都不选则为毒）。
// 对方是好人：他成为幸运儿，私下得知并获得该技能（见 gifts.ts）；对方是狼人：他什么也不知道、得不到技能，黑商在天亮时出局。
// 板子参数 blackMerchant：first_night 首夜第一个睁眼且必须交易；any_night 任意一晚（女巫之后）可以交易，
// 此时黑商若当晚被狼刀且没有被救，会先私下得知自己将要出局。

const blackMerchantPrompts = definePrompts({
  blackMerchant: [
    '你是{{me.label}}，身份是黑商（神职）。',
    '{{#if state.merchant.used}}你已经完成了交易。{{else}}全场一次，你可以选择一名玩家进行黑暗交易，把预言家的验、猎人的枪、女巫的毒之一交给他；',
    '若他是好人，他会成为幸运儿并获得该技能；若他是狼人，你会在天亮时出局，他也得不到技能。{{/if}}',
  ].join(''),
  merchantDeal: '黑商请睁眼，选择一名玩家进行黑暗交易。',
  merchantDealOptional: '黑商请睁眼。是否选择一名玩家进行黑暗交易（全场一次）？选择一名玩家，或输出空数组今晚不交易。',
  merchantSkillCheck: '你选择与 {{state.merchant.target}}号 交易。是否把预言家的验交给他？选择你自己表示是，输出空数组则继续选择其他技能。',
  merchantSkillGun: '是否把猎人的枪交给 {{state.merchant.target}}号？选择你自己表示是，输出空数组则把女巫的毒交给他。',
});

const MERCHANT = 'black_merchant';

function dealsFirstNight(ctx: WerewolfContext): boolean {
  return boardConfig(ctx).blackMerchant === 'first_night';
}

/** 刚刚在交易阶段选定了对象（ctx.result 是交易阶段的结果） */
function dealtNow(ctx: WerewolfContext): boolean {
  return ctx.result?.kind === 'act' && ctx.result.decisions.some((decision) => decision.targets.length > 0);
}

function recordDeal(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const target = decisions.flatMap((decision) => decision.targets)[0];
  return target === undefined ? ctx.state : { ...ctx.state, merchant: { used: true, target } };
}

function chooseSkill(skill: GiftSkill) {
  return (ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState => (decisions.some((decision) => decision.targets.length > 0)
    ? { ...ctx.state, night: { ...ctx.state.night, merchantSkill: skill } }
    : ctx.state);
}

/** 交易结算：对象是狼人则黑商天亮出局（对方不知情），否则对方成为幸运儿 */
function settle(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const target = ctx.state.merchant.target;
  if (target === null) return {};
  const skill = ctx.state.night.merchantSkill ?? 'poison';
  if (isWolf(ctx.seats.get(target))) return { state: { ...ctx.state, night: { ...ctx.state.night, merchantBackfire: true } } };
  const usage = skill === 'gun' ? '出局时你可以直接开枪带走一名玩家（不翻牌）' : '你可以在今晚或之后的某个夜晚使用一次';
  return {
    state: grantGift(ctx.state, target, skill),
    log: [{ kind: 'narration', text: `你被黑商选中成为幸运儿，获得了${GIFT_LABELS[skill]}：${usage}。`, channel: `private:${target}` }],
  };
}

/** any_night 口径：黑商当晚被狼刀且没有被救时，先私下得知自己将要出局 */
function doomNotice(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const merchant = ctx.seats.alive().withRole(MERCHANT).ids()[0];
  const { wolfTarget, saved, guarded } = ctx.state.night;
  if (merchant === undefined || ctx.state.merchant.used || wolfTarget !== merchant || saved || guarded === merchant) return {};
  return { log: [{ kind: 'narration', text: '你今晚被狼人击杀，女巫没有救你：天亮后你将出局。', channel: `private:${merchant}` }] };
}

/** 交易对象是狼人：黑商在天亮公布死讯时出局（守护、解药都挡不下） */
const merchantBackfire: NightStep = (ctx, tally) => {
  const merchant = ctx.seats.alive().withRole(MERCHANT).ids()[0];
  return ctx.state.night.merchantBackfire && merchant !== undefined ? addDeath(tally, merchant, 'merchant') : tally;
};

/** 交易链结束后回到交易阶段在夜晚顺序中的位置 */
const resume: readonly Transition<WerewolfState, WerewolfParams>[] = [
  { when: dealsFirstNight, goto: nightAfter('merchant_deal_early') },
  { goto: nightAfter('merchant_deal') },
];

const deal = {
  kind: 'act',
  title: '黑商',
  action: '交易',
  actors: (ctx) => nightActors(ctx, MERCHANT).where(() => !ctx.state.merchant.used),
  targets: (ctx, seat) => ctx.seats.alive().except(seat),
  describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '今晚不交易' : `与 ${targets[0]}号 交易`),
  apply: recordDeal,
} as const satisfies Omit<ActPhase<WerewolfState, WerewolfParams>, 'prompt' | 'next'>;

const skillQuestion = (skill: GiftSkill) => ({
  kind: 'act',
  action: `赠送${GIFT_LABELS[skill]}`,
  targets: (_ctx: WerewolfContext, seat: Seat) => [seat.seat],
  allowNone: true,
  describe: (_ctx: WerewolfContext, _seat: Seat, targets: readonly number[]) => (targets.length ? `选择赠送${GIFT_LABELS[skill]}` : `不赠送${GIFT_LABELS[skill]}`),
  apply: chooseSkill(skill),
}) as const;

const blackMerchantPhases = {
  merchant_deal_early: {
    ...deal,
    enabled: (ctx) => ctx.round === 1 && dealsFirstNight(ctx) && hasRole(ctx, MERCHANT),
    prompt: blackMerchantPrompts.merchantDeal,
    next: [{ when: dealtNow, goto: 'merchant_skill_check' }, { goto: nightAfter('merchant_deal_early') }],
  },
  merchant_doom_notice: {
    kind: 'compute',
    enabled: (ctx) => !dealsFirstNight(ctx) && hasRole(ctx, MERCHANT),
    run: doomNotice,
    next: nightAfter('merchant_doom_notice'),
  },
  merchant_deal: {
    ...deal,
    enabled: (ctx) => !dealsFirstNight(ctx) && hasRole(ctx, MERCHANT),
    allowNone: true,
    prompt: blackMerchantPrompts.merchantDealOptional,
    next: [{ when: dealtNow, goto: 'merchant_skill_check' }, { goto: nightAfter('merchant_deal') }],
  },
  merchant_skill_check: {
    ...skillQuestion('check'),
    actors: (ctx) => ctx.seats.alive().withRole(MERCHANT),
    prompt: blackMerchantPrompts.merchantSkillCheck,
    next: 'merchant_skill_gun',
  },
  merchant_skill_gun: {
    ...skillQuestion('gun'),
    actors: (ctx) => ctx.seats.alive().withRole(MERCHANT).where(() => ctx.state.night.merchantSkill === null),
    prompt: blackMerchantPrompts.merchantSkillGun,
    next: 'merchant_settle',
  },
  merchant_settle: { kind: 'compute', run: settle, next: resume },
} satisfies WerewolfPhases;

export const blackMerchantSpecial: SpecialDescriptor = {
  key: 'blackMerchant',
  prompts: blackMerchantPrompts,
  identities: { black_merchant: blackMerchantPrompts.blackMerchant },
  phases: blackMerchantPhases,
  nightStep: merchantBackfire,
};
