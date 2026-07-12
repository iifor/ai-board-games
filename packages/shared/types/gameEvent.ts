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
  | 'escape-hunter-speech'
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
  | 'escape-hunter-vote'
  | 'escape-hunter-hunt'
  | 'thick-wolf-armor'
  | 'seer-wake'
  | 'seer-check'
  | 'guard-wake'
  | 'guard-action'
  | 'witch-antidote'
  | 'witch-poison'
  | 'witch-action'
  | 'hybrid-master'
  | 'silence-result'
  | 'butterfly-hug'
  | 'stalker-assassinate'
  | 'wolf-beauty-charm'
  | 'demon-inspect'
  | 'nightmare-fear'
  | 'dreamer-dream'
  | 'magician-swap'
  | 'fortune-teller-mark'
  | 'big-bad-wolf-kill'
  | 'crow-curse'
  | 'black-merchant-gift'
  | 'lucky-seer-check'
  | 'lucky-witch-poison'
  | 'younger-brother-kill'
  | 'ghost-bride-link'
  | 'ghost-bride-chat'
  | 'ghost-bride-kill'
  | 'demon-hunter-hunt'
  | 'spirit-wolf-learn'
  | 'spirit-wolf-inspect'
  | 'spirit-wolf-guard'
  | 'spirit-wolf-antidote'
  | 'wolf-witch-curse'
  | 'illusionist-illusion'
  | 'penguin-freeze'
  | 'fox-inspect'
  | 'bear-tamer-roar'
  | 'night-result'

  // 白天事件
  | 'day-start'
  | 'speech-order'
  | 'vote-result'
  | 'mvp-vote'
  | 'mvp-start'
  | 'mvp-result'
  | 'knight-duel'

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
  | 'hunter-shot'
  | 'idiot-reveal'
  | 'vote-update'

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
  mvp?: SerializedPlayer | null;
  mvpVotes?: Record<string, number>;
  mvpVoteTally?: Record<string, number>;
  postgameSpeeches?: Record<string, PostgameSpeech>;
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
  lastSilencedTarget?: number | null;
  hunterShotUsed: boolean;
  hybridMasterId?: number | null;
  wildChildModelId?: number | null;
  wildChildTransformed?: boolean;
  nineTailedFoxTails?: number;
  knightDuelUsed?: boolean;
  butterflyHugUsed?: number;
  stalkerAssassinateUsed?: boolean;
  lastNightmareTarget?: number | null;
  lastPenguinTarget?: number | null;
  foxInspectLost?: boolean;
  foxLastInspect?: { targetIds: number[]; hasWolf: boolean } | null;
  magicianSwappedIds?: number[];
  fortuneTellerMarkUsed?: boolean;
  bigBadWolfKillUsed?: boolean;
  lastCrowTarget?: number | null;
  blackMerchantGiftUsed?: boolean;
  blackMerchantGift?: { action: string; from: number; used?: boolean } | null;
  blackMerchantDeathPending?: boolean;
  bigTreeWolfHits?: number;
  godSkillsDisabled?: boolean;
  youngerBrotherSoloKillUsedDay?: number | null;
  wolfElderBrotherDeathDay?: number | null;
  evilKnightTriggered?: boolean;
  oldRoguePendingDeath?: {
    reason: string;
    sourceAction: string;
    resolveDay: number;
    announced?: boolean;
  } | null;
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
  silencedPlayerId?: number | null;
  silenceReason?: string | null;
  knightDuel?: Record<string, unknown> | null;
  evilKnightTrigger?: { actorId: number; trigger: string; targetId: number } | null;
  oldRogueDeath?: { id: number; reason: string; sourceAction?: string } | null;
  bearRoar?: { roaring: boolean; adjacentWolfIds: number[] } | null;
  crowCursedPlayerId?: number | null;
  bombmanBlast?: { actorId: number; targetIds: number[] } | null;
}

export interface SerializedNight {
  wolfTarget: number | null;
  wolfLeaderId: number | null;
  wolfSpeechOrder: number[];
  wolfSpeeches: unknown[];
  wolfChoices: Record<string, unknown>;
  wolfVoteTally: Record<string, number>;
  wolfTieBreak: Record<string, unknown> | null;
  seerCheck: { target?: number | string | null; result?: string; reason?: string | null } | null;
  witchSave: boolean;
  witchSaveTarget: number | null;
  witchSaveReason?: string | null;
  witchPoisonTarget: number | null;
  witchPoisonReason?: string | null;
  guardTarget: number | null;
  guardReason?: string | null;
  butterflyTarget?: number | null;
  butterflyReason?: string | null;
  stalkerTarget?: number | null;
  stalkerReason?: string | null;
  wolfBeautyTarget?: number | null;
  wolfBeautyReason?: string | null;
  demonInspect?: { target?: number | string | null; result?: string; reason?: string | null } | null;
  nightmareTarget?: number | null;
  nightmareReason?: string | null;
  penguinFrozenId?: number | null;
  penguinReason?: string | null;
  foxInspect?: { targetIds?: Array<number | string>; hasWolf?: boolean; reason?: string | null } | null;
  dreamerTarget?: number | null;
  dreamerReason?: string | null;
  dreamerRepeatedTarget?: boolean;
  magicianSwap?: { firstTarget?: number | string | null; secondTarget?: number | string | null; reason?: string | null } | null;
  fortuneTellerMark?: { target?: number | string | null; reason?: string | null } | null;
  bigBadWolfTarget?: number | string | null;
  bigBadWolfReason?: string | null;
  crowCurse?: { target?: number | string | null; reason?: string | null } | null;
  blackMerchantGift?: { actorId?: number | string; targetId?: number | string; gift?: string; success?: boolean; reason?: string | null } | null;
  luckySeerCheck?: { actorId?: number | string; target?: number | string | null; result?: string; reason?: string | null } | null;
  luckyPoisonTarget?: number | string | null;
  luckyPoisonReason?: string | null;
  youngerBrotherTarget?: number | string | null;
  youngerBrotherReason?: string | null;
  deaths: Array<{ id: number; reason: string }>;
}

export interface WolfVoteCompletedPayload {
  actionType: 'wolf_vote';
  message: string;
  wolfTarget: number | null;
  wolfChoices: Record<string, unknown>;
  wolfVoteTally: Record<string, number>;
}

export interface SeerCheckCompletedPayload {
  actionType: 'seer_check';
  message: string;
  seerCheck: {
    target: number | string | null;
    result: string;
    reason?: string | null;
  };
  speech?: {
    playerId: number;
    text: string;
  };
}

export interface GuardActionCompletedPayload {
  actionType: 'guard_protect';
  message: string;
  guardAction: {
    target: number | string | null;
    reason?: string | null;
  };
}

export interface WitchActionCompletedPayload {
  actionType: 'witch_save' | 'witch_poison';
  message: string;
  witchAction: {
    use: boolean;
    target: number | string | null;
    reason?: string | null;
  };
  speech?: {
    playerId: number;
    text: string;
  };
}

export interface HybridMasterPayload {
  actionType: 'hybrid_choose_master';
  message: string;
  hybridMaster: {
    actorId: number | string;
    masterId: number | string | null;
  };
}

export interface SilenceResultPayload {
  actionType: 'elder_silence';
  message: string;
  silencedPlayerId: number | string | null;
  reason?: string | null;
}

export interface KnightDuelPayload {
  actionType: 'knight_duel';
  message: string;
  knightDuel: {
    actorId: number | string;
    targetId: number | string;
    targetFaction: string;
    success: boolean;
    reason?: string | null;
  };
}

export interface ButterflyHugPayload {
  actionType: 'butterfly_hug';
  message: string;
  butterflyTarget: number | string | null;
  reason?: string | null;
}

export interface StalkerAssassinatePayload {
  actionType: 'stalker_assassinate';
  message: string;
  stalkerTarget: number | string | null;
  reason?: string | null;
}

export interface WolfBeautyCharmPayload {
  actionType: 'wolf_beauty_charm';
  message: string;
  wolfBeautyTarget: number | string | null;
  reason?: string | null;
}

export interface DemonInspectPayload {
  actionType: 'demon_inspect';
  message: string;
  demonInspect: {
    target: number | string | null;
    result: string;
    reason?: string | null;
  };
}

export interface NightmareFearPayload {
  actionType: 'nightmare_fear';
  message: string;
  nightmareTarget: number | string | null;
  reason?: string | null;
}

export interface DreamerDreamPayload {
  actionType: 'dreamer_dream';
  message: string;
  dreamerTarget: number | string | null;
  reason?: string | null;
}

export interface MagicianSwapPayload {
  actionType: 'magician_swap';
  message: string;
  magicianSwap: {
    firstTarget?: number | string | null;
    secondTarget?: number | string | null;
    reason?: string | null;
  } | null;
}

export interface FortuneTellerMarkPayload {
  actionType: 'fortune_teller_mark';
  message: string;
  fortuneTellerMark: {
    target?: number | string | null;
    reason?: string | null;
  } | null;
}

export interface BigBadWolfKillPayload {
  actionType: 'big_bad_wolf_kill';
  message: string;
  bigBadWolfTarget: number | string | null;
  reason?: string | null;
}

export interface CrowCursePayload {
  actionType: 'crow_curse';
  message: string;
  crowCurse: {
    target?: number | string | null;
    reason?: string | null;
  } | null;
}

export interface BearTamerRoarPayload {
  actionType: 'bear_tamer_roar';
  message: string;
  bearRoar: {
    roaring: boolean;
    adjacentWolfIds: Array<number | string>;
  };
}

export interface HunterShotPayload {
  shot: {
    from: number | string;
    target: number | string;
  };
  message: string;
  speech: {
    playerId: number;
    text: string;
  };
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
  requiresAck?: boolean;
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
  phase: 'night' | 'day' | 'postgame';
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
  ackId?: number | string;
}

// ============================================================
// 特定事件载荷类型
// ============================================================

export interface PhaseStartPayload {
  phase: 'night' | 'day' | 'postgame';
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
  actionType?: string;
  thinking?: string;
  fullText?: string;
  side?: string;
  speakerLabel?: string;
  phase?: 'night' | 'day' | 'postgame';
}

export interface PostgameSpeech {
  playerId: number;
  text: string;
  thinking?: string;
  phase: 'postgame';
}

export interface WolfSpeechPayload extends SpeechPayload {
  isLeader?: boolean;
  sharedSpeeches?: unknown[];
}

export interface SelfDestructPayload {
  playerId: number;
  text: string;
  targetId?: number | null;
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
  sheriffId?: number | null;
  sheriffBadge?: Record<string, unknown>;
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
  | GameEvent<HybridMasterPayload>
  | GameEvent<SilenceResultPayload>
  | GameEvent<KnightDuelPayload>
  | GameEvent<ButterflyHugPayload>
  | GameEvent<StalkerAssassinatePayload>
  | GameEvent<WolfBeautyCharmPayload>
  | GameEvent<DemonInspectPayload>
  | GameEvent<NightmareFearPayload>
  | GameEvent<DreamerDreamPayload>
  | GameEvent<MagicianSwapPayload>
  | GameEvent<FortuneTellerMarkPayload>
  | GameEvent<BigBadWolfKillPayload>
  | GameEvent<CrowCursePayload>
  | GameEvent<BearTamerRoarPayload>
  | GameEvent<SheriffEventPayload>
  | GameEvent<ErrorPayload>
  | GameEvent<Record<string, unknown>>;

// 事件处理器类型
export type EventHandler = (event: GameEvent) => void | Promise<void>;

// 事件过滤器类型
export type EventFilter = (event: GameEvent) => boolean;
