const WEREWOLF_NIGHT_PROMPTS: Record<string, string> = {
  wolfWake: '狼人请睁眼',
  seerWake: '预言家请睁眼。请选择要查验的玩家。',
  guardWake: '守卫请睁眼。请选择要守护的玩家。',
  witchAntidote: '女巫请睁眼。今晚它倒牌，你要救吗？',
  witchPoison: '你有一瓶毒药，你要用吗？'
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

function buildNightPublicMessage(round: RoundWithNight = {}): string {
  const deaths = Array.isArray(round.night?.deaths) ? round.night.deaths : [];
  if (!deaths.length) return '昨晚是平安夜。';
  return `昨晚${deaths.map((item) => `${item.id}号`).join('、')}死亡。`;
}

function buildDayStartMessage(): string {
  return '天亮了。';
}

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

function buildSheriffResultMessage(round: RoundWithSheriff = {}, _modeConfig: Record<string, unknown> = {}): string {
  if (!round.sheriffId) return '警长竞选结束，本局没有警长。';
  return `${round.sheriffId}号当选警长。`;
}

export {
  WEREWOLF_NIGHT_PROMPTS,
  getWerewolfNightPrompt,
  buildNightPublicMessage,
  buildDayStartMessage,
  buildSheriffStartMessage,
  buildSheriffResultMessage
};
