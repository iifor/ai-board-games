const NATURAL_ACTION_SPEECH_TYPES = new Set([
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
]);

const RESULT_DEPENDENT_ACTION_SPEECH_TYPES = new Set([
  'seer_check',
  'lucky_seer_check',
  'fox_inspect',
  'black_merchant_gift',
]);

export interface ActionSpeechPromptInput {
  actionType: string;
  actorLabel: string;
  actionSummary: string;
  decisionReason?: string | null;
  resolvedFact?: string | null;
}

export function isNaturalActionSpeechType(actionType: string): boolean {
  return NATURAL_ACTION_SPEECH_TYPES.has(actionType);
}

export function isResultDependentActionSpeechType(actionType: string): boolean {
  return RESULT_DEPENDENT_ACTION_SPEECH_TYPES.has(actionType);
}

export function isEffectiveActionPayload(payload: Record<string, unknown>): boolean {
  if (payload.use === false) return false;
  if (payload.use === true) return true;
  return ['target', 'targetSeat', 'secondTarget'].some((key) => payload[key] != null);
}

export function actionSpeechContract(actionType: string): string {
  if (!isNaturalActionSpeechType(actionType)) return '';
  return '执行行动时，reason 必须是一句完整的第一人称中文台词，包含行动或目标和理由；不得使用 Markdown、系统说明或 JSON，不得修改目标或结果。';
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
