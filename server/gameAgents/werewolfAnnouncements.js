const WEREWOLF_NIGHT_PROMPTS = {
  wolfWake: '狼人请睁眼，请选择今晚的目标',
  seerWake: '预言家请睁眼，请选择今晚查验的目标',
  guardWake: '守卫请睁眼，请选择守护的目标',
  witchAntidote: '女巫请睁眼。你有一瓶解药，今晚它死了，你要救吗？',
  witchPoison: '你有一瓶毒药，你要用吗？'
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
  const parts = [];

  const deaths = Array.isArray(round.night?.deaths) ? round.night.deaths : [];
  if (!deaths.length) {
    parts.push(`昨晚是平安夜`);
  } else {
    parts.push(`昨晚${deaths.map((item) => `${item.id}号`).join('、')}死亡`);
  }
  return parts.join('');
}

function buildDayStartMessage() {
  return '天亮了';
}

function buildSheriffStartMessage(round = {}) {
  const candidates = round.sheriffElection?.candidates || [];
  if (!candidates.length) return '本局暂无玩家上警';
  return `${candidates.map((id) => `${id}号`).join('、')}竞选警长`;
}

function buildSheriffResultMessage(round = {}, modeConfig = {}) {
  if (!round.sheriffId) return '警长竞选结束，本局无警长';
  return `${round.sheriffId}号当选警长`;
}

function formatVoteWeight(value) {
  return Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, '').replace(/\.$/, '');
}

module.exports = {
  WEREWOLF_NIGHT_PROMPTS,
  getWerewolfNightPrompt,
  buildNightPublicMessage,
  buildDayStartMessage,
  buildSheriffStartMessage,
  buildSheriffResultMessage
};
