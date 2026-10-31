import { z } from 'zod';
import { compileGame, defineGame, definePrompts, speechOutput } from '../../src';

// 合成游戏"暗号"：红队 2 人互知身份并有队内频道，其余为蓝队。
// 覆盖：队内频道、ownerOnly / team / host 状态、顺序发言、内容校验、私密动作、投票淘汰与复投、终局揭示。

export const secretState = z.object({
  banner: z.string(),
  secret: z.string(),
  redPlan: z.string(),
  codes: z.record(z.string(), z.string()),
  marks: z.record(z.string(), z.array(z.number())),
});
export type SecretState = z.infer<typeof secretState>;

const prompts = definePrompts({
  rules: '暗号游戏。{{state.banner}}',
  identity: '你是{{me.label}}。{{#if teammates}}队友：{{#each teammates}}{{this.label}} {{/each}}{{/if}}你的暗号是 {{state.codes}}。',
  intro: '游戏开始：{{state.banner}}',
  redChat: '和队友商量计划：{{state.redPlan}}',
  talk: '第{{round}}轮公开发言。',
  mark: '选择一名要标记的玩家。',
  vote: '投票淘汰一名玩家（复投轮次 {{turn.runoff}}）。',
});

export const secretSpec = defineGame({
  key: 'secret',
  version: 1,
  title: '暗号',
  description: '引擎测试用合成游戏',
  players: { min: 4, max: 6 },
  params: z.object({ rounds: z.number().int().min(1).max(3).default(2) }),
  prompts,
  rulesText: prompts.rules,
  roles: {
    red: { name: '红队', team: 'red', identity: prompts.identity, knowsTeammates: true },
    blue: { name: '蓝队', team: 'blue', identity: prompts.identity },
  },
  setup: {
    assign: { red: 2, blue: 'rest' },
    init: (ctx) => ({
      banner: '找出红队',
      secret: `机密词-${ctx.random('secret').int(1000)}`,
      redPlan: '红队计划：今晚集中标记蓝队',
      codes: Object.fromEntries(ctx.seats.ids().map((seat) => [String(seat), `暗号-${seat}-${ctx.random(`code${seat}`).int(1000)}`])),
      marks: {},
    }),
  },
  state: {
    schema: secretState,
    visibility: { banner: 'public', codes: 'ownerOnly', redPlan: { team: 'red' } },
  },
  start: 'intro',
  phases: {
    intro: { kind: 'announce', text: prompts.intro, next: 'red_chat' },
    red_chat: {
      kind: 'speak',
      title: '红队密谈',
      actors: (ctx) => ctx.seats.alive().inTeam('red'),
      prompt: prompts.redChat,
      output: speechOutput({ max: 80 }),
      fallback: () => ({ speech: '红队按计划行动' }),
      channel: () => 'team:red',
      next: 'talk',
    },
    talk: {
      kind: 'speak',
      title: '公开发言',
      actors: (ctx) => ctx.seats.alive(),
      prompt: prompts.talk,
      output: speechOutput({ max: 80 }),
      validate: (output, ctx) => (output.speech.includes(ctx.state.secret) ? '不能说出机密词' : null),
      fallback: (_ctx, seat) => ({ speech: `${seat.seat}号没有想好怎么说` }),
      next: 'mark',
    },
    mark: {
      kind: 'act',
      title: '标记',
      action: '标记',
      actors: (ctx) => ctx.seats.alive(),
      targets: (ctx, seat) => ctx.seats.alive().except(seat),
      prompt: prompts.mark,
      apply: (ctx, decisions) => ({
        ...ctx.state,
        marks: Object.fromEntries(decisions.map((decision) => [String(decision.seat), [...decision.targets]])),
      }),
      next: 'vote',
    },
    vote: {
      kind: 'vote',
      title: '放逐',
      voters: (ctx) => ctx.seats.alive(),
      candidates: (ctx, voter) => ctx.seats.alive().except(voter),
      prompt: prompts.vote,
      tie: { runoff: 1, then: 'seeded_random' },
      onResult: 'eliminate',
      eliminateReason: '被投票放逐',
      next: [
        { when: (ctx) => ctx.seats.alive().inTeam('red').count() === 0, goto: 'finale' },
        { when: (ctx) => ctx.round >= ctx.params.rounds, goto: 'finale' },
        { goto: 'talk', round: 'increment' },
      ],
    },
    finale: {
      kind: 'reveal',
      title: '揭晓',
      content: (ctx) => ({ text: `红队是：${ctx.seats.inTeam('red').ids().join('、')}号` }),
      next: 'end',
    },
  },
  end: (ctx) => {
    const redAlive = ctx.seats.alive().inTeam('red').count();
    return redAlive === 0
      ? { winner: 'blue', winnerLabel: '蓝队获胜', summary: '红队全部出局' }
      : { winner: 'red', winnerLabel: '红队获胜', summary: `红队存活 ${redAlive} 人` };
  },
  budget: { maxRounds: 3 },
  presentation: {
    layout: 'circle',
    revealOnEnd: ['roles'],
    view: (ctx) => ({ banner: ctx.state.banner }),
  },
});

export const secretGame = compileGame(secretSpec);
