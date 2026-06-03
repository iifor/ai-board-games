// ============================================================
// 狼人杀提示词 —— 统一导出
// ============================================================

export {
  // 夜间睁眼
  WEREWOLF_NIGHT_PROMPTS,
  WEREWOLF_NIGHT_PROMPT_KEYS,
  getWerewolfNightPrompt,
  // 夜间/天亮播报
  buildNightPublicMessage,
  buildDayStartMessage,
  // 警长播报
  buildSheriffStartMessage,
  buildSheriffResultMessage,
  // 动作标签
  ACTION_LABELS,
  // 阶段消息
  buildWerewolfRuleIntro,
  phaseStartedMessage,
  actionRequestedMessage,
  actionResolvedMessage,
  actionSkippedMessage,
  effectResolvedMessage,
  phaseStartMessage,
  phaseResultMessage,
  phaseEndMessage,
} from './announcements';

export {
  // 技能描述
  SKILL_DESCRIPTIONS,
  // 技能行动提示
  buildKillActionPrompt,
  buildInspectFactionActionPrompt,
  buildGuardActionPrompt,
  buildSaveActionPrompt,
  buildPoisonActionPrompt,
  buildHunterShootActionPrompt,
  buildSelfDestructActionPrompt,
  // 投票/竞选提示
  buildWolfVotePrompt,
  DAY_VOTE_PROMPT,
  SHERIFF_SIGNUP_PROMPT,
  buildSheriffWithdrawPrompt,
  SHERIFF_VOTE_PROMPT,
} from './actions';

export {
  buildSystemPrompt,
  appendOpeningPrivateMemory,
  formatModeLineup,
  formatSheriffRule,
  formatWinCondition,
  hashText,
} from './system';

export {
  askSpeech,
  askWolfNightSpeech,
  askSheriffSpeech,
} from './speech';

export {
  buildWerewolfPromptBundle,
  buildWerewolfActionPrompt,
  renderWerewolfPromptBundle,
} from './context';
