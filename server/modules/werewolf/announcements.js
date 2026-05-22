const WEREWOLF_NIGHT_PROMPTS = {
  wolfWake: '狼人请睁眼。请选择今晚要击杀的玩家',
  seerWake: '预言家请睁眼。请选择你要查验的玩家',
  guardWake: '守卫请睁眼。请选择要守护的玩家。守卫请闭眼',
  witchAntidote: '女巫请睁眼。今晚它死了。你要使用解药吗？',
  witchPoison: '你要使用毒药吗？女巫请闭眼'
};

const WEREWOLF_NIGHT_PROMPT_KEYS = {
  'wolf-wake': 'wolfWake',
  'seer-wake': 'seerWake',
  'guard-wake': 'guardWake',
  'witch-antidote': 'witchAntidote',
  'witch-poison': 'witchPoison'
};

function getWerewolfNightPrompt(type) {
  return WEREWOLF_NIGHT_PROMPTS[WEREWOLF_NIGHT_PROMPT_KEYS[type]] || '';
}

function buildNightPublicMessage(round = {}) {
  const deaths = Array.isArray(round.night?.deaths) ? round.night.deaths : [];
  if (!deaths.length) return '昨晚是平安夜';
  return `昨晚${deaths.map((item) => `${item.id}号`).join('、')}死亡`;
}

function buildDayStartMessage() {
  return '天亮了';
}

function buildSheriffStartMessage(round = {}) {
  const candidates = round.sheriffElection?.candidates || [];
  if (!candidates.length) return '现在进入警长竞选。想上警的玩家请举手。';
  return '现在进入警长竞选。想上警的玩家请举手。上警玩家依次发言。';
}

function buildSheriffResultMessage(round = {}, modeConfig = {}) {
  if (!round.sheriffId) return '警长竞选结束，本局无警长';
  return `${round.sheriffId}号当选警长`;
}

module.exports = {
  WEREWOLF_NIGHT_PROMPTS,
  getWerewolfNightPrompt,
  buildNightPublicMessage,
  buildDayStartMessage,
  buildSheriffStartMessage,
  buildSheriffResultMessage
};
