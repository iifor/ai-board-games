// B 端可配置资源：模型供应商、模型、音色、AI 玩家。

export interface ProviderDto {
  readonly id: number;
  readonly name: string;
  readonly baseUrl: string;
  /** API Key 只以掩码形式返回，明文永不出站 */
  readonly apiKeyMasked: string;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ProviderInput {
  readonly name: string;
  readonly baseUrl: string;
  /** 更新时省略表示保留原值 */
  readonly apiKey?: string | undefined;
  readonly enabled?: boolean | undefined;
}

export interface ModelDto {
  readonly id: number;
  readonly providerId: number;
  readonly name: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly fallbackModelId: number | null;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface ModelInput {
  readonly providerId: number;
  readonly name: string;
  readonly model: string;
  readonly temperature?: number | undefined;
  readonly maxTokens?: number | undefined;
  readonly fallbackModelId?: number | null | undefined;
  readonly enabled?: boolean | undefined;
}

export const VOICE_PROVIDERS = ['azure', 'mimo', 'browser'] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

export interface VoiceDto {
  readonly id: number;
  readonly name: string;
  readonly provider: VoiceProvider;
  readonly voiceName: string;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VoiceInput {
  readonly name: string;
  readonly provider: VoiceProvider;
  readonly voiceName: string;
  readonly enabled?: boolean | undefined;
}

export interface PlayerDto {
  readonly id: number;
  readonly name: string;
  readonly avatar: string | null;
  readonly persona: string;
  readonly modelId: number;
  readonly voiceId: number | null;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface PlayerInput {
  readonly name: string;
  readonly avatar?: string | null | undefined;
  readonly persona?: string | undefined;
  readonly modelId: number;
  readonly voiceId?: number | null | undefined;
  readonly enabled?: boolean | undefined;
}

/** C 端选人用的公开玩家信息 */
export interface PublicPlayerDto {
  readonly id: number;
  readonly name: string;
  readonly avatar: string | null;
  readonly persona: string;
}
