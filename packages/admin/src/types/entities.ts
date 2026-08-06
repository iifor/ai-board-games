export interface Player {
  id: number;
  nickname: string;
  name?: string;
  avatar: string;
  sex: string;
  personality: string;
  modelId: number | null;
  fallbackModelId: number | null;
  model?: string;
  modelName?: string;
  voicePackageId: number | null;
  enabled: boolean;
}

export interface Model {
  id: number;
  name: string;
  displayName: string;
  provider: string;
  enabled: boolean;
  thinkingEnabled?: boolean;
  apiFormat?: string;
  temperature?: number;
  baseUrl?: string;
  apiKey?: string;
  maxTokens?: number;
}

export interface ModelProvider {
  id: number;
  name: string;
  baseUrl: string;
  apiKey: string;
  apiFormat: 'openai-compatible' | 'anthropic-compatible' | 'custom';
  modelCount: number;
  enabled: boolean;
}

export interface VoicePackage {
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
}

export interface Skin {
  id: number;
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
}

export interface WerewolfRole {
  id: string;
  name: string;
  faction: 'good' | 'wolves';
  roleType: 'wolf' | 'god' | 'villager';
  responsibility: string;
  ability: string;
  keyInfo: string;
  playStyleAdvice: string;
  rule: Record<string, unknown> | string;
  sortOrder: number;
  enabled: boolean;
}

export interface WerewolfModeRole {
  roleId: string;
  count: number;
}

export interface WerewolfModeSheriff {
  enabled: boolean;
  firstDayElection: boolean;
  voteWeight: number;
}

export interface WerewolfMode {
  id: string;
  name: string;
  description: string;
  winCondition: string;
  playerCount: number;
  roles: WerewolfModeRole[];
  sheriff: WerewolfModeSheriff;
  sortOrder: number;
  enabled: boolean;
}
