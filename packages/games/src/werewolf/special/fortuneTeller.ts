import { definePrompts, type ActDecision, type ComputeOutcome } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import { hasRole } from '../rules/board';
import { nightActors } from '../rules/block';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import type { WerewolfState } from '../state';

// 占卜师：每晚第一个睁眼，可以标记一个号码（全场一次，可不发动）。当晚所有狼人的击杀（狼队、大灰狼、继承击杀权的隐狼）
// 只能落在被标记的号码及其左右相邻号码上（相邻号码不论死活，已出局者自然不能被击杀）。
// 标记后立即告知狼队；大灰狼要先决定是否发动单独击杀才会得知标记（见 bigBadWolf.ts）。

export const fortuneTellerPrompts = definePrompts({
  fortuneTeller: [
    '你是{{me.label}}，身份是占卜师。每晚你第一个睁眼，可以标记一个号码：当晚狼人（包括大灰狼）只能击杀该号码及其左右相邻号码中的玩家（相邻号码不论死活）。全场只能标记一次。',
    '{{#if state.fortuneMarkUsed}}你已经用过标记。{{/if}}',
  ].join(''),
  fortuneMark: '占卜师请睁眼。是否标记一个号码？选择一名玩家表示标记，输出空数组表示今晚不发动。',
});

/** 标记范围：被标记的号码与左右相邻号码（不论死活）；今晚没有标记时为 null */
export function markScope(ctx: WerewolfContext): number[] | null {
  const { marked } = ctx.state.night;
  if (marked === null) return null;
  const total = ctx.seats.count();
  const wrap = (seat: number): number => ((seat - 1 + total) % total) + 1;
  return [wrap(marked - 1), marked, wrap(marked + 1)];
}

/** 狼人今晚能否击杀该座位（只看标记范围） */
export function withinMark(ctx: WerewolfContext, seat: number): boolean {
  const scope = markScope(ctx);
  return scope === null || scope.includes(seat);
}

/** 给狼人看的标记说明 */
export function markNotice(ctx: WerewolfContext): string {
  const scope = markScope(ctx);
  if (scope === null) return '占卜师今晚没有标记。';
  const seats = scope.map((seat) => `${seat}号`).join('、');
  return `占卜师今晚标记了 ${ctx.state.night.marked}号：今晚狼人只能击杀 ${seats} 中的存活玩家。`;
}

function applyMark(ctx: WerewolfContext, decisions: readonly ActDecision[]): WerewolfState {
  const marked = decisions.flatMap((decision) => decision.targets)[0] ?? null;
  if (marked === null) return ctx.state;
  return { ...ctx.state, night: { ...ctx.state.night, marked }, fortuneMarkUsed: true };
}

function notifyPack(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  return { log: [{ kind: 'narration', text: markNotice(ctx), channel: 'team:werewolf' }] };
}

export const fortuneTellerPhases = {
  fortune_mark: {
    kind: 'act',
    title: '占卜师',
    action: '标记',
    enabled: (ctx) => hasRole(ctx, 'fortune_teller'),
    actors: (ctx) => nightActors(ctx, 'fortune_teller').where(() => !ctx.state.fortuneMarkUsed),
    targets: (ctx, seat) => ctx.seats.alive().except(seat),
    allowNone: true,
    prompt: fortuneTellerPrompts.fortuneMark,
    describe: (_ctx, _seat, targets) => (targets.length ? `标记 ${targets[0]}号` : '今晚不标记'),
    apply: applyMark,
    next: nightAfter('fortune_mark'),
  },
  fortune_notice: {
    kind: 'compute',
    enabled: (ctx) => ctx.state.night.marked !== null,
    run: notifyPack,
    next: nightAfter('fortune_notice'),
  },
} satisfies WerewolfPhases;
