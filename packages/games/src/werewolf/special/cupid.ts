import { definePrompts, findResult, type ComputeOutcome, type LogDraft, type Seat } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import { isPackWolf, isWolf, type WerewolfContext } from '../rules/context';
import { addSeatNote } from '../rules/notes';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 丘比特：不属于狼、神、民任何一边（屠边类别 third）。首夜在盗贼之后睁眼，选择两名存活玩家（可以包括自己）成为情侣（lovers.ts），
// 情侣私下得知对方的号码（不知道身份）。两人都是好人 → 丘比特属于好人阵营；都是狼人 → 属于狼人阵营；
// 一好一狼 → 丘比特与情侣组成第三方（state.thirdParty），此时情侣中的狼人与其他狼人刀法不一致时当晚视为空刀（lover_veto）。

export const cupidPrompts = definePrompts({
  cupid: [
    '你是{{me.label}}，身份是丘比特（不属于狼、神、民任何一边）。首夜你选择两名玩家（可以包括你自己）成为情侣：一方出局时另一方殉情。',
    '两人都是好人则你属于好人阵营；都是狼人则你属于狼人阵营；一好一狼则你与情侣组成第三方阵营，需要让其他所有玩家出局才能获胜。你只知道情侣是谁，不知道他们的身份。',
  ].join(''),
  cupidLink: '丘比特请睁眼，选择两名玩家成为情侣（可以包括你自己）。',
});

const CUPID = 'cupid';

function bond(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const decision = findResult(ctx.results, 'cupid_link', 'act')?.decisions.find((item) => item.targets.length === 2);
  if (!decision) return {};
  const [first = 0, second = 0] = [...decision.targets].sort((a, b) => a - b);
  const mixed = isWolf(ctx.seats.get(first)) !== isWolf(ctx.seats.get(second));
  const loverNote = (partner: number): string => `丘比特让你与 ${partner}号 成为情侣：一方出局时另一方随之殉情（你们不能交流，也不知道对方的身份）。`;
  let state: WerewolfState = {
    ...ctx.state,
    lovers: [first, second],
    thirdParty: mixed ? { kind: 'lovers', seats: [...new Set([decision.seat, first, second])].sort((a, b) => a - b), core: [first, second] } : ctx.state.thirdParty,
  };
  state = addSeatNote(state, decision.seat, `你让 ${first}号 与 ${second}号 成为了情侣。`);
  state = addSeatNote(addSeatNote(state, first, loverNote(second)), second, loverNote(first));
  const log: LogDraft[] = [
    { kind: 'narration', text: loverNote(second), channel: `private:${first}` },
    { kind: 'narration', text: loverNote(first), channel: `private:${second}` },
  ];
  return { state, log };
}

/** 人狼恋中的狼人：他的狼刀选票与狼队的结果不一致（包括弃票）时当晚视为空刀 */
function veto(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const { wolfTarget } = ctx.state.night;
  const third = ctx.state.thirdParty;
  if (wolfTarget === null || third?.kind !== 'lovers') return {};
  const lover = ctx.state.lovers.map((seat) => ctx.seats.get(seat)).find((seat) => seat.alive && isPackWolf(seat) && third.seats.includes(seat.seat));
  if (!lover) return {};
  const ballot = findResult(ctx.results, 'wolf_kill', 'vote')?.ballots.find((item) => item.voter === lover.seat);
  if (ballot?.target === wolfTarget) return {};
  return { state: { ...ctx.state, night: { ...ctx.state.night, wolfTarget: null } } };
}

/** 丘比特所在的阵营（情侣都是好人 / 都是狼人时）；人狼恋时属于第三方，返回 null */
function cupidSide(ctx: WerewolfContext, seat: Seat): 'good' | 'werewolf' | null {
  if (seat.role !== CUPID || ctx.state.lovers.length !== 2 || ctx.state.thirdParty?.seats.includes(seat.seat)) return null;
  return ctx.state.lovers.every((lover) => isWolf(ctx.seats.get(lover))) ? 'werewolf' : 'good';
}

/** 终局说明中的丘比特结果；本局没有连成情侣时为 null */
function cupidSummary(ctx: WerewolfContext, winner: string): string | null {
  const cupid = ctx.seats.withRole(CUPID).list()[0];
  if (!cupid || ctx.state.lovers.length !== 2) return null;
  const side = cupidSide(ctx, cupid);
  if (side === null) return null;
  return `丘比特 ${cupid.seat}号属于${side === 'werewolf' ? '狼人阵营' : '好人阵营'}，${side === winner ? '随之胜利' : '随之落败'}`;
}

const cupidPhases = {
  cupid_link: {
    kind: 'act',
    title: '丘比特',
    action: '连情侣',
    count: 2,
    enabled: (ctx) => ctx.round === 1 && hasRole(ctx, CUPID),
    actors: (ctx) => nightActors(ctx, CUPID),
    targets: (ctx) => ctx.seats.alive(),
    prompt: cupidPrompts.cupidLink,
    describe: (_ctx, _seat, targets) => `让 ${targets[0]}号 与 ${targets[1]}号 成为情侣`,
    next: nightAfter('cupid_link'),
  },
  cupid_bond: { kind: 'compute', enabled: (ctx) => ctx.round === 1 && hasRole(ctx, CUPID), run: bond, next: nightAfter('cupid_bond') },
  lover_veto: { kind: 'compute', enabled: (ctx) => hasRole(ctx, CUPID), run: veto, next: nightAfter('lover_veto') },
} satisfies WerewolfPhases;

export const cupidSpecial: SpecialDescriptor = {
  key: 'cupid',
  prompts: cupidPrompts,
  identities: { cupid: cupidPrompts.cupid },
  phases: cupidPhases,
  victory: { side: cupidSide, note: cupidSummary },
};
