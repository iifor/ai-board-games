import { compileGame, defineGame } from '@battle/engine';
import { boardVariants, DEFAULT_BOARD, findBoard } from './boards';
import { dayPhases } from './phases/day';
import { deathPhases } from './phases/death';
import { nightPhases } from './phases/night';
import { postgamePhases } from './phases/postgame';
import { sheriffPhases } from './phases/sheriff';
import { werewolfPrompts } from './prompts';
import { roleSpecs } from './roles';
import { decideWinner, werewolfResult } from './rules/victory';
import { specialPhases, specialPrompts } from './special';
import { initialWerewolfState } from './setup';
import { werewolfStateSchema, werewolfVisibility, type WerewolfParams, type WerewolfState } from './state';
import { werewolfTriggers } from './triggers';

/** 天数上限：第 6 天结束仍未分胜负时按存活情况判定 */
export const MAX_DAYS = 6;

const prompts = { ...werewolfPrompts, ...specialPrompts };

export const werewolfSpec = defineGame<WerewolfState, WerewolfParams>({
  key: 'werewolf',
  version: 4,
  title: 'AI 狼人杀',
  description: '12 人狼人杀，支持多个板子；首日竞选警长。',
  players: { min: 12, max: 12 },
  prompts,
  rulesText: werewolfPrompts.rules,
  roles: roleSpecs(),
  setup: { assign: findBoard(DEFAULT_BOARD).roles, init: initialWerewolfState },
  variants: boardVariants(),
  defaultVariant: DEFAULT_BOARD,
  state: { schema: werewolfStateSchema, visibility: werewolfVisibility },
  start: 'night_start',
  phases: {
    ...nightPhases,
    ...sheriffPhases,
    ...dayPhases,
    ...deathPhases,
    ...specialPhases,
    ...postgamePhases,
  },
  triggers: werewolfTriggers,
  gameOver: { when: (ctx) => decideWinner(ctx) !== null, goto: 'postgame_reveal' },
  end: werewolfResult,
  budget: { maxRounds: MAX_DAYS },
  presentation: {
    layout: 'circle',
    revealOnEnd: ['roles'],
    view: (ctx) => ({ board: ctx.state.board.name, sheriff: ctx.state.sheriff, idiotRevealed: ctx.state.idiotRevealed }),
  },
});

export const werewolfGame = compileGame(werewolfSpec);
