/**
 * 统一游戏事件模型
 * 用于实时模式和回放模式的事件标准化
 */

import type { ChannelType } from './channelTypes';

// ============================================================
// 事件类型枚举
// ============================================================

export type GameEventType =
  // 阶段事件
  | 'phase-start'
  | 'phase-end'
  | 'phase-changed'

  // 行动事件
  | 'action-requested'
  | 'action-submitted'
  | 'action-skipped'

  // 发言事件
  | 'speech'
  | 'wolf-speech'
  | 'self-destruct'

  // Skill 事件
  | 'skill-requested'
  | 'skill-thinking'
  | 'skill-executing'
  | 'skill-completed'
  | 'skill-failed'
  | 'skill-applied'

  // 夜晚事件
  | 'wolf-wake'
  | 'wolf-leader'
  | 'wolf-vote'
  | 'seer-wake'
  | 'seer-check'
  | 'guard-wake'
  | 'guard-action'
  | 'witch-antidote'
  | 'witch-poison'
  | 'witch-action'
  | 'night-result'

  // 白天事件
  | 'day-start'
  | 'speech-order'
  | 'vote-result'

  // 警长事件
  | 'sheriff-start'
  | 'sheriff-speech'
  | 'sheriff-candidates'
  | 'sheriff-vote'
  | 'sheriff-runoff-speech'
  | 'sheriff-runoff-vote'
  | 'sheriff-result'
  | 'sheriff-badge-transfer'
  | 'sheriff-badge-tear'

  // 死亡事件
  | 'last-words'
  | 'exile-words'
  | 'death-announced'

  // 效果事件
  | 'effect-applied'
  | 'effect-resolved'

  // 游戏事件
  | 'game-start'
  | 'game-end'
  | 'match-completed'
  | 'workflow-completed'
  | 'error';

// ============================================================
// 游戏状态快照
// ============================================================

export interface SerializedGameState {
  id: string;
  gameType: string;
  type: string;
  mode: string;
  event?: {
    id: string;
    name: string;
    version: string;
    background: string;
    mode: string;
    terms: Record<string, string>;
    truth: string;
  };
  debugMode: boolean;
  clientViewMode: string;
  host: Record<string, unknown>;
  werewolfMode: Record<string, unknown>;
  players: SerializedPlayer[];
  rounds: SerializedRound[];
  winner: string | null;
  winReason: string;
  fallbackAudit: unknown[];
  currentActionWindow: Record<string, unknown> | null;
  createdAt: string;
}

export interface SerializedPlayer {
  id: number;
  name: string;
  nickname: string;
  role: string;
  roleLabel: string;
  faction: string;
  alive: boolean;
  deathDay: number | null;
  deathReason: string;
  lastWords: string;
  canVote: boolean;
  revealedIdiot: boolean;
  usedAntidote: boolean;
  usedPoison: boolean;
  lastGuardTarget: number | null;
  hunterShotUsed: boolean;
  seerChecks: unknown[];
  votes: unknown[];
  avatar?: string;
  avatarUrl?: string;
  voicePackageId?: number | null;
  personality?: string;
  sex?: string;
}

export interface SerializedRound {
  day: number;
  phase: string;
  night: SerializedNight;
  speeches: unknown[];
  votes: Record<string, unknown>;
  voteTally: Record<string, number>;
  exile: Record<string, unknown> | null;
  idiotReveal: Record<string, unknown> | null;
  hunterShot: Record<string, unknown> | null;
  sheriffId: number | null;
  sheriffBadge: Record<string, unknown>;
  sheriffElection: Record<string, unknown> | null;
  sheriffTransfers: unknown[];
  daySpeech: Record<string, unknown> | null;
  lastWords: unknown[];
  testimonies: unknown[];
  selfDestruct: Record<string, unknown> | null;
}

export interface SerializedNight {
  wolfTarget: number | null;
  wolfLeaderId: number | null;
  wolfSpeechOrder: number[];
  wolfSpeeches: unknown[];
  wolfChoices: Record<string, unknown>;
  wolfVoteTally: Record<string, number>;
  wolfTieBreak: Record<string, unknown> | null;
  seerCheck: Record<string, unknown> | null;
  witchSave: boolean;
  witchSaveTarget: number | null;
  witchPoisonTarget: number | null;
  guardTarget: number | null;
  deaths: Array<{ id: number; reason: string }>;
}

// ============================================================
// 播报信息
// ============================================================

export interface Presentation {
  speakableText: string;
  displayText: string;
  displayMode: 'speech' | 'status' | 'badge' | 'silent';
  uiHint: string;
  suppressSpeech: boolean;
}

export interface AudienceCue {
  kind: string;
  display: 'modal' | 'none';
  speech: 'browser' | 'none';
  textField?: 'text' | 'message' | 'narration';
  once?: boolean;
}

// ============================================================
// 事件元数据
// ============================================================

export interface EventMetadata {
  matchId: string;
  stepId: string;
  phase: 'night' | 'day';
  day: number;
  timestamp: string;
  sequence: number;
}

// ============================================================
// 核心 GameEvent 接口
// ============================================================

export interface GameEvent<T = unknown> {
  // 事件标识
  id: string;
  type: GameEventType;

  // 频道路由
  channel: ChannelType;
  scopeKey?: string;

  // 事件数据
  payload: T;

  // 元数据
  metadata: EventMetadata;

  // 播报信息
  presentation: Presentation;

  // C 端观众提示
  audienceCue?: AudienceCue;

  // 游戏快照（可选，用于回放）
  game?: SerializedGameState;

  // ACK 机制
  ackId?: string;
}

// ============================================================
// 特定事件载荷类型
// ============================================================

export interface PhaseStartPayload {
  phase: 'night' | 'day';
  message: string;
}

export interface ActionRequestedPayload {
  actionType: string;
  actorIds: number[];
  targetIds?: number[];
  optional?: boolean;
  ordered?: boolean;
  actionWindow?: Record<string, unknown>;
}

export interface ActionSubmittedPayload {
  actionType: string;
  actorId: number;
  targetId?: number;
  speech?: {
    playerId: number;
    text: string;
    thinking?: string;
    fullText?: string;
  };
  result?: unknown;
}

export interface SpeechPayload {
  playerId: number;
  text: string;
  thinking?: string;
  fullText?: string;
  side?: string;
  speakerLabel?: string;
}

export interface WolfSpeechPayload extends SpeechPayload {
  isLeader?: boolean;
  sharedSpeeches?: unknown[];
}

export interface SelfDestructPayload {
  playerId: number;
  text: string;
  speech?: {
    playerId: number;
    text: string;
    fullText?: string;
  };
}

export interface SkillRequestedPayload {
  skillId: string;
  actorId: number;
  context: Record<string, unknown>;
}

export interface SkillThinkingPayload {
  skillId: string;
  actorId: number;
  thinking: string;
}

export interface SkillCompletedPayload {
  skillId: string;
  actorId: number;
  result: unknown;
  duration?: number;
}

export interface NightResultPayload {
  deaths: Array<{ id: number; reason: string }>;
  message: string;
}

export interface VoteResultPayload {
  votes: Record<string, number>;
  tally: Record<string, number>;
  exile: { id: number; reason?: string } | null;
  message: string;
}

export interface SheriffEventPayload {
  election?: Record<string, unknown>;
  speech?: unknown;
  candidates?: number[];
  message?: string;
  transfer?: Record<string, unknown>;
}

export interface ErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

// ============================================================
// 辅助类型
// ============================================================

export type TypedGameEvent =
  | GameEvent<PhaseStartPayload>
  | GameEvent<ActionRequestedPayload>
  | GameEvent<ActionSubmittedPayload>
  | GameEvent<SpeechPayload>
  | GameEvent<WolfSpeechPayload>
  | GameEvent<SelfDestructPayload>
  | GameEvent<SkillRequestedPayload>
  | GameEvent<SkillThinkingPayload>
  | GameEvent<SkillCompletedPayload>
  | GameEvent<NightResultPayload>
  | GameEvent<VoteResultPayload>
  | GameEvent<SheriffEventPayload>
  | GameEvent<ErrorPayload>
  | GameEvent<Record<string, unknown>>;

// 事件处理器类型
export type EventHandler = (event: GameEvent) => void | Promise<void>;

// 事件过滤器类型
export type EventFilter = (event: GameEvent) => boolean;
