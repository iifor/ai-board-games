import type { TriggerSpec } from '@battle/engine';
import type { WerewolfPhases } from '../phases/types';
import type { WerewolfParams, WerewolfState } from '../state';
import { bearTamerPhases, bearTamerPrompts } from './bearTamer';
import { bigBadWolfPhases, bigBadWolfPrompts } from './bigBadWolf';
import { bigTreePhases, bigTreePrompts, bigTreeTriggers } from './bigTree';
import { blackMerchantPhases, blackMerchantPrompts } from './blackMerchant';
import { bombmanPhases, bombmanPrompts, bombmanTriggers } from './bombman';
import { butterflyPhases, butterflyPrompts } from './butterfly';
import { crowPhases, crowPrompts } from './crow';
import { demonPhases, demonPrompts } from './demon';
import { dreamerPhases, dreamerPrompts } from './dreamer';
import { evilKnightPrompts } from './evilKnight';
import { bearPrompts } from './bear';
import { fortuneTellerPhases, fortuneTellerPrompts } from './fortuneTeller';
import { foxPhases, foxPrompts } from './fox';
import { giftPhases, giftPrompts, giftTriggers } from './gifts';
import { guardPhases, guardPrompts } from './guard';
import { heavenlyEyePhases, heavenlyEyePrompts } from './heavenlyEye';
import { hiddenWolfPhases, hiddenWolfPrompts, hiddenWolfTriggers } from './hiddenWolf';
import { hybridPhases, hybridPrompts } from './hybrid';
import { knightPhases, knightPrompts } from './knight';
import { magicianPhases, magicianPrompts } from './magician';
import { nightmarePhases, nightmarePrompts } from './nightmare';
import { nineTailedFoxPhases, nineTailedFoxPrompts, nineTailedFoxTriggers } from './nineTailedFox';
import { oldRoguePhases, oldRoguePrompts, oldRogueTriggers } from './oldRogue';
import { penguinPhases, penguinPrompts } from './penguin';
import { requesterPhases, requesterPrompts } from './requester';
import { silenceElderPhases, silenceElderPrompts } from './silenceElder';
import { stalkerPhases, stalkerPrompts } from './stalker';
import { whiteWolfKingPhases, whiteWolfKingPrompts, whiteWolfKingTriggers } from './whiteWolfKing';
import { wildChildPhases, wildChildPrompts, wildChildTriggers } from './wildChild';
import { wolfBeautyPhases, wolfBeautyPrompts, wolfBeautyTriggers } from './wolfBeauty';
import { wolfBrothersPhases, wolfBrothersPrompts, wolfBrothersTriggers } from './wolfBrothers';
import { wolfKingPhases, wolfKingPrompts, wolfKingTriggers } from './wolfKing';
import { wolfSeedPhases, wolfSeedPrompts } from './wolfSeed';

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
  ...oldRoguePrompts,
  ...wolfKingPrompts,
  ...dreamerPrompts,
  ...magicianPrompts,
  ...fortuneTellerPrompts,
  ...bigBadWolfPrompts,
  ...hiddenWolfPrompts,
  ...crowPrompts,
  ...bearTamerPrompts,
  ...wildChildPrompts,
  ...bombmanPrompts,
  ...nineTailedFoxPrompts,
  ...giftPrompts,
  ...blackMerchantPrompts,
  ...bigTreePrompts,
  ...wolfBrothersPrompts,
  ...bearPrompts,
  ...penguinPrompts,
  ...foxPrompts,
  ...wolfSeedPrompts,
  ...heavenlyEyePrompts,
  ...requesterPrompts,
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
  ...oldRoguePhases,
  ...wolfKingPhases,
  ...dreamerPhases,
  ...magicianPhases,
  ...fortuneTellerPhases,
  ...bigBadWolfPhases,
  ...hiddenWolfPhases,
  ...crowPhases,
  ...bearTamerPhases,
  ...wildChildPhases,
  ...bombmanPhases,
  ...nineTailedFoxPhases,
  ...giftPhases,
  ...blackMerchantPhases,
  ...bigTreePhases,
  ...wolfBrothersPhases,
  ...penguinPhases,
  ...foxPhases,
  ...wolfSeedPhases,
  ...heavenlyEyePhases,
  ...requesterPhases,
};

/**
 * 出局后的特殊处理，排在遗言、猎人开枪之后、移交警徽之前（声明顺序即执行顺序）：
 * 中性开枪（狼王局）→ 额外的枪 → 白狼王带人 → 狼美人殉情 → 炸弹人引爆 → 野孩子变狼 → 隐狼随狼队出局 → 九尾狐失去全部尾巴
 * → 老流氓到期出局 → 大树倒下 → 记录狼兄出局。
 */
export const specialDeathTriggers: readonly TriggerSpec<WerewolfState, WerewolfParams>[] = [
  ...wolfKingTriggers,
  ...giftTriggers,
  ...whiteWolfKingTriggers,
  ...wolfBeautyTriggers,
  ...bombmanTriggers,
  ...wildChildTriggers,
  ...hiddenWolfTriggers,
  ...nineTailedFoxTriggers,
  ...oldRogueTriggers,
  ...bigTreeTriggers,
  ...wolfBrothersTriggers,
];
