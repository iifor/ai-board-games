import { compileGame, defineGame } from '@battle/engine';
import { dayPhases } from './phases/day';
import { deathPhases } from './phases/death';
import { nightPhases } from './phases/night';
import { postgamePhases } from './phases/postgame';
import { sheriffPhases } from './phases/sheriff';
import { werewolfPrompts as prompts } from './prompts';
import { decideWinner, werewolfResult } from './rules/victory';
import { initialWerewolfState, werewolfStateSchema, werewolfVisibility, type WerewolfParams, type WerewolfState } from './state';
import { werewolfTriggers } from './triggers';

/** 天数上限：第 6 天结束仍未分胜负时按存活情况判定 */
export const MAX_DAYS = 6;

export const werewolfSpec = defineGame<WerewolfState, WerewolfParams>({
  key: 'werewolf',
  version: 1,
  title: 'AI 狼人杀',
  description: '12 人标准局：预言家、女巫、猎人、白痴、4 名村民对抗 4 名狼人，首日竞选警长。',
  players: { min: 12, max: 12 },
  prompts,
  rulesText: prompts.rules,
  roles: {
    werewolf: { name: '狼人', team: 'werewolf', identity: prompts.werewolf, knowsTeammates: true },
    seer: { name: '预言家', team: 'good', identity: prompts.seer },
    witch: { name: '女巫', team: 'good', identity: prompts.witch },
    hunter: { name: '猎人', team: 'good', identity: prompts.hunter },
    idiot: { name: '白痴', team: 'good', identity: prompts.idiot },
    villager: { name: '村民', team: 'good', identity: prompts.villager },
  },
  setup: {
    assign: { werewolf: 4, seer: 1, witch: 1, hunter: 1, idiot: 1, villager: 'rest' },
    init: initialWerewolfState,
  },
  state: { schema: werewolfStateSchema, visibility: werewolfVisibility },
  start: 'night_start',
  phases: { ...nightPhases, ...sheriffPhases, ...dayPhases, ...deathPhases, ...postgamePhases },
  triggers: werewolfTriggers,
  gameOver: { when: (ctx) => decideWinner(ctx) !== null, goto: 'postgame_reveal' },
  end: werewolfResult,
  budget: { maxRounds: MAX_DAYS },
  presentation: {
    layout: 'circle',
    revealOnEnd: ['roles'],
    view: (ctx) => ({ sheriff: ctx.state.sheriff, idiotRevealed: ctx.state.idiotRevealed }),
  },
});

export const werewolfGame = compileGame(werewolfSpec);
