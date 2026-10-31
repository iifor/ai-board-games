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
  createdAt: CreatedAt;
  updatedAt: UpdatedAt;
}

export interface VoicesTable {
  id: Generated<number>;
  name: string;
  provider: string;
  voiceName: string;
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

export interface Database {
  adminUsers: AdminUsersTable;
  modelProviders: ModelProvidersTable;
  models: ModelsTable;
  voices: VoicesTable;
  players: PlayersTable;
}
