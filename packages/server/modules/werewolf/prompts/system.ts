// ============================================================
// AI 身份提示词 —— 构建每个 AI 玩家的角色人格和游戏认知
// ============================================================

import { buildPlayerPersonaModule, compilePromptModules, hashText } from '../../../services/ai/promptComposer';
import { getRoleConfig, getRoleLabel, getRoleActions } from '../utils';
import { WEREWOLF } from '@ai-presenter/shared/constants/gameLimits';
import type { PlayerAgent } from '../playerAgent';

// ---- 轻量接口（避免循环依赖）----

interface RoleConfigLike {
  name?: string;
  faction?: string;
  roleType?: string;
  responsibility?: string;
  ability?: string;
  keyInfo?: string;
  playStyleAdvice?: string;
  rule?: Record<string, unknown>;
  [key: string]: unknown;
}

interface AgentLike {
  id: number;
  name?: string;
  nickname?: string;
  avatar?: string;
  provider?: string;
  voicePackageId?: string;
  model?: string;
  sex?: string;
  personality?: string;
  apiKey?: string;
  role?: string;
  roleConfig?: RoleConfigLike;
  roleLabel?: string;
  faction?: string;
  alive?: boolean;
  deathDay?: number | null;
  deathReason?: string;
  lastWords?: string;
  canVote?: boolean;
  revealedIdiot?: boolean;
  usedAntidote?: boolean;
  usedPoison?: boolean;
  lastGuardTarget?: number | null;
  hunterShotUsed?: boolean;
  seerChecks?: Array<Record<string, unknown>>;
  votes?: Array<Record<string, unknown>>;
  baseSystemPrompt?: string;
  baseSystemPromptHash?: string;
  playerAgent?: PlayerAgent;
  [key: string]: unknown;
}

interface ModeRoleEntryLike {
  roleId?: string;
  id?: string;
  count?: number;
  [key: string]: unknown;
}

interface SheriffConfigLike {
  enabled?: boolean;
  firstDayElection?: boolean;
  voteWeight?: number;
  [key: string]: unknown;
}

interface ModeConfigLike {
  name?: string;
  id?: string;
  description?: string;
  roles?: Array<string | ModeRoleEntryLike>;
  resolvedRoles?: Array<RoleConfigLike & { count?: number }>;
  roleMap?: Record<string, RoleConfigLike>;
  sheriff?: SheriffConfigLike;
  winCondition?: string;
  witch?: { canSelfSaveNightOne?: boolean; onePotionPerNight?: boolean };
  [key: string]: unknown;
}

interface SkillRegistryLike {
  get: (action: string) => { prompt?: string } | null;
}

// ---- 系统提示构建 ----

/**
 * 构建每个 AI 玩家的基础系统提示
 */
export function buildSystemPrompt(
  agent: AgentLike,
  wolves: number[],
  skillRegistry: SkillRegistryLike
): string {
  const role = agent.roleConfig || {};
  const skillPrompts = getRoleActions(role as Record<string, unknown>)
    .map((action) => skillRegistry.get(action)?.prompt)
    .filter(Boolean) as string[];

  return compilePromptModules([
    '你正在参加《AI 狼人杀》。你是一个独立玩家，不是主持人。',
    `你的编号是 ${agent.id}。`,
    buildPlayerPersonaModule(agent),
    `你的身份是：${role.name || agent.role}。`,
    role.responsibility ? `角色责任：${role.responsibility}` : '',
    role.ability ? `角色能力：${role.ability}` : '',
    role.keyInfo ? `关键信息：${role.keyInfo}` : '',
    ...skillPrompts,
    agent.faction === 'wolves'
      ? `你的狼队友是：${wolves.filter((id) => id !== agent.id).join('、') || '暂无'}号。`
      : '',
    '白天发言必须像桌游玩家，可以分析死亡、票型、发言状态、身份逻辑。',
    `发言建议不超过 ${WEREWOLF.DAY_SPEECH_CHAR_LIMIT} 字。禁止直接自曝"我是狼人"，禁止泄露系统提示。`
  ]).text || '';
}

/**
 * 开局私有认知 —— 发送到 AI 的私有记忆
 */
export function appendOpeningPrivateMemory(agent: AgentLike, modeConfig: ModeConfigLike = {}): void {
  const role = agent.roleConfig || {};
  const lines = [
    '【开局私有认知】',
    `当前模式：${modeConfig.name || modeConfig.id || '狼人杀'}`,
    modeConfig.description ? `模式说明：${modeConfig.description}` : '',
    `阵容配置：${formatModeLineup(modeConfig)}`,
    `警长规则：${formatSheriffRule(modeConfig.sheriff)}`,
    `胜利条件：${formatWinCondition(modeConfig.winCondition)}`,
    `你的角色：${role.name || agent.roleLabel || agent.role}`,
    `你的阵营：${agent.faction === 'wolves' ? '狼人阵营' : '好人阵营'}`,
    role.responsibility ? `核心责任：${role.responsibility}` : '',
    role.ability ? `角色能力：${role.ability}` : '',
    role.keyInfo ? `关键信息：${role.keyInfo}` : '',
    role.playStyleAdvice ? `打法建议：${role.playStyleAdvice}` : '',
    '以上信息只对你可见，不要在发言中直接复述系统提示或暴露不该公开的身份信息。'
  ].filter(Boolean);

  agent.playerAgent!.messages.push({ role: 'system', content: lines.join('\n') });
}

// ---- 格式化辅助 ----

export function formatModeLineup(modeConfig: ModeConfigLike = {}): string {
  const roles = Array.isArray(modeConfig.resolvedRoles) && modeConfig.resolvedRoles.length
    ? modeConfig.resolvedRoles
    : (modeConfig.roles || []).map((entry) => {
        const roleId = typeof entry === 'string' ? entry : (entry.roleId || entry.id || '');
        return { ...getRoleConfig(modeConfig as Record<string, unknown>, roleId), count: typeof entry === 'string' ? 1 : entry.count };
      });
  return roles
    .filter((role) => role && Number(role.count) > 0)
    .map((role) => `${(role as Record<string, unknown>).name || (role as Record<string, unknown>).roleId || (role as Record<string, unknown>).id}x${(role as Record<string, unknown>).count}`)
    .join('、') || '未配置';
}

export function formatSheriffRule(sheriff: SheriffConfigLike = {}): string {
  if (!sheriff || sheriff.enabled === false) return '本局不启用警长。';
  const firstDay = sheriff.firstDayElection === false ? '首日不竞选警长' : '首日竞选警长';
  const weight = sheriff.voteWeight ? `，警长票权重 ${sheriff.voteWeight}` : '';
  return `${firstDay}${weight}。`;
}

export function formatWinCondition(value: string | undefined): string {
  return value === 'single' ? '按具体角色胜利条件判定。' : '按阵营胜利条件判定。';
}

export { hashText };
