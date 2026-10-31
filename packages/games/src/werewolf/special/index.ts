import type { TriggerSpec } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import type { WerewolfParams, WerewolfState } from '../state';
import { butterflyPhases, butterflyPrompts } from './butterfly';
import { demonPhases, demonPrompts } from './demon';
import { evilKnightPrompts } from './evilKnight';
import { guardPhases, guardPrompts } from './guard';
import { hybridPhases, hybridPrompts } from './hybrid';
import { knightPhases, knightPrompts } from './knight';
import { nightmarePhases, nightmarePrompts } from './nightmare';
import { silenceElderPhases, silenceElderPrompts } from './silenceElder';
import { stalkerPhases, stalkerPrompts } from './stalker';
import { whiteWolfKingPhases, whiteWolfKingPrompts, whiteWolfKingTriggers } from './whiteWolfKing';
import { wolfBeautyPhases, wolfBeautyPrompts, wolfBeautyTriggers } from './wolfBeauty';

// 特殊角色模块的汇总入口；规则模块不要从这里引用，避免循环依赖。

export const specialPrompts = {
  ...guardPrompts,
  ...whiteWolfKingPrompts,
  ...hybridPrompts,
  ...silenceElderPrompts,
  ...knightPrompts,
  ...stalkerPrompts,
  ...butterflyPrompts,
  ...wolfBeautyPrompts,
  ...demonPrompts,
  ...evilKnightPrompts,
  ...nightmarePrompts,
};

export const specialPhases: WerewolfPhases = {
  ...guardPhases,
  ...whiteWolfKingPhases,
  ...hybridPhases,
  ...silenceElderPhases,
  ...knightPhases,
  ...stalkerPhases,
  ...butterflyPhases,
  ...wolfBeautyPhases,
  ...demonPhases,
  ...nightmarePhases,
};

/** 出局后的特殊技能，排在猎人开枪之后、移交警徽之前 */
export const specialDeathTriggers: readonly TriggerSpec<WerewolfState, WerewolfParams>[] = [
  ...whiteWolfKingTriggers,
  ...wolfBeautyTriggers,
];
