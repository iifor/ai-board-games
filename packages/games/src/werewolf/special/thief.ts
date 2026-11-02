import { definePrompts, type ComputeOutcome, type LogDraft } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import type { WerewolfContext } from '../rules/context';
import { isWolfCard } from '../rules/deal';
import { addSeatNote } from '../rules/notes';
import { nightAfter } from '../rules/order';
import { roleCatalog } from '../roles';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 盗贼：有底牌的板子开局抽出两张底牌（rules/deal.ts，结果在 state.thief，只有盗贼本人可见）。
// 盗贼首夜第一个睁眼，从两张底牌中拿一张作为自己的身份（compute 改派角色与阵营）：其中有狼人阵营的牌时必须拿它（不再询问），
// 否则自己选择。盗贼牌被抽作底牌时本局没有盗贼，阶段照常出现（标题只依据牌堆），没有人行动。

export const thiefPrompts = definePrompts({
  thief: '你是{{me.label}}，身份是盗贼。首夜你第一个睁眼，从法官手中的两张底牌（{{state.thief.first}}、{{state.thief.second}}）中拿一张作为自己的身份；其中有狼人阵营的牌时必须拿它。',
  thiefChoose: '盗贼请睁眼。法官手中的两张底牌是 {{state.thief.first}} 和 {{state.thief.second}}。选择你自己表示拿走{{state.thief.first}}，输出空数组表示拿走{{state.thief.second}}。',
});

const THIEF = 'thief';

function thiefSeat(ctx: WerewolfContext): number | undefined {
  return ctx.seats.alive().withRole(THIEF).ids()[0];
}

/** 两张底牌中的狼人阵营的牌：有则必须拿走 */
function forcedCard(ctx: WerewolfContext): string | undefined {
  return ctx.state.thief?.cards.find(isWolfCard);
}

function chosenCard(ctx: WerewolfContext): string | undefined {
  const forced = forcedCard(ctx);
  if (forced !== undefined) return forced;
  const [first, second] = ctx.state.thief?.cards ?? [];
  const decision = ctx.results.thief_choose;
  const takesFirst = decision?.kind === 'act' && decision.decisions.some((item) => item.targets.length > 0);
  return takesFirst ? first : second;
}

function take(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const seat = thiefSeat(ctx);
  const role = chosenCard(ctx);
  if (seat === undefined || role === undefined) return {};
  const entry = roleCatalog()[role];
  const name = entry?.spec.name ?? role;
  const text = forcedCard(ctx) === undefined ? `你拿走了${name}，从现在起你的身份是${name}。` : `底牌中有狼人阵营的牌，你必须拿走${name}，从现在起你的身份是${name}。`;
  const log: LogDraft[] = [{ kind: 'narration', text, channel: `private:${seat}` }];
  if (entry?.spec.team === 'werewolf') log.push({ kind: 'narration', text: `盗贼 ${seat}号 拿到了${name}，成为你们的狼队友。`, channel: 'team:werewolf' });
  return { state: addSeatNote(ctx.state, seat, `你原本是盗贼，首夜拿走了${name}。`), reassign: [{ seat, role }], log };
}

const firstNight = (ctx: WerewolfContext): boolean => ctx.round === 1 && hasRole(ctx, THIEF);

const thiefPhases = {
  thief_choose: {
    kind: 'act',
    title: '盗贼',
    action: '选择底牌',
    enabled: firstNight,
    actors: (ctx) => ctx.seats.alive().withRole(THIEF).where(() => forcedCard(ctx) === undefined),
    targets: (_ctx, seat) => [seat],
    allowNone: true,
    prompt: thiefPrompts.thiefChoose,
    describe: (ctx, _seat, targets) => `拿走${(targets.length ? ctx.state.thief?.first : ctx.state.thief?.second) ?? ''}`,
    next: nightAfter('thief_choose'),
  },
  thief_take: { kind: 'compute', enabled: firstNight, run: take, next: nightAfter('thief_take') },
} satisfies WerewolfPhases;

export const thiefSpecial: SpecialDescriptor = {
  key: 'thief',
  prompts: thiefPrompts,
  identities: { thief: thiefPrompts.thief },
  phases: thiefPhases,
};
