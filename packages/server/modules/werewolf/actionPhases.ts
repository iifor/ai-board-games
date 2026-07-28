/**
 * 夜间行动阶段配置
 * 定义每个角色的播报流程：请睁眼 → 行动引导 → 结果播报 → 请闭眼
 */

import { resolveActionSpeech } from './actionSpeech';

interface PhaseMessages {
  start: string;
  result: string;
  end: string;
}

interface NightActionPhaseConfig {
  actionType: string;
  roleName: string;
  buildMessages: (day: number, context?: PhaseContext) => PhaseMessages;
}

interface PhaseContext {
  escapeHunterSpeeches?: unknown[];
  escapeHunterTarget?: number | string | null;
  wolfTarget?: number | string | null;
  target?: number | string | null;
  seerResult?: string | null;
  reason?: string | null;
  witchSaveUsed?: boolean;
  witchPoisonUsed?: boolean;
  guardTarget?: number | string | null;
  hybridMasterId?: number | string | null;
  silencedPlayerId?: number | string | null;
  knightDuel?: { actorId?: number; targetId?: number; success?: boolean } | null;
  butterflyTarget?: number | string | null;
  stalkerTarget?: number | string | null;
  wolfBeautyTarget?: number | string | null;
  demonInspect?: { target?: number | string; result?: string } | null;
  nightmareTarget?: number | string | null;
  dreamerTarget?: number | string | null;
  magicianSwap?: { firstTarget?: number | string | null; secondTarget?: number | string | null } | null;
  fortuneTellerMark?: { target?: number | string | null; reason?: string | null } | null;
  bigBadWolfTarget?: number | string | null;
  crowCurse?: { target?: number | string | null; reason?: string | null } | null;
  blackMerchantGift?: { actorId?: number | string; targetId?: number | string; gift?: string; success?: boolean; reason?: string | null } | null;
  luckySeerCheck?: { actorId?: number | string; target?: number | string; result?: string; reason?: string | null } | null;
  luckyPoisonTarget?: number | string | null;
  youngerBrotherTarget?: number | string | null;
  ghostBrideLink?: { actorId?: number | string; partnerId?: number | string; witnessId?: number | string; reason?: string | null } | null;
  ghostBrideChat?: Array<{ playerId?: number | string; text?: string }>;
  ghostBrideTarget?: number | string | null;
  demonHunterTarget?: number | string | null;
  spiritWolfLearn?: { targetId?: number | string | null; learnedRole?: string | null } | null;
  spiritWolfInspect?: { target?: number | string | null; result?: string | null } | null;
  spiritWolfGuardTarget?: number | string | null;
  spiritWolfAntidoteTarget?: number | string | null;
  wolfWitchCurse?: { targetId?: number | string | null; reason?: string | null } | null;
  illusionTarget?: number | string | null;
  penguinFrozenId?: number | string | null;
  foxInspect?: { targetIds?: number[]; hasWolf?: boolean; reason?: string | null } | null;
  bearRoar?: { roaring?: boolean; adjacentWolfIds?: number[] } | null;
}

const NIGHT_ACTION_PHASES: Record<string, NightActionPhaseConfig> = {
  escape_hunter_speech: {
    actionType: 'escape_hunter_speech',
    roleName: '猎人',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '猎人请睁眼，开始商议猎杀目标。',
      result: context?.escapeHunterSpeeches?.length ? '猎人已完成夜间商议。' : '',
      end: '',
    }),
  },
  escape_hunter_vote: {
    actionType: 'escape_hunter_vote',
    roleName: '猎人',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '猎人请共同选择今晚的猎杀目标。',
      result: context?.escapeHunterTarget ? `猎人选择猎杀${context.escapeHunterTarget}号。` : '',
      end: '猎人请闭眼。',
    }),
  },
  wolf_speech: {
    actionType: 'wolf_speech',
    roleName: '狼人',
    buildMessages: () => ({
      start: ``,
      result: '',
      end: ``,
    }),
  },
  wolf_vote: {
    actionType: 'wolf_vote',
    roleName: '狼人',
    buildMessages: () => ({
      start: `选择今晚刀口`,
      result: '',
      end: `狼人请闭眼`,
    }),
  },
  fortune_teller_mark: {
    actionType: 'fortune_teller_mark',
    roleName: '占卜师',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `占卜师请睁眼，可以选择是否标记一名玩家。`,
      result: context?.fortuneTellerMark?.target ? actionResultSpeech(`占卜师标记了${context.fortuneTellerMark.target}号`, context.reason) : '',
      end: `占卜师请闭眼。`,
    }),
  },
  big_bad_wolf_kill: {
    actionType: 'big_bad_wolf_kill',
    roleName: '大灰狼',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `大灰狼请睁眼，请选择击杀目标。`,
      result: context?.bigBadWolfTarget ? actionResultSpeech(`大灰狼袭击了${context.bigBadWolfTarget}号`, context.reason) : '',
      end: `大灰狼请闭眼。`,
    }),
  },
  ghost_bride_link: {
    actionType: 'ghost_bride_link',
    roleName: 'Ghost Bride',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: 'Ghost Bride wakes and chooses a groom and witness.',
      result: context?.ghostBrideLink?.partnerId ? actionResultSpeech(`Ghost Bride linked ${context.ghostBrideLink.partnerId} and witness ${context.ghostBrideLink.witnessId}`, context.reason) : '',
      end: 'Ghost Bride closes eyes.',
    }),
  },
  ghost_bride_chat: {
    actionType: 'ghost_bride_chat',
    roleName: 'Ghost Bride',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: 'Ghost Bride group private chat.',
      result: context?.ghostBrideChat?.length ? 'Ghost Bride group finished private chat.' : '',
      end: '',
    }),
  },
  ghost_bride_kill: {
    actionType: 'ghost_bride_kill',
    roleName: 'Ghost Bride',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: 'Ghost Bride group chooses a kill target.',
      result: context?.ghostBrideTarget ? actionResultSpeech(`Ghost Bride group killed ${context.ghostBrideTarget}`, context.reason) : '',
      end: 'Ghost Bride group closes eyes.',
    }),
  },
  demon_hunter_hunt: {
    actionType: 'demon_hunter_hunt',
    roleName: '猎魔人',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '猎魔人请睁眼，请选择狩猎目标。',
      result: context?.demonHunterTarget ? actionResultSpeech(`猎魔人狩猎了${context.demonHunterTarget}号`, context.reason) : '',
      end: '猎魔人请闭眼。',
    }),
  },
  spirit_wolf_learn: {
    actionType: 'spirit_wolf_learn',
    roleName: '灵狼',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '灵狼请睁眼，请选择一名好人阵营玩家学习能力。',
      result: context?.spiritWolfLearn?.targetId ? actionResultSpeech(`灵狼学习了${context.spiritWolfLearn.targetId}号`, context.reason) : '',
      end: '灵狼请闭眼。',
    }),
  },
  spirit_wolf_inspect: {
    actionType: 'spirit_wolf_inspect',
    roleName: '灵狼',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '灵狼请睁眼，请选择查验一名好人玩家。',
      result: context?.spiritWolfInspect?.target ? `灵狼查验了${context.spiritWolfInspect.target}号，结果是${context.spiritWolfInspect.result || '未知'}。` : '',
      end: '灵狼请闭眼。',
    }),
  },
  spirit_wolf_guard: {
    actionType: 'spirit_wolf_guard',
    roleName: '灵狼',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '灵狼请睁眼，请选择庇护目标。',
      result: context?.spiritWolfGuardTarget ? actionResultSpeech(`灵狼庇护了${context.spiritWolfGuardTarget}号`, context.reason) : '',
      end: '灵狼请闭眼。',
    }),
  },
  spirit_wolf_antidote: {
    actionType: 'spirit_wolf_antidote',
    roleName: '灵狼',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '灵狼请睁眼，请选择是否使用解药。',
      result: context?.spiritWolfAntidoteTarget ? actionResultSpeech(`灵狼解救了${context.spiritWolfAntidoteTarget}号`, context.reason) : '',
      end: '灵狼请闭眼。',
    }),
  },
  wolf_witch_curse: {
    actionType: 'wolf_witch_curse',
    roleName: '狼巫',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '狼巫请睁眼，请选择诅咒目标。',
      result: context?.wolfWitchCurse?.targetId ? actionResultSpeech(`狼巫诅咒了${context.wolfWitchCurse.targetId}号`, context.reason) : '',
      end: '狼巫请闭眼。',
    }),
  },
  illusionist_illusion: {
    actionType: 'illusionist_illusion',
    roleName: '幻术师',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '幻术师请睁眼，请选择幻象目标。',
      result: context?.illusionTarget ? actionResultSpeech(`幻术师选择${context.illusionTarget}号成为幻象`, context.reason) : '',
      end: '幻术师请闭眼。',
    }),
  },
  crow_curse: {
    actionType: 'crow_curse',
    roleName: '乌鸦',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `乌鸦请睁眼，请选择诅咒目标。`,
      result: context?.crowCurse?.target ? actionResultSpeech(`乌鸦诅咒了${context.crowCurse.target}号`, context.reason) : '',
      end: `乌鸦请闭眼。`,
    }),
  },
  black_merchant_gift: {
    actionType: 'black_merchant_gift',
    roleName: '黑商',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '黑商请睁眼，选择赠送技能的目标。',
      result: context?.blackMerchantGift?.targetId
        ? actionResultSpeech(`黑商赠技给${context.blackMerchantGift.targetId}号，结果${context.blackMerchantGift.success ? '成功' : '失败'}`, context.reason)
        : '',
      end: '黑商请闭眼。',
    }),
  },
  lucky_seer_check: {
    actionType: 'lucky_seer_check',
    roleName: '幸运儿',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '获得查验的幸运儿请睁眼。',
      result: context?.luckySeerCheck?.target ? actionResultSpeech(`${context.luckySeerCheck.target}号查验结果：${context.luckySeerCheck.result || '未知'}`, context.reason) : '',
      end: '幸运儿请闭眼。',
    }),
  },
  lucky_witch_poison: {
    actionType: 'lucky_witch_poison',
    roleName: '幸运儿',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '获得毒药的幸运儿请睁眼。',
      result: context?.luckyPoisonTarget ? actionResultSpeech(`幸运儿毒了${context.luckyPoisonTarget}号`, context.reason) : '',
      end: '幸运儿请闭眼。',
    }),
  },
  younger_brother_kill: {
    actionType: 'younger_brother_kill',
    roleName: '狼弟',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '狼弟请睁眼，选择独立击杀目标。',
      result: context?.youngerBrotherTarget ? actionResultSpeech(`狼弟选择击杀${context.youngerBrotherTarget}号`, context.reason) : '',
      end: '狼弟请闭眼。',
    }),
  },
  penguin_freeze: {
    actionType: 'penguin_freeze',
    roleName: '企鹅',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '企鹅请睁眼，请选择冰冻目标。',
      result: context?.penguinFrozenId ? actionResultSpeech(`企鹅冰冻了${context.penguinFrozenId}号`, context.reason) : '',
      end: '企鹅请闭眼。',
    }),
  },
  fox_inspect: {
    actionType: 'fox_inspect',
    roleName: '狐狸',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: '狐狸请睁眼，请选择验三连中心位。',
      result: context?.foxInspect?.targetIds?.length
        ? actionResultSpeech(`狐狸查验三连结果：${context.foxInspect.hasWolf ? '有狼' : '无狼'}`, context.reason)
        : '',
      end: '狐狸请闭眼。',
    }),
  },
  bear_tamer_roar: {
    actionType: 'bear_tamer_roar',
    roleName: '驯熊师',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: ``,
      result: context?.bearRoar?.roaring ? `熊咆哮了。` : `熊没有咆哮。`,
      end: ``,
    }),
  },
  seer_check: {
    actionType: 'seer_check',
    roleName: '预言家',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `预言家请睁眼，请选择查验的目标`,
      result: context?.seerResult
        ? actionResultSpeech(`${context.target || '?'}号玩家的身份是：${context.seerResult}`, context.reason)
        : '',
      end: `预言家请闭眼`,
    }),
  },
  witch_save: {
    actionType: 'witch_save',
    roleName: '女巫',
    buildMessages: (_day: number, context: PhaseContext = {}) => ({
      start: `女巫请睁眼。`,
      result: context.witchSaveUsed
        ? actionResultSpeech(`女巫使用了解药`, context.reason)
        : `女巫没有使用解药`,
      end: '',  // 女巫在毒药阶段后才闭眼
    }),
  },
  witch_poison: {
    actionType: 'witch_poison',
    roleName: '女巫',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `女巫请睁眼。你有一瓶毒药，你要用吗？`,
      result: context?.witchPoisonUsed
        ? actionResultSpeech(`女巫毒了${context.target}号`, context.reason)
        : ``,
      end: `女巫请闭眼。`,
    }),
  },
  guard_protect: {
    actionType: 'guard_protect',
    roleName: '守卫',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `守卫请睁眼，请选择今晚守护的目标。`,
      result: context?.guardTarget
        ? actionResultSpeech(`守卫守护了${context.guardTarget}号`, context.reason)
        : `守卫选择空守。`,
      end: `守卫请闭眼。`,
    }),
  },
  hybrid_choose_master: {
    actionType: 'hybrid_choose_master',
    roleName: '混血儿',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `混血儿请睁眼，请选择你的主人。`,
      result: context?.hybridMasterId ? `混血儿选择了${context.hybridMasterId}号作为主人。` : '',
      end: `混血儿请闭眼。`,
    }),
  },
  butterfly_hug: {
    actionType: 'butterfly_hug',
    roleName: '花蝴蝶',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `花蝴蝶请睁眼，请选择要抱的玩家。`,
      result: context?.butterflyTarget ? actionResultSpeech(`花蝴蝶抱住了${context.butterflyTarget}号`, context.reason) : '',
      end: `花蝴蝶请闭眼。`,
    }),
  },
  stalker_assassinate: {
    actionType: 'stalker_assassinate',
    roleName: '潜行者',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `潜行者请睁眼，可以选择是否发动暗杀。`,
      result: context?.stalkerTarget ? actionResultSpeech(`潜行者暗杀了${context.stalkerTarget}号`, context.reason) : '',
      end: `潜行者请闭眼。`,
    }),
  },
  wolf_beauty_charm: {
    actionType: 'wolf_beauty_charm',
    roleName: '狼美人',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `狼美人请睁眼，请选择魅惑目标。`,
      result: context?.wolfBeautyTarget ? actionResultSpeech(`狼美人魅惑了${context.wolfBeautyTarget}号`, context.reason) : '',
      end: `狼美人请闭眼。`,
    }),
  },
  demon_inspect: {
    actionType: 'demon_inspect',
    roleName: '恶魔',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `恶魔请睁眼，请选择查验目标。`,
      result: context?.demonInspect?.target ? `恶魔查验了${context.demonInspect.target}号，结果是${context.demonInspect.result || '未知'}。` : '',
      end: `恶魔请闭眼。`,
    }),
  },
  nightmare_fear: {
    actionType: 'nightmare_fear',
    roleName: '梦魇',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `梦魇请睁眼，请选择恐惧目标。`,
      result: context?.nightmareTarget ? actionResultSpeech(`梦魇恐惧了${context.nightmareTarget}号`, context.reason) : '',
      end: `梦魇请闭眼。`,
    }),
  },
  dreamer_dream: {
    actionType: 'dreamer_dream',
    roleName: '摄梦人',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `摄梦人请睁眼，请选择今夜摄梦的目标。`,
      result: context?.dreamerTarget ? actionResultSpeech(`摄梦人选择了${context.dreamerTarget}号`, context.reason) : '',
      end: `摄梦人请闭眼。`,
    }),
  },
  magician_swap: {
    actionType: 'magician_swap',
    roleName: '魔术师',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `魔术师请睁眼，请选择两名玩家交换号码。`,
      result: context?.magicianSwap?.firstTarget && context?.magicianSwap?.secondTarget
        ? actionResultSpeech(`魔术师交换了${context.magicianSwap.firstTarget}号和${context.magicianSwap.secondTarget}号`, context.reason)
        : '',
      end: `魔术师请闭眼。`,
    }),
  },
  elder_silence: {
    actionType: 'elder_silence',
    roleName: '禁言长老',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `禁言长老请睁眼，请选择禁言目标。`,
      result: context?.silencedPlayerId
        ? actionResultSpeech(`禁言长老禁言了${context.silencedPlayerId}号`, context.reason)
        : '',
      end: `禁言长老请闭眼。`,
    }),
  },
  knight_duel: {
    actionType: 'knight_duel',
    roleName: '骑士',
    buildMessages: (_day: number, context?: PhaseContext) => ({
      start: `骑士可以选择是否发动决斗。`,
      result: context?.knightDuel?.targetId
        ? `骑士决斗${context.knightDuel.targetId}号，${context.knightDuel.success ? '目标是狼人，目标出局。' : '目标是好人，骑士出局。'}`
        : '',
      end: '',
    }),
  },
  day_speech: {
    actionType: 'day_speech',
    roleName: '所有玩家',
    buildMessages: () => ({
      start: '请开始发言',
      result: '',
      end: '发言结束',
    }),
  },
  day_vote: {
    actionType: 'day_vote',
    roleName: '所有玩家',
    buildMessages: () => ({
      start: '请选择白天放逐玩家',
      result: '',
      end: '投票结束',
    }),
  },
};

function actionResultSpeech(result: string, reason?: string | null): string {
  return resolveActionSpeech(reason, '', `${result}。`);
}

/**
 * 获取行动阶段配置
 */
function getActionPhaseConfig(actionType: string): NightActionPhaseConfig | null {
  return NIGHT_ACTION_PHASES[actionType] || null;
}

/**
 * 检查是否有阶段配置
 */
function hasActionPhase(actionType: string): boolean {
  return actionType in NIGHT_ACTION_PHASES;
}

export {
  NIGHT_ACTION_PHASES,
  getActionPhaseConfig,
  hasActionPhase,
};

export type {
  NightActionPhaseConfig,
  PhaseMessages,
  PhaseContext,
};
