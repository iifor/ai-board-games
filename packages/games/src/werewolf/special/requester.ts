import { definePrompts, type ActDecision, type ComputeOutcome, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole, roleCategory } from '../rules/board';
import { nightActors } from '../rules/block';
import { isWolf, type WerewolfContext } from '../rules/context';
import { addSeatNote } from '../rules/notes';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { GiftSkill } from '../stateExtended';
import { grantGift } from './gifts';
import type { SpecialDescriptor } from './types';

// 祈求者：神职，首夜第一个睁眼祈求一名其他存活玩家（必须祈求），按对方身份得到：
// 平民 → 白天放逐投票计为两票（rules/sheriff.ts 的 exileWeight）；猎人 → 猎人的枪；女巫 → 女巫的毒；天眼（或其他神职）→ 一次查验（gifts.ts）；
// 狼人阵营 → 成为第三方（state.thirdParty，kind requester），每晚可以单独击杀一名玩家（守护、解药挡不下），需要屠城才能获胜。
// 祈求结果私下告知并写入 seatNotes；被祈求者不会得知。

export const requesterPrompts = definePrompts({
  requester: [
    '你是{{me.label}}，身份是祈求者（神职）。首夜你第一个睁眼祈求一名玩家：他是平民则你在白天放逐投票中计为两票；他是猎人则你获得猎人的枪；',
    '他是女巫则你获得女巫的毒；他是天眼则你获得一次验人能力；他是狼人或恶魔则你成为第三方，每晚可以单独击杀一名玩家，需要让其他所有玩家出局才能获胜。',
  ].join(''),
  requesterPray: '祈求者请睁眼，选择一名玩家进行祈求。',
  requesterKill: '你是第三方的祈求者：今晚你可以单独击杀一名玩家，也可以输出空数组不杀人。',
});

type RequesterGift = NonNullable<WerewolfState['requesterGift']>;

const REQUESTER = 'requester';

function giftFor(ctx: WerewolfContext, target: Seat): RequesterGift {
  if (isWolf(target)) return 'third';
  if (target.role === 'hunter') return 'gun';
  if (target.role === 'witch') return 'poison';
  return roleCategory(ctx, target) === 'god' ? 'check' : 'double';
}

const OUTCOMES: Readonly<Record<RequesterGift, string>> = {
  double: '他是平民：你在白天放逐投票中计为两票',
  gun: '他是猎人：你获得了猎人的枪，出局时可以直接开枪带走一名玩家（不翻牌）',
  poison: '他是女巫：你获得了一瓶女巫的毒药，可以在之后任意一晚使用一次',
  check: '他是神职：你获得了一次验人能力，可以在之后任意一晚查验一名玩家是好人还是狼人',
  third: '他是狼人阵营：你成为第三方，每晚可以单独击杀一名玩家，需要让其他所有玩家出局才能获胜',
};

const GIFT_SKILLS: Partial<Readonly<Record<RequesterGift, GiftSkill>>> = { gun: 'gun', poison: 'poison', check: 'check' };

function bless(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const decision = ctx.results.requester_pray;
  const prayed = decision?.kind === 'act' ? decision.decisions.find((item) => item.targets.length > 0) : undefined;
  const target = prayed?.targets[0];
  if (!prayed || target === undefined) return {};
  const requester = prayed.seat;
  const gift = giftFor(ctx, ctx.seats.get(target));
  const text = `你祈求了 ${target}号，${OUTCOMES[gift]}。`;
  const skill = GIFT_SKILLS[gift];
  const granted = addSeatNote(skill === undefined ? ctx.state : grantGift(ctx.state, requester, skill), requester, text);
  return {
    state: {
      ...granted,
      requesterGift: gift,
      thirdParty: gift === 'third' ? { kind: 'requester', seats: [requester], core: [requester] } : granted.thirdParty,
    },
    log: [{ kind: 'narration', text, channel: `private:${requester}` }],
  };
}

function applyKill(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const thirdKill = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  return { ...ctx.state, night: { ...ctx.state.night, thirdKill } };
}

const requesterPhases = {
  requester_pray: {
    kind: 'act',
    title: '祈求者',
    action: '祈求',
    enabled: (ctx) => ctx.round === 1 && hasRole(ctx, REQUESTER),
    actors: (ctx) => nightActors(ctx, REQUESTER),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    prompt: requesterPrompts.requesterPray,
    describe: (_ctx, _seat, targets) => `祈求 ${targets[0]}号`,
    next: nightAfter('requester_pray'),
  },
  requester_bless: {
    kind: 'compute',
    enabled: (ctx) => ctx.round === 1 && hasRole(ctx, REQUESTER),
    run: bless,
    next: nightAfter('requester_bless'),
  },
  requester_kill: {
    kind: 'act',
    action: '单独击杀',
    enabled: (ctx) => hasRole(ctx, REQUESTER),
    actors: (ctx) => nightActors(ctx, REQUESTER).where(() => ctx.state.requesterGift === 'third'),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: requesterPrompts.requesterKill,
    describe: (_ctx, _seat, targets) => (targets[0] === undefined ? '祈求者今晚放弃击杀' : `单独击杀 ${targets[0]}号`),
    apply: applyKill,
    next: nightAfter('requester_kill'),
  },
} satisfies WerewolfPhases;

export const requesterSpecial: SpecialDescriptor = {
  key: 'requester',
  prompts: requesterPrompts,
  identities: { requester: requesterPrompts.requester },
  phases: requesterPhases,
};
