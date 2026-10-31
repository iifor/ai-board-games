import { z } from 'zod';
import { compileGame, defineGame, definePrompts, speechOutput, type GameSpec } from '../../src';

// 合成游戏"连锁"：座位 1 猎手、2 爆破手、其余村民（不打乱）。
// 覆盖：放逐后插入遗言、猎手出局后开枪（可放弃）、被枪杀者的嵌套遗言、爆破手发言时声明引爆（jump 并入夜）、
// 加权投票（3 号两票）、胜负已分后转入赛后公开身份。

const prompts = definePrompts({
  rules: '连锁游戏。',
  identity: '你是{{me.label}}。',
  talk: '第{{round}}轮发言。',
  vote: '投票放逐一人。',
  lastWords: '请发表遗言。',
  shoot: '你可以开枪带走一人，也可以放弃。',
});

export const chainState = z.object({ pendingShot: z.number().nullable() });
type ChainState = z.infer<typeof chainState>;

export function chainSpec(overrides: Partial<GameSpec<ChainState, Record<string, never>>> = {}) {
  return defineGame({
    key: 'chain',
    version: 1,
    title: '连锁',
    description: '引擎测试用合成游戏',
    players: { min: 5, max: 6 },
    prompts,
    rulesText: prompts.rules,
    roles: {
      hunter: { name: '猎手', team: 'town', identity: prompts.identity },
      bomber: { name: '爆破手', team: 'bomb', identity: prompts.identity },
      villager: { name: '村民', team: 'town', identity: prompts.identity },
    },
    setup: { assign: { hunter: 1, bomber: 1, villager: 'rest' }, shuffle: false, init: () => ({ pendingShot: null }) },
    state: { schema: chainState, visibility: { pendingShot: 'public' } },
    start: 'talk',
    phases: {
      talk: {
        kind: 'speak',
        title: '发言',
        actors: (ctx) => ctx.seats.alive(),
        prompt: prompts.talk,
        output: speechOutput({ max: 60 }),
        fallback: () => ({ speech: '过' }),
        declarations: { boom: { label: '引爆', allowed: (_ctx, seat) => seat.role === 'bomber' } },
        next: 'vote',
      },
      vote: {
        kind: 'vote',
        title: '放逐',
        voters: (ctx) => ctx.seats.alive(),
        candidates: (ctx, voter) => ctx.seats.alive().except(voter),
        weight: (_ctx, voter) => (voter.seat === 3 ? 2 : 1),
        prompt: prompts.vote,
        tie: { runoff: 0, then: 'none' },
        onResult: 'eliminate',
        eliminateCause: 'exile',
        next: [{ goto: 'talk', round: 'increment' }],
      },
      last_words: {
        kind: 'speak',
        title: '遗言',
        actors: (ctx) => (ctx.trigger ? [ctx.trigger.seat] : []),
        prompt: prompts.lastWords,
        output: speechOutput({ max: 60 }),
        fallback: () => ({ speech: '没有遗言' }),
        next: 'return',
      },
      hunter_shot: {
        kind: 'act',
        title: '开枪',
        action: '开枪',
        actors: (ctx) => (ctx.trigger ? [ctx.trigger.seat] : []),
        targets: (ctx, seat) => ctx.seats.alive().except(seat),
        allowNone: true,
        prompt: prompts.shoot,
        apply: (_ctx, decisions) => ({ pendingShot: decisions[0]?.targets[0] ?? null }),
        next: 'hunter_resolve',
      },
      hunter_resolve: {
        kind: 'compute',
        run: (ctx) => ({
          state: { pendingShot: null },
          eliminate: ctx.state.pendingShot === null ? [] : [{ seat: ctx.state.pendingShot, reason: '被猎手带走', cause: 'shot' }],
        }),
        next: 'return',
      },
      boom: {
        kind: 'compute',
        title: '引爆',
        run: (ctx) => ({ eliminate: ctx.trigger ? [{ seat: ctx.trigger.seat, reason: '引爆', cause: 'boom' }] : [] }),
        next: 'talk',
      },
      postgame: {
        kind: 'reveal',
        title: '复盘',
        revealRoles: true,
        content: () => ({ text: '公开所有身份' }),
        next: 'end',
      },
    },
    triggers: [
      { id: 'exile-last-words', on: 'seat_eliminated', when: (_ctx, event) => event.kind === 'seat_eliminated' && event.cause === 'exile', push: 'last_words' },
      { id: 'hunter-shot', on: 'seat_eliminated', when: (ctx, event) => ctx.seats.get(event.seat).role === 'hunter', push: 'hunter_shot' },
      { id: 'shot-last-words', on: 'seat_eliminated', when: (_ctx, event) => event.kind === 'seat_eliminated' && event.cause === 'shot', push: 'last_words' },
      { id: 'boom', on: 'action_declared', when: (_ctx, event) => event.kind === 'action_declared' && event.action === 'boom', jump: 'boom', round: 'increment' },
    ],
    gameOver: {
      when: (ctx) => ctx.seats.alive().withRole('bomber').count() === 0 || ctx.seats.alive().count() <= 2,
      goto: 'postgame',
    },
    end: (ctx) => (ctx.seats.alive().withRole('bomber').count() === 0
      ? { winner: 'town', winnerLabel: '城镇获胜', summary: '爆破手出局' }
      : { winner: 'bomb', winnerLabel: '爆破手获胜', summary: '爆破手存活' }),
    budget: { maxRounds: 6 },
    presentation: { layout: 'circle' },
    ...overrides,
  });
}

export const chainGame = compileGame(chainSpec());
