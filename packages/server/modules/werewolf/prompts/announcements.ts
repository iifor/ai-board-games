import { getSeatNumber } from '../utils';

// ============================================================
// 主持播报提示词 —— 游戏流程中向所有玩家展示的文本
// ============================================================

// ---- 夜间睁眼提示 ----
const WEREWOLF_NIGHT_PROMPTS: Record<string, string> = {
  wolfWake: '狼人请睁眼',
  seerWake: '预言家请睁眼。请选择要查验的玩家。',
  guardWake: '守卫请睁眼。请选择要守护的玩家。',
  witchAntidote: '女巫请睁眼。今晚它倒牌，你要救吗？',
  witchPoison: '女巫请睁眼。你有一瓶毒药，你要用吗？'
} as const;

const WEREWOLF_NIGHT_PROMPT_KEYS: Record<string, string> = {
  'wolf-wake': 'wolfWake',
  'seer-wake': 'seerWake',
  'guard-wake': 'guardWake',
  'witch-antidote': 'witchAntidote',
  'witch-poison': 'witchPoison'
} as const;

function getWerewolfNightPrompt(type: string): string {
  return WEREWOLF_NIGHT_PROMPTS[WEREWOLF_NIGHT_PROMPT_KEYS[type]] || '';
}

// ---- 夜间结果播报 ----

interface NightDeath {
  id: number;
  reason: string;
}

interface RoundNight {
  deaths?: NightDeath[];
}

interface RoundWithNight {
  night?: RoundNight;
}

function buildNightPublicMessage(round: RoundWithNight = {}, agents?: Array<{ id: number }>): string {
  const deaths = Array.isArray(round.night?.deaths) ? round.night.deaths : [];
  if (!deaths.length) return '昨晚是平安夜。';
  return `昨晚${deaths.map((item) => `${getSeatNumber(item.id, agents)}号`).join('、')}死亡。`;
}

function buildDayStartMessage(): string {
  return '天亮了。';
}

// ---- 警长播报 ----

interface SheriffElection {
  candidates?: number[];
}

interface RoundWithSheriff {
  sheriffElection?: SheriffElection;
  sheriffId?: number | null;
}

function buildSheriffStartMessage(round: RoundWithSheriff = {}): string {
  const candidates = round.sheriffElection?.candidates || [];
  if (!candidates.length) return '现在进入警长竞选。想上警的玩家请举手。';
  return '现在进入警长竞选。上警玩家依次发言。';
}

function buildSheriffResultMessage(round: RoundWithSheriff = {}, _modeConfig: Record<string, unknown> = {}, agents?: Array<{ id: number }>): string {
  if (!round.sheriffId) return '警长竞选结束，本局没有警长。';
  return `${getSeatNumber(round.sheriffId, agents)}号当选警长。`;
}

// ---- 动作标签 ----
const ACTION_LABELS: Record<string, string> = {
  wolf_kill: '狼人袭击',
  wolf_speech: '狼队战术部署',
  wolf_vote: '夜间刀口',
  seer_check: '预言家查验',
  guard_protect: '守卫守护',
  witch_save: '女巫解药',
  witch_poison: '女巫毒药',
  hybrid_choose_master: '混血儿选主人',
  elder_silence: '禁言长老禁言',
  knight_duel: '骑士决斗',
  butterfly_hug: '花蝴蝶抱人',
  stalker_assassinate: '潜行者暗杀',
  wolf_beauty_charm: '狼美人魅惑',
  demon_inspect: '恶魔查验',
  nightmare_fear: '梦魇恐惧',
  day_speech: '白天发言',
  day_vote: '白天投票',
  hunter_shot: '猎人开枪',
  sheriff_signup: '警长竞选',
  sheriff_speech: '竞选发言',
  sheriff_withdraw: '现在开始退水',
  sheriff_vote: '警长投票',
  sheriff_runoff_speech: '警上复选',
  sheriff_runoff_vote: '警长复投',
  sheriff_resolve: '警长竞选结算',
  sheriff_speech_direction: '警长决定发言方向'
};

// ---- 阶段/动作消息 ----

function phaseStartedMessage(phase: string | undefined, _day: number | undefined): string {
  if (phase === 'night') return '天黑请闭眼';
  if (phase === 'day') return '天亮了。';
  return '流程进入下一阶段。';
}

function actionRequestedMessage(actionType?: string, _day?: number): string {
  if (actionType === 'wolf_speech') return '狼人请睁眼';
  if (actionType === 'wolf_vote') return '狼人请投票';
  if (actionType === 'day_vote') return '请选择白天放逐玩家';
  if (actionType === 'day_speech') return '请开始发言';
  if (actionType === 'sheriff_signup') return '现在进入警长竞选，想上警的玩家请举手';
  if (actionType === 'sheriff_speech') return '上警玩家请依次发言';
  if (actionType === 'sheriff_vote') return '请投票选出警长';
  if (actionType === 'sheriff_runoff_vote') return '警长平票，请进行复投';
  return `${actionLabel(actionType)}`;
}

function actionResolvedMessage(actionType?: string, _day?: number): string {
  if (actionType === 'day_vote') return '放逐投票完成';
  if (actionType === 'day_speech') return '发言结束';
  return `${actionLabel(actionType)}完成`;
}

function actionSkippedMessage(actionType?: string, _day?: number): string {
  return `${actionLabel(actionType)}已跳过。`;
}

function effectResolvedMessage(phase?: string, _day?: number): string {
  if (phase === 'night') return '';
  if (phase === 'day') return '';
  return '';
}

function actionLabel(actionType?: string): string {
  return ACTION_LABELS[actionType || ''] || '当前';
}

// ---- 阶段提示（按角色睁眼）----

const PHASE_START_MESSAGES: Record<string, string> = {
  seer_check: '预言家请睁眼，请选择查验的目标。',
  witch_save: '女巫请睁眼。',
  witch_poison: '女巫请睁眼。你有一瓶毒药，你要用吗？',
  guard_protect: '守卫请睁眼，请选择今晚守护的目标。',
  hybrid_choose_master: '混血儿请睁眼，请选择你的主人。',
  elder_silence: '禁言长老请睁眼，请选择禁言目标。',
  knight_duel: '骑士可以选择是否发动决斗。',
  butterfly_hug: '花蝴蝶请睁眼，请选择要抱的玩家。',
  stalker_assassinate: '潜行者请睁眼，可以选择是否发动暗杀。',
  wolf_beauty_charm: '狼美人请睁眼，请选择魅惑目标。',
  demon_inspect: '恶魔请睁眼，请选择查验目标。',
  nightmare_fear: '梦魇请睁眼，请选择恐惧目标。',
  wolf_speech: '狼人请睁眼',
  wolf_vote: '请选择今晚刀口',
  day_vote: '请选择白天放逐玩家',
  day_speech: '请开始发言',
  sheriff_signup: '现在进入警长竞选，想上警的玩家请举手',
  sheriff_speech: '上警玩家请依次发言',
  sheriff_vote: '请投票选出警长',
  sheriff_runoff_vote: '警长平票，请进行复投',
};

function phaseStartMessage(actionType?: string, _day?: number): string {
  return PHASE_START_MESSAGES[actionType || ''] || `${actionLabel(actionType)}开始。`;
}

function phaseResultMessage(actionType?: string, day?: number, result?: Record<string, unknown>): string {
  if (actionType === 'seer_check') {
    const faction = result?.faction || result?.result || '未知';
    return `它的身份是${faction}。`;
  }
  if (actionType === 'witch_save') {
    return ''; // 解药使用结果通过 actionPhases 播报
  }
  if (actionType === 'witch_poison') {
    return ''; // 不播报，用药信息只在C端展示
  }
  if (actionType === 'guard_protect') {
    const target = result?.target;
    return target ? `守卫守护了${target}号。` : '守卫选择空守。';
  }
  return `${actionLabel(actionType)}完成。`;
}

// ---- 阶段结束提示 ----

const PHASE_END_MESSAGES: Record<string, string> = {
  seer_check: '预言家请闭眼',
  witch_save: '',
  witch_poison: '女巫请闭眼',
  guard_protect: '守卫请闭眼',
  hybrid_choose_master: '混血儿请闭眼',
  elder_silence: '禁言长老请闭眼',
  knight_duel: '',
  butterfly_hug: '花蝴蝶请闭眼',
  stalker_assassinate: '潜行者请闭眼',
  wolf_beauty_charm: '狼美人请闭眼',
  demon_inspect: '恶魔请闭眼',
  nightmare_fear: '梦魇请闭眼',
  wolf_speech: '狼人请闭眼',
  wolf_vote: '狼人请闭眼',
  day_speech: '发言结束',
  day_vote: '投票结束',
  sheriff_signup: '上警环节结束',
  sheriff_speech: '竞选发言结束',
  sheriff_vote: '警长投票结束',
  sheriff_runoff_vote: '警长复投结束',
};

function phaseEndMessage(actionType?: string, day?: number): string {
  return PHASE_END_MESSAGES[actionType || ''] || `${actionLabel(actionType)}结束。`;
}

// ---- 工具函数 ----

/** 根据发言顺序生成白天发言播报消息 */
function buildDaySpeechOrderAnnouncement(round: Record<string, unknown> = {}): string {
  const daySpeech = round.daySpeech as { source?: string; direction?: string; startPlayerId?: number; sheriffId?: number } | undefined;
  if (!daySpeech) return '';
  if (daySpeech.source === 'sheriff') {
    const dir = daySpeech.direction === 'counterclockwise' ? '逆时针' : '顺时针';
    return `警长决定${dir}发言，从${daySpeech.startPlayerId}号开始`;
  }
  if (daySpeech.source === 'night-death') {
    return `从死者下家${daySpeech.startPlayerId}号开始发言`;
  }
  if (daySpeech.source === 'random' && daySpeech.startPlayerId) {
    const dir = daySpeech.direction === 'counterclockwise' ? '逆时针' : '顺时针';
    return `系统随机由${daySpeech.startPlayerId}号玩家开始${dir}发言`;
  }
  return '';
}

function buildWerewolfRuleIntro(modeConfig: Record<string, unknown> = {}): string {
  // const description = String(modeConfig.description);
  // if (description) return `${description}`;
  return '游戏准备中...';
}

export {
  WEREWOLF_NIGHT_PROMPTS,
  WEREWOLF_NIGHT_PROMPT_KEYS,
  getWerewolfNightPrompt,
  buildNightPublicMessage,
  buildDayStartMessage,
  buildSheriffStartMessage,
  buildSheriffResultMessage,
  ACTION_LABELS,
  buildWerewolfRuleIntro,
  phaseStartedMessage,
  actionRequestedMessage,
  actionResolvedMessage,
  actionSkippedMessage,
  effectResolvedMessage,
  phaseStartMessage,
  phaseResultMessage,
  phaseEndMessage,
  buildDaySpeechOrderAnnouncement,
};
