import { compileGame, defineGame, speechOutput } from '@battle/engine';
import { DEBATE_SPEECH_MAX_CHARS } from '../speechLimits';
import { freeDebateTurn, freeSpeechOutput, settleFreeTurn, validateFreeSpeech } from './freeDebate';
import { debatePrompts as prompts } from './prompts';
import { closingSpeakers, crossfireTurns, debateResult, debateSeatLabel, openingSpeakers, pickTopic } from './rules';
import { debateParamsSchema, debateStateSchema } from './state';

const holdPosition = () => ({ speech: '我方坚持己方立场，请评委关注我方后续的论证。' });

export const debateSpec = defineGame({
  key: 'debate',
  version: 5,
  title: 'AI 辩论赛',
  description: '正反双方各四名辩手，经立论、攻辩、自由辩论、总结后由评委判定胜负并评选最佳辩手。',
  players: { min: 9, max: 12 },
  params: debateParamsSchema,
  prompts,
  rulesText: prompts.rules,
  roles: {
    pro: { name: '正方', team: 'pro', identity: prompts.proDebater, positions: 4, publicRole: true },
    con: { name: '反方', team: 'con', identity: prompts.conDebater, positions: 4, publicRole: true },
    judge: { name: '评委', team: 'judge', identity: prompts.judge, publicRole: true },
  },
  seatLabel: debateSeatLabel,
  setup: { assign: { pro: 4, con: 4, judge: 'rest' }, shuffle: false, init: pickTopic },
  state: { schema: debateStateSchema, visibility: { topic: 'public' } },
  start: 'topic_reveal',
  phases: {
    topic_reveal: { kind: 'announce', title: '辩题公布', text: prompts.topicAnnounce, next: 'opening' },
    opening: {
      kind: 'speak',
      title: '立论',
      actors: openingSpeakers,
      prompt: prompts.opening,
      output: speechOutput({ max: DEBATE_SPEECH_MAX_CHARS }),
      fallback: holdPosition,
      next: 'crossfire',
    },
    crossfire: {
      kind: 'speak',
      title: '攻辩',
      actors: crossfireTurns,
      prompt: prompts.crossfireQuestion,
      output: speechOutput({ max: DEBATE_SPEECH_MAX_CHARS }),
      fallback: holdPosition,
      next: 'free_start',
    },
    free_start: { kind: 'announce', title: '自由辩论开始', text: prompts.freeStart, next: 'free_debate' },
    free_debate: {
      kind: 'speak', title: '自由辩论', actors: freeDebateTurn, advanceTurn: settleFreeTurn,
      prompt: prompts.freeSpeech, output: freeSpeechOutput, validate: validateFreeSpeech,
      allowSkip: true, fallback: holdPosition, next: 'free_end',
    },
    free_end: {
      kind: 'announce', title: '自由辩论结束', text: prompts.freeEnd, next: 'closing',
    },
    closing: {
      kind: 'speak',
      title: '总结陈词',
      actors: closingSpeakers,
      prompt: prompts.closing,
      output: speechOutput({ max: DEBATE_SPEECH_MAX_CHARS }),
      fallback: holdPosition,
      next: 'judging',
    },
    judging: {
      kind: 'judge',
      title: '评委点评',
      judges: (ctx) => ctx.seats.inTeam('judge'),
      prompt: prompts.review,
      verdicts: { pro: '判正方胜', con: '判反方胜' },
      tieVerdict: { key: 'draw', label: '平局' },
      commentMax: DEBATE_SPEECH_MAX_CHARS,
      next: 'mvp',
    },
    mvp: {
      kind: 'vote',
      title: '最佳辩手评选',
      voters: (ctx) => ctx.seats.inTeam('judge'),
      candidates: (ctx) => ctx.seats.inTeam('pro', 'con'),
      prompt: prompts.mvp,
      tie: { runoff: 0, then: 'seeded_random' },
      next: 'end',
    },
  },
  debug: {
    speak: (ctx, _seat, vars) => ctx.phaseId === 'free_debate'
      ? { speech: '我方认为应当检验这个论点在具体情境中是否成立。'.repeat(5).slice(0, Math.min(100, Number(vars.maxChars))) }
      : undefined,
  },
  end: debateResult,
  presentation: {
    layout: 'versus',
    areas: { left: 'pro', right: 'con', bench: 'judge' },
    view: (ctx) => ({ topic: ctx.state.topic }),
  },
});

export const debateGame = compileGame(debateSpec);
