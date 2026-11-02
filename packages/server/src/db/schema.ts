import type { ColumnType, Generated } from 'kysely';

// 列名在 TS 中为 camelCase，由 CamelCasePlugin 映射为数据库中的 snake_case。

type CreatedAt = ColumnType<Date, never, never>;
type UpdatedAt = ColumnType<Date, never, Date>;

export interface AdminUsersTable {
  id: Generated<number>;
  username: string;
  passwordHash: string;
  mustChangePassword: boolean;
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
  temperature: number;
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
  id: Generated<number>;
  name: string;
  avatar: string | null;
  persona: string;
  modelId: number;
  voiceId: number | null;
  enabled: boolean;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

/** jsonb 列：写入时由 repository 序列化为字符串，读取时为解析后的值 */
type Json<T> = ColumnType<T, string, string>;

export interface MatchesTable {
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
  pacing: string;
  snapshot: Json<unknown>;
  version: Generated<number>;
  lastSeq: Generated<number>;
  ackedSeq: Generated<number>;
  result: Json<unknown> | null;
  error: string | null;
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
  completedAt: Date | null;
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
  createdAt: CreatedAt;
}

export interface Database {
  adminUsers: AdminUsersTable;
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
}
