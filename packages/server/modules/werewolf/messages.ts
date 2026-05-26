const ACTION_LABELS: Record<string, string> = {
  wolf_kill: '狼人袭击',
  seer_check: '预言家查验',
  guard_protect: '守卫守护',
  witch_save: '女巫解药',
  witch_poison: '女巫毒药',
  day_speech: '白天发言',
  day_vote: '白天投票',
  hunter_shot: '猎人开枪'
};

function phaseStartedMessage(phase: string | undefined, day: number | undefined): string {
  if (phase === 'night') return `第${day || 1}夜开始，天黑请闭眼。`;
  if (phase === 'day') return `第${day || 1}天开始，天亮了。`;
  return '流程进入下一阶段。';
}

function actionRequestedMessage(actionType?: string, day?: number): string {
  return `${roundPrefix(day)}${actionLabel(actionType)}行动开始。`;
}

function actionResolvedMessage(actionType?: string, day?: number): string {
  return `${roundPrefix(day)}${actionLabel(actionType)}行动已完成。`;
}

function actionSkippedMessage(actionType?: string, day?: number): string {
  return `${roundPrefix(day)}${actionLabel(actionType)}无人可行动，已跳过。`;
}

function effectResolvedMessage(phase?: string, day?: number): string {
  if (phase === 'night') return `第${day || 1}夜行动结算完成。`;
  if (phase === 'day') return `第${day || 1}天放逐结算完成。`;
  return `${roundPrefix(day)}效果结算完成。`;
}

function actionLabel(actionType?: string): string {
  return ACTION_LABELS[actionType || ''] || '当前';
}

function roundPrefix(day?: number): string {
  return day ? `第${day}天 ` : '';
}

export {
  phaseStartedMessage,
  actionRequestedMessage,
  actionResolvedMessage,
  actionSkippedMessage,
  effectResolvedMessage
};
