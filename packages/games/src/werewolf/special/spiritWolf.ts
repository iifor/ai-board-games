import { definePrompts, type ActDecision, type ComputeOutcome, type Seat, type SeatQuery, type TriggerEvent } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors, skillsLost } from '../rules/block';
import { isWolf, type WerewolfContext } from '../rules/context';
import { recordShot, settleShot, triggerSeat } from '../rules/death';
import { swapTarget } from '../rules/nightEffects';
import { addSeatNote } from '../rules/notes';
import { nightAfter } from '../rules/order';
import { deathCause, removeDeath } from '../rules/tally';
import type { NightStep } from '../rules/types';
import type { WerewolfState } from '../state';
import type { SpiritSkill } from '../stateFinal';
import { godOrVillager } from './demon';
import type { SpecialDescriptor } from './types';

// 灵狼：狼队成员，与狼队一起击杀后，每晚在女巫之后、预言家之前单独睁眼（预言家因此改在 seer_check_late 查验）。
// 首夜选择一名好人阵营玩家学习他的技能（state.spiritWolf.learned，写入法官私下告知的固定信息）：
// - 预言家：第二夜起每晚查验一名好人阵营玩家是神职还是平民；
// - 女巫：一瓶解毒剂，女巫用毒的那一晚可以解救被毒的玩家（不能是自己，见 nightResolution 的毒药）；
// - 猎人：被放逐出局时可以翻牌带走一名玩家；
// - 守卫：第二夜起每晚可以庇护一名玩家（不能连续两晚同一人），效果见 spiritWolfSkills.ts 与下面的 spiritShield；
// - 其他身份算平民：查验时被视为好人（rules/appearance.ts）。

const spiritWolfPrompts = definePrompts({
  spiritWolf: [
    '你是{{me.label}}，身份是灵狼（狼人阵营）。你的狼队友：{{#each teammates}}{{this.label}}{{#if this.alive}}{{else}}（已出局）{{/if}} {{/each}}。',
    '每晚与狼队一起击杀后，你在女巫之后、预言家之前单独睁眼；首夜你选择一名好人阵营玩家学习他的技能（学到什么见法官私下告诉你的信息）。',
    '{{#if state.spiritWolf.checks}}你的查验记录：{{#each state.spiritWolf.checks}}第{{this.night}}夜查验 {{this.target}}号，结果是{{this.result}}；{{/each}}{{/if}}',
    '{{#if state.spiritWolf.antidote}}你还有一瓶解毒剂。{{/if}}',
    '{{#if state.spiritWolf.lastShield}}你上一晚庇护的是 {{state.spiritWolf.lastShield}}号，今晚不能再庇护他。{{/if}}',
    '白天发言时你可以在发言后宣布自爆。',
  ].join(''),
  spiritWolfLearn: '灵狼请睁眼，选择一名好人阵营玩家，学习他的技能。',
  spiritWolfAntidote: '女巫今晚毒了 {{#each legalTargets}}{{this}}号{{/each}}。是否使用你的解毒剂救他？选择他表示使用，输出空数组表示不使用。',
  spiritWolfCheck: '灵狼请睁眼，选择一名好人阵营玩家，查验他是神职还是平民。',
  spiritWolfShield: '灵狼请睁眼，选择今晚要庇护的玩家（他今晚不会死于狼刀、毒药与夜间开枪，查验也得不到结果），也可以输出空数组不庇护。',
  spiritWolfShot: '你被放逐出局。你学到了猎人的技能：可以翻牌并带走一名存活玩家，也可以输出空数组不翻牌。',
});

const SPIRIT_WOLF = 'spirit_wolf';
const LEARNABLE: readonly SpiritSkill[] = ['seer', 'witch', 'hunter', 'guard'];

const LABELS: Readonly<Record<SpiritSkill, string>> = {
  seer: '预言家的查验',
  witch: '女巫的解毒剂',
  hunter: '猎人的枪',
  guard: '守卫的庇护',
  villager: '平民（查验视为好人）',
};

/** 法官私下告诉灵狼的固定信息（规则层展示） */
const NOTES: Readonly<Record<SpiritSkill, string>> = {
  seer: '你首夜学到了预言家的技能：从第二夜起，每晚可以查验一名好人阵营玩家是神职还是平民。',
  witch: '你首夜学到了女巫的技能：获得一瓶解毒剂，在女巫用毒的那一晚可以解救被毒的玩家（不能救自己），只能用一次。',
  hunter: '你首夜学到了猎人的技能：被放逐出局时可以翻牌并带走一名玩家。',
  guard: '你首夜学到了守卫的技能：从第二夜起，每晚可以庇护一名玩家，不能连续两晚庇护同一人。',
  villager: '你首夜学到的是平民：预言家查验你时会得到好人。',
};

function skillOf(seat: Seat): SpiritSkill {
  return LEARNABLE.find((skill) => skill === seat.role) ?? 'villager';
}

/** 今晚能行动、学到了该技能的灵狼 */
function skilled(ctx: WerewolfContext, skill: SpiritSkill): SeatQuery {
  return nightActors(ctx, SPIRIT_WOLF).where(() => ctx.state.spiritWolf.learned === skill);
}

function goodTargets(ctx: WerewolfContext): number[] {
  return ctx.seats.alive().where((seat) => !isWolf(seat)).ids();
}

function chosen(decisions: readonly ActDecision[]): number | null {
  return decisions.flatMap((decision) => decision.targets)[0] ?? null;
}

function applyLearn(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const decision = decisions.find((item) => item.targets.length > 0);
  const target = decision?.targets[0];
  if (!decision || target === undefined) return ctx.state;
  const learned = skillOf(ctx.seats.get(target));
  const state = { ...ctx.state, spiritWolf: { ...ctx.state.spiritWolf, learned, antidote: learned === 'witch' } };
  return addSeatNote(state, decision.seat, NOTES[learned]);
}

/** 解毒剂只能救女巫今晚毒的人，不能救自己 */
function antidoteTargets(ctx: WerewolfContext, wolf: Seat): number[] {
  const { poisoned } = ctx.state.night;
  return poisoned !== null && poisoned !== wolf.seat ? [poisoned] : [];
}

function applyAntidote(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const saved = chosen(decisions);
  if (saved === null) return ctx.state;
  return { ...ctx.state, night: { ...ctx.state.night, spiritAntidote: saved }, spiritWolf: { ...ctx.state.spiritWolf, antidote: false } };
}

function applyCheck(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const target = chosen(decisions);
  if (target === null) return ctx.state;
  const checks = [...ctx.state.spiritWolf.checks, { night: ctx.round, target, result: godOrVillager(ctx, target) }];
  return { ...ctx.state, spiritWolf: { ...ctx.state.spiritWolf, checks } };
}

/** 空过一晚（或当晚没能行动）后下一晚不受"连续两晚"限制 */
function applyShield(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  if (ctx.state.spiritWolf.learned !== 'guard') return ctx.state;
  const spiritShield = chosen(decisions);
  return { ...ctx.state, night: { ...ctx.state.night, spiritShield }, spiritWolf: { ...ctx.state.spiritWolf, lastShield: spiritShield } };
}

/** 庇护：被庇护者当晚不会死于狼刀与毒药（排在各种击杀之后，挡下所有狼刀；守护与解药的结果不影响庇护） */
const spiritShield: NightStep = (ctx, tally) => {
  const { spiritShield: shield } = ctx.state.night;
  if (shield === null) return tally;
  const seat = swapTarget(ctx, shield);
  const cause = deathCause(tally, seat);
  return cause === 'wolf' || cause === 'poison' ? removeDeath(tally, seat) : tally;
};

/** 学到猎人的灵狼被放逐出局（没有因诅咒等失去技能） */
function canSpiritShoot(ctx: WerewolfContext, event: TriggerEvent): boolean {
  if (event.kind !== 'seat_eliminated' || event.cause !== 'exile') return false;
  const seat = ctx.seats.get(event.seat);
  return seat.role === SPIRIT_WOLF && ctx.state.spiritWolf.learned === 'hunter' && !skillsLost(ctx, seat);
}

/** 选择开枪时才公开翻牌（决定只记在私密频道，不开枪则不暴露） */
function resolveShot(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const shooter = ctx.trigger?.seat;
  const target = ctx.state.pendingShot;
  const settled = settleShot(ctx, '被灵狼带走');
  if (shooter === undefined || target === null || !ctx.seats.get(target).alive) return settled;
  const reveal = { kind: 'revealed', text: `${shooter}号翻牌，身份是灵狼（学到了猎人的技能），开枪带走 ${target}号。`, data: { seat: shooter, role: SPIRIT_WOLF } } as const;
  return { ...settled, log: [reveal, ...(settled.log ?? [])] };
}

const spiritWolfPhases = {
  spirit_wolf_learn: {
    kind: 'act',
    title: '灵狼',
    action: '学习技能',
    enabled: (ctx) => hasRole(ctx, SPIRIT_WOLF) && ctx.round === 1,
    actors: (ctx) => nightActors(ctx, SPIRIT_WOLF).where(() => ctx.state.spiritWolf.learned === null),
    targets: goodTargets,
    prompt: spiritWolfPrompts.spiritWolfLearn,
    describe: (ctx, _seat, targets) => (targets[0] === undefined ? '没有学习' : `学习 ${targets[0]}号的技能：${LABELS[skillOf(ctx.seats.get(targets[0]))]}`),
    apply: applyLearn,
    next: nightAfter('spirit_wolf_learn'),
  },
  spirit_wolf_antidote: {
    kind: 'act',
    action: '使用解毒剂',
    enabled: (ctx) => hasRole(ctx, SPIRIT_WOLF),
    actors: (ctx) => skilled(ctx, 'witch').where(() => ctx.state.spiritWolf.antidote),
    targets: antidoteTargets,
    allowNone: true,
    prompt: spiritWolfPrompts.spiritWolfAntidote,
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '不使用解毒剂' : `用解毒剂解救 ${targets[0]}号`),
    apply: applyAntidote,
    next: nightAfter('spirit_wolf_antidote'),
  },
  spirit_wolf_check: {
    kind: 'act',
    action: '查验',
    enabled: (ctx) => hasRole(ctx, SPIRIT_WOLF) && ctx.round >= 2,
    actors: (ctx) => skilled(ctx, 'seer'),
    targets: goodTargets,
    prompt: spiritWolfPrompts.spiritWolfCheck,
    describe: (ctx, _seat, targets) => (targets[0] === undefined ? '没有查验' : `查验 ${targets[0]}号：${godOrVillager(ctx, targets[0])}`),
    apply: applyCheck,
    next: nightAfter('spirit_wolf_check'),
  },
  spirit_wolf_shield: {
    kind: 'act',
    action: '庇护',
    enabled: (ctx) => hasRole(ctx, SPIRIT_WOLF) && ctx.round >= 2,
    actors: (ctx) => skilled(ctx, 'guard'),
    targets: (ctx) => ctx.seats.alive().ids().filter((seat) => seat !== ctx.state.spiritWolf.lastShield),
    allowNone: true,
    prompt: spiritWolfPrompts.spiritWolfShield,
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '今晚不庇护' : `庇护 ${targets[0]}号`),
    apply: applyShield,
    next: nightAfter('spirit_wolf_shield'),
  },
  spirit_wolf_shot: {
    kind: 'act',
    action: '翻牌带人',
    actors: triggerSeat,
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: spiritWolfPrompts.spiritWolfShot,
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '决定不翻牌' : `决定翻牌，带走 ${targets[0]}号`),
    apply: recordShot,
    next: 'spirit_wolf_shot_resolve',
  },
  spirit_wolf_shot_resolve: { kind: 'compute', run: resolveShot, next: 'return' },
} satisfies WerewolfPhases;

const spiritWolfTriggers: WerewolfTriggers = [
  { id: 'spirit-wolf-shot', on: 'seat_eliminated', when: canSpiritShoot, push: 'spirit_wolf_shot' },
];

export const spiritWolfSpecial: SpecialDescriptor = {
  key: 'spiritWolf',
  prompts: spiritWolfPrompts,
  identities: { spirit_wolf: spiritWolfPrompts.spiritWolf },
  phases: spiritWolfPhases,
  deathTriggers: spiritWolfTriggers,
  nightStep: spiritShield,
};
