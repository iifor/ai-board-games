import type { ColumnType, Generated } from 'kysely';
import type { MemoryDecision, MemoryEvidence, MemoryReviewCall, ReviewOutcome } from '@battle/shared';
import type { AudioCaptionCue, PromptComparisonRecord, TraceKind, TraceModelSettings } from '@battle/shared';

// 列名在 TS 中为 camelCase，由 CamelCasePlugin 映射为数据库中的 snake_case。

type CreatedAt = ColumnType<Date, never, never>;
type UpdatedAt = ColumnType<Date, never, Date>;

export interface AdminUsersTable {
  id: Generated<number>;
  username: string;
  passwordHash: string;
  mustChangePassword: boolean;
  /** 令牌代次（迁移 027）：改密或退出登录时递增，旧令牌失效 */
  tokenGeneration: Generated<number>;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** 身份码（迁移 026） */
export interface AccessCodesTable {
  id: Generated<number>;
  username: string;
  codeHash: string;
  codeHint: string;
  generation: Generated<number>;
  expiresAt: Date;
  maxMatches: number | null;
  usedMatches: Generated<number>;
  disabled: Generated<boolean>;
  lastUsedAt: Date | null;
  createdBy: number | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface ModelProvidersTable {
  id: Generated<number>;
  name: string;
  baseUrl: string;
  apiKeyEncrypted: string;
  apiKeyHint: string;
  enabled: boolean;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface ModelsTable {
  id: Generated<number>;
  providerId: number;
  name: string;
  model: string;
  temperature: number | null;
  maxTokens: number;
  fallbackModelId: number | null;
  enabled: boolean;
  /** 系统自动停用的原因（如额度耗尽）；管理员手动停用为 null */
  disabledReason: string | null;
  disabledAt: Date | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface VoicesTable {
  id: Generated<number>;
  name: string;
  provider: string;
  voiceName: string;
  language: string;
  gender: string | null;
  style: string;
  rate: string;
  pitch: string;
  sampleText: string;
  description: string;
  enabled: boolean;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface PlayersTable {
  memoryGeneration: Generated<number>;
  id: Generated<number>;
  name: string | null;
  appearanceName: string | null;
  avatar: string | null;
  persona: string;
  temperature: number | null;
  maxTokens: number | null;
  speechMaxChars: number | null;
  modelId: number | null;
  voiceId: number | null;
  enabled: boolean;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** jsonb 列：写入时由 repository 序列化为字符串，读取时为解析后的值 */
type Json<T> = ColumnType<T, string, string>;

export interface MatchesTable {
  importTitle: string | null;
  traceDeleted: Generated<boolean>;
  id: string;
  gameKey: string;
  variantKey: string | null;
  specVersion: number;
  specHash: string;
  seed: ColumnType<string, number, number>;
  params: Json<unknown>;
  status: string;
  debug: boolean;
  scripted: boolean;
  /** 脚本化调试局是否使用混沌脚本（迁移 005） */
  chaos: boolean;
  pacing: string;
  snapshot: Json<unknown>;
  /** 当前阶段（快照游标的冗余列，随快照一起写入；迁移 007） */
  phaseId: string | null;
  version: Generated<number>;
  lastSeq: Generated<number>;
  ackedSeq: Generated<number>;
  result: Json<unknown> | null;
  error: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  completedAt: Date | null;
  /** 发起这局的身份码（迁移 026）；后台开局与导入回放为 null */
  accessCodeId: ColumnType<number | null, number | null | undefined, number | null>;
}

export interface MatchSeatsTable {
  matchId: string;
  seat: number;
  playerId: number | null;
  playerName: string;
  modelId: number | null;
  voiceId: number | null;
}

export interface AiTasksTable {
  matchId: string;
  requestId: string;
  seat: number;
  request: Json<unknown>;
  status: Generated<string>;
  claimedUntil: Date | null;
  /** 被领取的次数，超过上限后 worker 放弃并终止对局 */
  attempts: Generated<number>;
  output: Json<unknown> | null;
  error: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface MatchStageEventsTable {
  matchId: string;
  seq: number;
  event: Json<unknown>;
  createdAt: CreatedAt;
}

export interface AiCallsTable {
  traceSettings: Json<TraceModelSettings> | null;
  id: Generated<number>;
  matchId: string;
  requestId: string;
  seat: number;
  modelId: number | null;
  modelName: string;
  prompt: Json<unknown>;
  rawResponse: string | null;
  output: Json<unknown> | null;
  error: string | null;
  latencyMs: number;
  usage: Json<unknown> | null;
  createdAt: CreatedAt;
}

export interface MediaAssetsTable {
  id: string;
  provider: string;
  voiceName: string;
  mime: string;
  data: Buffer;
  captions: ColumnType<readonly AudioCaptionCue[] | null, string | null | undefined, string | null>;
  createdAt: CreatedAt;
}

/** 限流与登录锁定的滑动窗口记录（迁移 006）：key 由用途与来源组成，at 为发生时间 */
export interface RequestWindowsTable {
  key: string;
  at: Date;
}

export interface Database {
  memoryReviewCalls: Omit<MemoryReviewCall, 'id' | 'createdAt'> & { id: Generated<number>; createdAt: CreatedAt };
  playerMemoryUses: { memoryId: number; matchId: string; requestId: string; round: number; phaseId: string; action: string };
  playerDecisions: { matchId: string; requestId: string; ownerId: number; note: Json<MemoryDecision> };
  playerMemoryReviews: { matchId: string; ownerId: number; seat: number; attempts: Generated<number>;
    status: Generated<string>; availableAt: ColumnType<Date, never, Date> };
  playerMemories: { id: Generated<number>; forgotten: Generated<boolean>; ownerId: number; matchId: string | null; gameKey: string; subjectId: number | null;
    subjectName: string | null; phaseId: string | null; action: string | null; content: string; evidence: Json<readonly MemoryEvidence[]>;
    requestId: string | null; outcome: ReviewOutcome; previousId: number | null; createdAt: CreatedAt };
  promptTemplates: { gameKey: string; templateName: string; source: string; revision: number; publicationOrder: Generated<string> };
  announcementTemplates: { gameKey: string; key: string; customText: string | null; revision: number };
  appliedPrompts: {
    publicationOrder: Generated<string>;
    gameKey: string; variantKey: string; templateName: string; source: string; persona: string | null; comparisonId: number;
  };
  promptComparisons: {
    id: Generated<number>; matchId: string; requestId: string;
    result: Json<Omit<PromptComparisonRecord, 'id' | 'createdAt'>>; createdAt: CreatedAt;
  };
  replayImports: { id: string; title: string; revision: Generated<number>; matchId: string | null; document: Json<import('@battle/shared').ReplayDocument> };
  matchTraceNodes: {
    id: Generated<number>; matchId: string; round: number; phaseId: string | null; visit: number;
    kind: TraceKind; label: string; seat: number | null; seq: number | null;
    requestIds: Json<readonly string[]>; inputRequestId: string | null; data: Json<unknown> | null; createdAt: CreatedAt;
  };
  adminUsers: AdminUsersTable;
  accessCodes: AccessCodesTable;
  modelProviders: ModelProvidersTable;
  models: ModelsTable;
  voices: VoicesTable;
  players: PlayersTable;
  matches: MatchesTable;
  matchSeats: MatchSeatsTable;
  aiTasks: AiTasksTable;
  matchStageEvents: MatchStageEventsTable;
  aiCalls: AiCallsTable;
  mediaAssets: MediaAssetsTable;
  requestWindows: RequestWindowsTable;
}
