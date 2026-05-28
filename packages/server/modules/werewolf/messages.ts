const ACTION_LABELS: Record<string, string> = {
  wolf_kill: '狼人袭击',
  wolf_speech: '狼人夜聊',
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

function phaseStartedMessage(phase: string | undefined, day: number | undefined): string {
  if (phase === 'night') return `天黑请闭眼`;
  if (phase === 'day') return `天亮了。`;
  return '流程进入下一阶段。';
}

function actionRequestedMessage(actionType?: string, day?: number): string {
  if (actionType === 'wolf_speech') return `狼人请睁眼`;
  if (actionType === 'wolf_vote') return `狼人请投票`;
  return `${roundPrefix(day)}${actionLabel(actionType)}行动开始。`;
}

function actionResolvedMessage(actionType?: string, day?: number): string {
  return `${roundPrefix(day)}${actionLabel(actionType)}行动已完成。`;
}

function actionSkippedMessage(actionType?: string, day?: number): string {
  return `${roundPrefix(day)}${actionLabel(actionType)}无人可行动，已跳过。`;
}

function effectResolvedMessage(phase?: string, day?: number): string {
  if (phase === 'night') return ``;
  if (phase === 'day') return ``;
  return `${roundPrefix(day)}效果结算完成。`;
}

function actionLabel(actionType?: string): string {
  return ACTION_LABELS[actionType || ''] || '当前';
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
  effectResolvedMessage
};
