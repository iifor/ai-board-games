const ACTION_LABELS: Record<string, string> = {
  wolf_kill: '狼人袭击',
  wolf_speech: '狼队战术部署',
  wolf_vote: '狼人刀口投票',
  seer_check: '预言家查验',
  guard_protect: '守卫守护',
  witch_save: '女巫解药',
  witch_poison: '女巫毒药',
  day_speech: '白天发言',
  day_vote: '白天投票',
  hunter_shot: '猎人开枪',
  sheriff_signup: '警长竞选报名',
  sheriff_speech: '警上竞选发言',
  sheriff_withdraw: '警上退水',
  sheriff_vote: '警长竞选投票',
  sheriff_runoff_speech: '警长复投发言',
  sheriff_runoff_vote: '警长复投投票',
  sheriff_resolve: '警长竞选结算'
};

function phaseStartedMessage(phase: string | undefined, _day: number | undefined): string {
  if (phase === 'night') return `天黑请闭眼`;
  if (phase === 'day') return `天亮了。`;
  return '流程进入下一阶段。';
}

function actionRequestedMessage(actionType?: string, day?: number): string {
  if (actionType === 'wolf_speech') return `狼人请睁眼`;
  if (actionType === 'wolf_vote') return `狼人请投票`;
  return `${roundPrefix(day)}${actionLabel(actionType)}`;
}

function actionResolvedMessage(actionType?: string, day?: number): string {
  return `${roundPrefix(day)}${actionLabel(actionType)}`;
}

function actionSkippedMessage(actionType?: string, day?: number): string {
  return `${roundPrefix(day)}${actionLabel(actionType)}。`;
}

function effectResolvedMessage(phase?: string, day?: number): string {
  if (phase === 'night') return ``;
  if (phase === 'day') return ``;
  return `${roundPrefix(day)}`;
}

function actionLabel(actionType?: string): string {
  return ACTION_LABELS[actionType || ''] || '当前';
}

function phaseStartMessage(actionType?: string, day?: number): string {
  const messages: Record<string, string> = {
    seer_check: `预言家请睁眼，请选择查验的目标。`,
    witch_save: `女巫请睁眼。`,
    witch_poison: `你有一瓶毒药，你要用吗？`,
    guard_protect: `守卫请睁眼，请选择今晚守护的目标。`,
    wolf_speech: `狼人请睁眼`,
    wolf_vote: `狼人请统一刀口。`,
  };
  return messages[actionType || ''] || `${roundPrefix(day)}${actionLabel(actionType)}开始。`;
}

function phaseResultMessage(actionType?: string, day?: number, result?: Record<string, unknown>): string {
  if (actionType === 'seer_check') {
    const faction = result?.faction || result?.result || '未知';
    return `它的身份是${faction}。`;
  }
  if (actionType === 'witch_save') {
    return `今晚它倒下了，你要救吗？`;
  }
  if (actionType === 'witch_poison') {
    return ''; // 不播报，用药信息只在C端展示
  }
  if (actionType === 'guard_protect') {
    const target = result?.target;
    return target ? `守卫守护了${target}号。` : `守卫选择空守。`;
  }
  return `${roundPrefix(day)}${actionLabel(actionType)}完成。`;
}

function phaseEndMessage(actionType?: string, day?: number): string {
  const messages: Record<string, string> = {
    seer_check: `预言家请闭眼。`,
    witch_save: `女巫请闭眼。`,
    witch_poison: `女巫请闭眼。`,
    guard_protect: `守卫请闭眼。`,
    wolf_speech: `狼人请闭眼。`,
    wolf_vote: `狼人请闭眼。`,
  };
  return messages[actionType || ''] || `${roundPrefix(day)}${actionLabel(actionType)}结束。`;
}

function roundPrefix(day?: number): string {
  return day ? `第${day}天` : '';
}

export {
  ACTION_LABELS,
  phaseStartedMessage,
  actionRequestedMessage,
  actionResolvedMessage,
  actionSkippedMessage,
  effectResolvedMessage,
  phaseStartMessage,
  phaseResultMessage,
  phaseEndMessage
};
