import { z } from 'zod';
import { defineGame, definePrompts, type GameSpec } from '../../src';

export const minimalPrompts = definePrompts({
  rules: '测试规则',
  identity: '你是{{me.label}}',
  hello: '第{{round}}轮开始',
});

export type CounterState = { readonly ticks: number };

/** 只有 announce 与 compute 的循环游戏：每轮 tick + 1，tick 到 limit 后结束 */
export function counterSpec(limit = 3, overrides: Partial<GameSpec<CounterState, Record<string, never>>> = {}) {
  return defineGame({
    key: 'counter',
    version: 1,
    title: '计数',
    description: '引擎测试用',
    players: { min: 2, max: 2 },
    prompts: minimalPrompts,
    rulesText: minimalPrompts.rules,
    roles: { player: { name: '玩家', team: 'all', identity: minimalPrompts.identity } },
    setup: { assign: { player: 2 }, init: () => ({ ticks: 0 }) },
    state: { schema: z.object({ ticks: z.number().int() }), visibility: { ticks: 'public' } },
    start: 'hello',
    phases: {
      hello: { kind: 'announce', title: '开场', text: minimalPrompts.hello, next: 'tick' },
      tick: {
        kind: 'compute',
        run: (ctx) => ({ state: { ticks: ctx.state.ticks + 1 } }),
        next: [
          { when: (ctx) => ctx.state.ticks >= limit, goto: 'end' },
          { goto: 'hello', round: 'increment' },
        ],
      },
    },
    end: (ctx) => ({ winner: null, winnerLabel: '无胜负', summary: `计数到 ${ctx.state.ticks}（${ctx.endReason}）` }),
    presentation: { layout: 'circle' },
    ...overrides,
  });
}
