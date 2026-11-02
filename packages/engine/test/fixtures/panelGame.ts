import { z } from 'zod';
import { compileGame, defineGame, definePrompts, expectResult, speechOutput } from '../../src';

// 合成游戏"评审"：两名公开身份的发言人依次发言，其余为评委，评委判定胜方。

const prompts = definePrompts({
  rules: '评审游戏：两名发言人轮流发言，评委判定胜方。',
  speaker: '你是{{me.label}}，{{me.roleName}}{{me.position}}号位。',
  judge: '你是{{me.label}}，担任评委。',
  pitch: '请发言，不超过 {{turn.maxChars}} 字。',
  review: '请判定哪位发言人表现更好，点评不超过 {{turn.maxChars}} 字。',
});

export const panelSpec = defineGame({
  key: 'panel',
  version: 1,
  title: '评审',
  description: '引擎测试用合成游戏',
  players: { min: 3, max: 6 },
  prompts,
  rulesText: prompts.rules,
  roles: {
    speaker: { name: '发言人', team: 'speakers', identity: prompts.speaker, positions: 2, publicRole: true },
    judge: { name: '评委', team: 'judges', identity: prompts.judge, publicRole: true },
  },
  seatLabel: (seat) => `${seat.seat}号${seat.role === 'judge' ? '评委' : `发言人${seat.position}`}`,
  setup: { assign: { speaker: 2, judge: 'rest' }, shuffle: false, init: () => ({}) },
  state: { schema: z.object({}) },
  start: 'pitch',
  phases: {
    pitch: {
      kind: 'speak',
      title: '发言',
      actors: (ctx) => [ctx.seats.withRole('speaker').position(1), ctx.seats.withRole('speaker').position(2)],
      prompt: prompts.pitch,
      output: speechOutput({ max: 60 }),
      fallback: () => ({ speech: '（发言人未能发言）' }),
      next: 'review',
    },
    review: {
      kind: 'judge',
      title: '评审',
      judges: (ctx) => ctx.seats.withRole('judge'),
      prompt: prompts.review,
      verdicts: { first: '支持 1 号位', second: '支持 2 号位' },
      tieVerdict: { key: 'draw', label: '平局' },
      commentMax: 60,
      next: 'end',
    },
  },
  end: (ctx) => {
    const { verdict } = expectResult(ctx.results, 'review', 'judge');
    return { winner: verdict, winnerLabel: verdict, summary: `评审结果：${verdict}` };
  },
  presentation: { layout: 'versus' },
});

export const panelGame = compileGame(panelSpec);
