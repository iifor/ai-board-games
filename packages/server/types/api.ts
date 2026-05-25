// API entity types — camelCase, produced by rowTo* mapper functions.

interface Skin {
  id: string;
  name: string;
  version: string;
  source: string;
  terms: Record<string, unknown>;
  background: string;
  truth: string;
  clues: unknown[];
  noises: unknown[];
  memoryExamples: unknown[];
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface Player {
  id: number;
  nickname: string;
  name: string;
  avatar: string;
  sex: string;
  personality: string;
  provider: string;
  model: string;
  modelId: number | null;
  voicePackageId: number | null;
  temperature: number;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface ModelProvider {
  id: number;
  name: string;
  baseUrl: string;
  apiFormat: string;
  apiKey: string;
  hasApiKey: boolean;
  enabled: boolean;
  modelCount: number;
  createdAt: string;
  updatedAt: string;
}

interface Model {
  id: number;
  providerId: number | null;
  provider: string;
  providerName: string;
  name: string;
  baseUrl: string;
  apiFormat: string;
  hasApiKey: boolean;
  providerEnabled: boolean;
  thinkingEnabled: boolean;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface RuntimeModel extends Model {
  apiKey: string;
}

interface VoicePackage {
  id: number;
  name: string;
  provider: string;
  voiceId: string;
  language: string;
  gender: string;
  style: string;
  rate: string;
  pitch: string;
  temperature: number;
  sampleText: string;
  description: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface WerewolfRole {
  id: string;
  name: string;
  faction: string;
  roleType: string;
  responsibility: string;
  ability: string;
  playStyleAdvice: string;
  keyInfo: string;
  rule: Record<string, unknown>;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface WerewolfMode {
  id: string;
  name: string;
  description: string;
  version?: string;
  background?: string;
  roles: unknown[];
  rules: Record<string, unknown>;
  sheriff: Record<string, unknown>;
  winCondition: string;
  enabled: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

interface Game {
  id: string;
  gameType: string;
  mode: string;
  skinId: string | null;
  skinName: string;
  winner: string | null;
  winReason: string;
  topic: Record<string, unknown>;
  players: unknown[];
  rounds: unknown[];
  event: Record<string, unknown>;
  audioResources: unknown[];
  createdAt: string;
}

interface GameSummary {
  id: string;
  gameType: string;
  mode: string;
  skinName: string;
  winner: string | null;
  winReason: string;
  playerCount: number;
  createdAt: string;
}

interface GamePlayer {
  gameId: string;
  playerId: number;
  playerSnapshot: Record<string, unknown>;
}

interface GamePlayerSelection {
  gameType: string;
  playerIds: number[];
  updatedAt: string;
}

interface AppSetting {
  key: string;
  value: unknown;
  updatedAt: string;
}

export type {
  Skin,
  Player,
  ModelProvider,
  Model,
  RuntimeModel,
  VoicePackage,
  WerewolfRole,
  WerewolfMode,
  Game,
  GameSummary,
  GamePlayer,
  GamePlayerSelection,
  AppSetting
};
