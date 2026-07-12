interface WerewolfPresentation {
  speakableText: string;
  displayText: string;
  displayMode: string;
  uiHint: string;
  suppressSpeech: boolean;
  requiresAck?: boolean;
}

interface PresentationInput {
  workflowEvent?: string;
  eventType?: string;
  actionType?: string;
  stepId?: string;
  phase?: string;
  message?: string;
  speechText?: string;
  actionUsed?: boolean;
}

const SILENT_ACTIONS = new Set([
  'wolf_vote',
  'escape_hunter_vote',
  'mvp_vote',
]);

const PHASE_ACTION_TYPES = new Set([
  'escape_hunter_speech',
  'escape_hunter_vote',
  'seer_check',
  'guard_protect',
  'witch_save',
  'witch_poison',
  'hybrid_choose_master',
  'elder_silence',
  'knight_duel',
  'butterfly_hug',
  'stalker_assassinate',
  'wolf_beauty_charm',
  'demon_inspect',
  'nightmare_fear',
  'dreamer_dream',
  'magician_swap',
  'fortune_teller_mark',
  'big_bad_wolf_kill',
  'crow_curse',
  'bear_tamer_roar',
  'wolf_seed_infect',
  'heavenly_eye_check',
  'requester_pray',
  'requester_kill',
  'thief_choose',
  'cupid_link',
  'succubus_link',
  'ghost_bride_link',
  'ghost_bride_chat',
  'ghost_bride_kill',
  'demon_hunter_hunt',
  'spirit_wolf_learn',
  'spirit_wolf_inspect',
  'spirit_wolf_guard',
  'spirit_wolf_antidote',
  'wolf_witch_curse',
  'illusionist_illusion',
]);

function resolveWerewolfPresentation(input: PresentationInput = {}): WerewolfPresentation {
  const workflowEvent = String(input.workflowEvent || '');
  const actionType = String(input.actionType || inferActionType(input.stepId) || '');
  const eventType = String(input.eventType || '');
  const message = String(input.message || '');
  const speechText = String(input.speechText || '');

  if (eventType === 'mvp-vote') {
    return silent(message, 'badge', 'mvp-vote', false);
  }
  if (eventType === 'mvp-start') {
    return speak(message, message, 'status', 'mvp-start');
  }
  if (eventType === 'mvp-result') {
    return speak(message, message, 'status', 'mvp-result');
  }
  if (eventType === 'speech' && actionType === 'postgame_speech') {
    return speak(speechText || message, '赛后感言', 'speech', 'postgame-speech');
  }

  if (eventType === 'witch-action' && actionType === 'witch_poison' && input.actionUsed === false) {
    return silent('女巫没有使用毒药', 'status', 'witch-poison-result', false);
  }
  // phase-end：白天环节结束不语音播报（发言结束/投票结束）—— 必须在 speech 之前检查
  if (eventType === 'phase-end' && (actionType === 'day_speech' || actionType === 'day_vote')) {
    return silent(message || actionDisplayText(actionType, '结束'), 'status', `${actionType}-end`);
  }
  if (eventType === 'speech' || actionType === 'day_speech') {
    return speak(speechText || message, '玩家发言', 'speech', 'player-speech');
  }
  if (eventType === 'wolf-speech' || (actionType === 'wolf_speech' && speechText)) {
    return speak(speechText || message, '狼队夜聊', 'speech', 'wolf-speech');
  }
  if (eventType === 'escape-hunter-speech' || (actionType === 'escape_hunter_speech' && speechText)) {
    return speak(speechText || message, '猎人夜聊', 'speech', 'escape-hunter-speech');
  }
  if (eventType === 'escape-hunter-vote') {
    return silent(message || '猎人投票完成', 'badge', 'escape-hunter-vote');
  }
  if (eventType === 'thick-wolf-armor') {
    return speak(message || '厚皮狼抵挡了本次猎杀。', message || '厚皮狼护甲破裂', 'status', 'thick-wolf-armor');
  }
  if (workflowEvent === 'werewolf_action_submitted' && actionType === 'wolf_speech') {
    return silent(actionDisplayText('wolf_speech', '已完成'), 'badge', 'wolf-speech');
  }
  if (eventType === 'self-destruct' || workflowEvent === 'werewolf_self_destruct') {
    return speak(speechText || message || '狼人自爆。', '狼人自爆', 'speech', 'self-destruct');
  }
  // wolf-vote 结果事件静默（仅展示刀口数据，不播报"夜间刀口完成"）
  if (eventType === 'wolf-vote') {
    return silent(message || '狼队投票完成', 'badge', 'wolf-vote-result');
  }

  if (eventType === 'last-words' || eventType === 'exile-words') {
    return speak(speechText || message, '玩家遗言', 'speech', 'last-words');
  }

  if (isNightStart(input.stepId, message)) return speak('天黑请闭眼', '天黑请闭眼', 'status', 'night-start');
  if (isDayStart(input.stepId, message)) return speak('天亮了', '天亮了', 'status', 'day-start');

  if (workflowEvent === 'werewolf_action_requested' && actionType === 'wolf_vote') {
    return silent('狼队投票中', 'badge', 'wolf-vote');
  }
  if (workflowEvent === 'werewolf_action_submitted' && actionType === 'wolf_vote') {
    return speak('狼人请闭眼', '狼人请闭眼', 'status', 'wolf-close-eyes');
  }
  if (workflowEvent === 'werewolf_action_requested' && SILENT_ACTIONS.has(actionType)) {
    return silent(actionDisplayText(actionType, '行动中'), 'badge', actionType);
  }
  if (workflowEvent === 'werewolf_action_requested' && PHASE_ACTION_TYPES.has(actionType)) {
    return silent(actionDisplayText(actionType, '行动中'), 'badge', actionType);
  }
  if (workflowEvent === 'werewolf_action_submitted' && PHASE_ACTION_TYPES.has(actionType)) {
    return silent(actionDisplayText(actionType, '已完成'), 'badge', actionType);
  }
  if (workflowEvent === 'werewolf_action_skipped' && PHASE_ACTION_TYPES.has(actionType)) {
    return silent(actionDisplayText(actionType, '已跳过'), 'badge', actionType);
  }
  if (workflowEvent === 'werewolf_action_submitted' && SILENT_ACTIONS.has(actionType)) {
    return silent(actionDisplayText(actionType, '已完成'), 'badge', actionType);
  }
  if (workflowEvent === 'werewolf_action_skipped' && SILENT_ACTIONS.has(actionType)) {
    return silent(actionDisplayText(actionType, '已跳过'), 'badge', actionType);
  }

  // 夜间角色行动阶段事件
  if (workflowEvent === 'werewolf_phase_start' && PHASE_ACTION_TYPES.has(actionType)) {
    return speak(message, message, 'status', `${actionType}-start`);
  }
  if (workflowEvent === 'werewolf_phase_action' && PHASE_ACTION_TYPES.has(actionType)) {
    return silent(message, 'badge', actionType);
  }
  if (workflowEvent === 'werewolf_phase_result' && PHASE_ACTION_TYPES.has(actionType)) {
    return speak(message, message, 'status', `${actionType}-result`);
  }
  if (workflowEvent === 'werewolf_phase_end' && PHASE_ACTION_TYPES.has(actionType)) {
    return speak(message, message, 'status', `${actionType}-end`);
  }

  if (workflowEvent === 'werewolf_effect_resolved') {
    // 猎人开枪：生成公开旁白和展示文本
    if (actionType === 'hunter_shot' && message) {
      return speak(message, message, 'status', 'hunter-shot');
    }
    return silent(publicResolveText(input.stepId, message), 'status', 'effect-resolved');
  }

  return message ? speak(message, message, 'status', 'workflow') : silent('', 'silent', 'workflow');
}

function speak(speakableText: string, displayText: string, displayMode: string, uiHint: string): WerewolfPresentation {
  return {
    speakableText,
    displayText,
    displayMode,
    uiHint,
    suppressSpeech: !speakableText
  };
}

function silent(
  displayText: string,
  displayMode: string,
  uiHint: string,
  requiresAck: boolean = true,
): WerewolfPresentation {
  return {
    speakableText: '',
    displayText,
    displayMode,
    uiHint,
    suppressSpeech: true,
    requiresAck,
  };
}

function inferActionType(stepId?: string): string {
  const id = String(stepId || '');
  if (!id) return '';
  const known = [
    'wolf_speech', 'wolf_vote', 'seer_check', 'guard_protect', 'witch_save',
    'witch_poison', 'day_speech', 'day_vote', 'sheriff_signup',
    'sheriff_speech', 'sheriff_withdraw', 'sheriff_vote',
    'sheriff_runoff_speech', 'sheriff_runoff_vote', 'hybrid_choose_master',
    'elder_silence', 'knight_duel', 'butterfly_hug', 'stalker_assassinate',
    'wolf_beauty_charm', 'demon_inspect', 'nightmare_fear', 'dreamer_dream', 'magician_swap',
    'fortune_teller_mark', 'big_bad_wolf_kill', 'crow_curse', 'bear_tamer_roar',
    'wolf_seed_infect', 'heavenly_eye_check', 'requester_pray', 'requester_kill',
    'thief_choose', 'cupid_link', 'succubus_link', 'ghost_bride_link', 'ghost_bride_chat', 'ghost_bride_kill',
    'demon_hunter_hunt', 'spirit_wolf_learn', 'spirit_wolf_inspect', 'spirit_wolf_guard', 'spirit_wolf_antidote',
    'wolf_witch_curse', 'illusionist_illusion',
    'mvp_vote', 'postgame_speech'
  ];
  return known.find((action) => id.startsWith(action)) || '';
}

function isNightStart(stepId?: string, message?: string): boolean {
  return String(stepId || '').startsWith('night_start') || /天黑请闭眼/.test(String(message || ''));
}

function isDayStart(stepId?: string, message?: string): boolean {
  return String(stepId || '').startsWith('day_start') || /天亮了/.test(String(message || ''));
}

function actionDisplayText(actionType: string, suffix: string): string {
  const labels: Record<string, string> = {
    wolf_speech: '狼队战术部署',
    wolf_vote: '狼队投票',
    escape_hunter_speech: '猎人夜聊',
    escape_hunter_vote: '猎人共同投票',
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
    dreamer_dream: '摄梦人摄梦',
    magician_swap: '魔术师换牌',
    fortune_teller_mark: '占卜师标记',
    big_bad_wolf_kill: '大灰狼击杀',
    crow_curse: '乌鸦诅咒',
    bear_tamer_roar: '驯熊师咆哮',
    wolf_seed_infect: '种狼感染',
    heavenly_eye_check: '天眼查验',
    requester_pray: '祈求者祈求',
    requester_kill: '祈求者独刀',
    thief_choose: '盗贼换牌',
    cupid_link: '丘比特连人',
    succubus_link: '魅魔连人',
    ghost_bride_link: '鬼魂新娘牵绊',
    ghost_bride_chat: '鬼魂新娘夜聊',
    ghost_bride_kill: '鬼魂新娘击杀',
    demon_hunter_hunt: '猎魔人狩猎',
    spirit_wolf_learn: '灵狼学习',
    spirit_wolf_inspect: '灵狼查验',
    spirit_wolf_guard: '灵狼庇护',
    spirit_wolf_antidote: '灵狼解药',
    wolf_witch_curse: '狼巫诅咒',
    illusionist_illusion: '幻术师幻象',
    mvp_vote: 'MVP投票',
    postgame_speech: '赛后感言',
  };
  return `${labels[actionType] || '夜间行动'}${suffix}`;
}

function publicResolveText(stepId?: string, fallback: string = ''): string {
  const id = String(stepId || '');
  if (id.startsWith('night_resolve')) return '夜晚结算';
  if (id.startsWith('exile_resolve')) return '放逐结算';
  return fallback;
}

export {
  resolveWerewolfPresentation
};

export type {
  WerewolfPresentation,
  PresentationInput
};
