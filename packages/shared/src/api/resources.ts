// B 端可配置资源：模型供应商、模型、音色、AI 玩家。

export interface ProviderDto {
  readonly id: number;
  readonly name: string;
  readonly baseUrl: string;
  /** API Key 只以掩码形式返回，明文永不出站 */
  readonly apiKeyMasked: string;
  readonly enabled: boolean;
  /** 该供应商下的模型数 */
  readonly modelCount: number;
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

/** 系统自动停用模型的原因；管理员手动停用时为 null */
export const MODEL_DISABLED_REASONS = ['quota_exhausted'] as const;
export type ModelDisabledReason = (typeof MODEL_DISABLED_REASONS)[number];

export interface ModelDto {
  readonly id: number;
  readonly providerId: number;
  readonly name: string;
  readonly model: string;
  readonly temperature: number;
  readonly maxTokens: number;
  readonly fallbackModelId: number | null;
  readonly enabled: boolean;
  readonly disabledReason: ModelDisabledReason | null;
  readonly disabledAt: string | null;
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
  /** 设为 true 会清除系统停用原因（管理员确认额度已恢复后重新启用） */
  readonly enabled?: boolean | undefined;
}

/** 模型连接测试：不抛错，失败原因放在 message 里 */
export interface ModelTestResult {
  readonly ok: boolean;
  readonly latencyMs: number;
  readonly message: string;
}

export const VOICE_PROVIDERS = ['azure', 'mimo', 'browser'] as const;
export type VoiceProvider = (typeof VOICE_PROVIDERS)[number];

export const VOICE_GENDERS = ['男', '女', '中性'] as const;
export type VoiceGender = (typeof VOICE_GENDERS)[number];

export interface VoiceDto {
  readonly id: number;
  readonly name: string;
  readonly provider: VoiceProvider;
  readonly voiceName: string;
  readonly language: string;
  readonly gender: VoiceGender | null;
  /** Azure：express-as 风格名；Mimo：朗读口吻的文字指令 */
  readonly style: string;
  /** 语速与音调，百分比字符串，如 0%、+10%、-10%（Azure 有效） */
  readonly rate: string;
  readonly pitch: string;
  readonly sampleText: string;
  readonly description: string;
  readonly enabled: boolean;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export interface VoiceInput {
  readonly name: string;
  readonly provider: VoiceProvider;
  readonly voiceName: string;
  readonly language?: string | undefined;
  readonly gender?: VoiceGender | null | undefined;
  readonly style?: string | undefined;
  readonly rate?: string | undefined;
  readonly pitch?: string | undefined;
  readonly sampleText?: string | undefined;
  readonly description?: string | undefined;
  readonly enabled?: boolean | undefined;
}

export interface VoicePreviewRequest {
  /** 省略时使用音色的试听文本 */
  readonly text?: string | undefined;
}

/** 试听结果：与对局播放共用的音频地址 */
export interface VoicePreviewResult {
  readonly url: string;
  readonly mime: string;
}

export interface VoiceImportResult {
  readonly created: number;
  readonly skipped: number;
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
