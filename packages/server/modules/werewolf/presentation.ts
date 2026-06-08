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
]);

const PHASE_ACTION_TYPES = new Set([
  'seer_check',
  'guard_protect',
  'witch_save',
  'witch_poison',
]);

function resolveWerewolfPresentation(input: PresentationInput = {}): WerewolfPresentation {
  const workflowEvent = String(input.workflowEvent || '');
  const actionType = String(input.actionType || inferActionType(input.stepId) || '');
  const eventType = String(input.eventType || '');
  const message = String(input.message || '');
  const speechText = String(input.speechText || '');

  if (eventType === 'witch-action' && actionType === 'witch_poison' && input.actionUsed === false) {
    return silent('女巫没有使用毒药', 'status', 'witch-poison-result', false);
  }
  if (eventType === 'speech' || actionType === 'day_speech') {
    return speak(speechText || message, '玩家发言', 'speech', 'player-speech');
  }
  if (eventType === 'wolf-speech' || (actionType === 'wolf_speech' && speechText)) {
    return speak(speechText || message, '狼队夜聊', 'speech', 'wolf-speech');
  }
  if (workflowEvent === 'werewolf_action_submitted' && actionType === 'wolf_speech') {
    return silent(actionDisplayText('wolf_speech', '已完成'), 'badge', 'wolf-speech');
  }
  if (eventType === 'self-destruct' || workflowEvent === 'werewolf_self_destruct') {
    return speak(speechText || message || '狼人自爆。', '狼人自爆', 'speech', 'self-destruct');
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
    'sheriff_runoff_speech', 'sheriff_runoff_vote'
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
    seer_check: '预言家查验',
    guard_protect: '守卫守护',
    witch_save: '女巫解药',
    witch_poison: '女巫毒药'
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
