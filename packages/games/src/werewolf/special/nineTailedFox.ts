import { definePrompts, type ComputeOutcome } from '@battle/engine';
import type { WerewolfPhases, WerewolfTriggers } from '../phases/types';
import { hasRole, roleCategory } from '../rules/board';
import type { WerewolfContext } from '../rules/context';
import { nightAfter } from '../rules/order';
import { FOX_TAILS } from '../stateExtras';
import type { WerewolfState } from '../state';
import type { SpecialDescriptor } from './types';

// 九尾狐：神职，有九条尾巴。每有一名神职出局失去两条、每有一名村民出局失去一条（按本局屠边类别，其他身份不计）；
// 失去全部尾巴时立即出局。每晚最后一个睁眼查看剩余尾巴数（私下告知，身份提示中保留最近一次查看的数量）。

const nineTailedFoxPrompts = definePrompts({
  nineTailedFox: [
    '你是{{me.label}}，身份是九尾狐（神职）。你有九条尾巴：每有一名神职出局你失去两条，每有一名村民出局你失去一条；失去全部尾巴时你会出局。',
    '每晚你最后一个睁眼查看尾巴数量，最近一次查看时你还有 {{state.foxTailsSeen}} 条尾巴。',
  ].join(''),
});

export const FOX_TAILS_LOST = 'fox_tails';

/** 当前剩余的尾巴：由已出局玩家的类别算出 */
function foxTails(ctx: WerewolfContext): number {
  const lost = ctx.seats.dead().list().reduce((sum, seat) => {
    if (seat.role === 'nine_tailed_fox') return sum;
    const category = roleCategory(ctx, seat);
    return sum + (category === 'god' ? 2 : category === 'villager' ? 1 : 0);
  }, 0);
  return Math.max(0, FOX_TAILS - lost);
}

function aliveFox(ctx: WerewolfContext): number | undefined {
  return ctx.seats.alive().withRole('nine_tailed_fox').ids()[0];
}

function checkTails(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const fox = aliveFox(ctx);
  if (fox === undefined) return {};
  const tails = foxTails(ctx);
  return {
    state: { ...ctx.state, foxTailsSeen: tails },
    log: [{ kind: 'narration', text: `九尾狐查看尾巴：你现在还有 ${tails} 条尾巴。`, channel: `private:${fox}` }],
  };
}

function loseAllTails(ctx: WerewolfContext): ComputeOutcome<WerewolfState> {
  const fox = aliveFox(ctx);
  if (fox === undefined || foxTails(ctx) > 0) return {};
  return { eliminate: [{ seat: fox, reason: '失去全部尾巴', cause: FOX_TAILS_LOST }] };
}

const nineTailedFoxPhases = {
  fox_check: {
    kind: 'compute',
    enabled: (ctx) => hasRole(ctx, 'nine_tailed_fox'),
    run: checkTails,
    next: nightAfter('fox_check'),
  },
  fox_fall: { kind: 'compute', run: loseAllTails, next: 'return' },
} satisfies WerewolfPhases;

const nineTailedFoxTriggers: WerewolfTriggers = [
  {
    id: 'fox-tails',
    on: 'seat_eliminated',
    when: (ctx, event) => event.kind === 'seat_eliminated' && hasRole(ctx, 'nine_tailed_fox')
      && aliveFox(ctx) !== undefined && foxTails(ctx) === 0,
    push: 'fox_fall',
  },
];

export const nineTailedFoxSpecial: SpecialDescriptor = {
  key: 'nineTailedFox',
  prompts: nineTailedFoxPrompts,
  identities: { nine_tailed_fox: nineTailedFoxPrompts.nineTailedFox },
  phases: nineTailedFoxPhases,
  deathTriggers: nineTailedFoxTriggers,
};
