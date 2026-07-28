export const NATURAL_ACTION_SPEECH_TYPES = [
  'fortune_teller_mark',
  'big_bad_wolf_kill',
  'ghost_bride_link',
  'ghost_bride_kill',
  'demon_hunter_hunt',
  'spirit_wolf_learn',
  'spirit_wolf_guard',
  'spirit_wolf_antidote',
  'wolf_witch_curse',
  'illusionist_illusion',
  'crow_curse',
  'black_merchant_gift',
  'lucky_seer_check',
  'lucky_witch_poison',
  'younger_brother_kill',
  'penguin_freeze',
  'fox_inspect',
  'seer_check',
  'witch_save',
  'witch_poison',
  'guard_protect',
  'butterfly_hug',
  'stalker_assassinate',
  'wolf_beauty_charm',
  'nightmare_fear',
  'dreamer_dream',
  'magician_swap',
  'elder_silence',
];

export const RESULT_DEPENDENT_ACTION_SPEECH_TYPES = [
  'seer_check',
  'lucky_seer_check',
  'fox_inspect',
  'black_merchant_gift',
];

const naturalActionSpeechTypeSet = new Set<string>(NATURAL_ACTION_SPEECH_TYPES);
const resultDependentActionSpeechTypeSet = new Set<string>(RESULT_DEPENDENT_ACTION_SPEECH_TYPES);

export interface ActionSpeechPromptInput {
  actionType: string;
  actorLabel: string;
  actionSummary: string;
  decisionReason?: string | null;
  resolvedFact?: string | null;
}

export function isNaturalActionSpeechType(actionType: string): boolean {
  return naturalActionSpeechTypeSet.has(actionType);
}

export function isResultDependentActionSpeechType(actionType: string): boolean {
  return resultDependentActionSpeechTypeSet.has(actionType);
}

export function isEffectiveActionPayload(payload: Record<string, unknown>): boolean {
  if (payload.use === false) return false;
  if (payload.use === true) return true;
  return [
    'target', 'targetSeat', 'targetId',
    'firstTarget', 'firstTargetSeat', 'targetA',
    'secondTarget', 'secondTargetSeat', 'targetB',
    'partnerId', 'groomId', 'witnessId',
  ].some((key) => payload[key] != null);
}

export function normalizeActionSpeechForPayload(
  actionType: string,
  payload: Record<string, unknown>,
  speech: unknown,
): string {
  const normalized = String(speech || '').trim().slice(0, 80);
  if (!normalized || !isNaturalActionSpeechType(actionType)) return normalized;
  return actionSpeechTargetIds(actionType, payload)
    .every((id) => new RegExp(`(?:^|\\D)${id}号`).test(normalized))
    ? normalized
    : '';
}

function actionSpeechTargetIds(actionType: string, payload: Record<string, unknown>): number[] {
  const primary = actionType === 'magician_swap'
    ? payload.target ?? payload.firstTarget ?? payload.targetA ?? payload.targetSeat ?? payload.firstTargetSeat
    : actionType === 'ghost_bride_link'
      ? payload.target ?? payload.partnerId ?? payload.groomId ?? payload.targetSeat
      : payload.target ?? payload.targetSeat ?? payload.targetId;
  const secondary = actionType === 'magician_swap'
    ? payload.secondTarget ?? payload.targetB ?? payload.secondTargetSeat
    : actionType === 'ghost_bride_link'
      ? payload.witnessId ?? payload.secondTarget ?? payload.secondTargetSeat
      : null;
  return [...new Set([primary, secondary]
    .map(Number)
    .filter((id) => Number.isInteger(id) && id > 0))];
}

export function actionSpeechContract(actionType: string): string {
  if (!isNaturalActionSpeechType(actionType)) return '';
  return '外层仍必须按既有结构化响应输出 JSON；reason 字段必须以第一人称写成一句完整的中文台词，包含行动或目标和理由；reason 文本不得使用 Markdown、系统旁白或 JSON 内容，不得修改目标或结果。';
}

export function buildActionSpeechPrompt(input: ActionSpeechPromptInput): string {
  return [
    `你是${input.actorLabel}。`,
    `本次行动：${input.actionSummary}。`,
    input.decisionReason ? `已有决策理由：${input.decisionReason}` : '',
    input.resolvedFact ? `服务端事实：${input.resolvedFact}` : '',
    '请只输出一句自然的第一人称中文台词，必须包含行动或目标和理由。',
    '不要 Markdown、系统说明或 JSON；不得修改目标或结果。',
  ].filter(Boolean).join('\n');
}

export function resolveActionSpeech(existing: unknown, generated: unknown, fallback: string): string {
  return [generated, existing, fallback]
    .map((value) => String(value || '').trim().slice(0, 80))
    .find(Boolean) || '';
}
