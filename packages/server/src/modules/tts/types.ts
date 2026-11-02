import type { VoiceProvider } from '@battle/shared';

export interface SynthesizedAudio {
  readonly data: Buffer;
  readonly mime: string;
}

/** 合成时用到的音色参数（来自 voices 表） */
export interface VoiceSpec {
  readonly voiceName: string;
  readonly language: string;
  /** Azure 为 express-as 风格；Mimo 为朗读口吻的文字指令 */
  readonly style: string;
  readonly rate: string;
  readonly pitch: string;
}

/** 云端语音合成；browser 音色由前端自己朗读，不经过服务端 */
export interface TtsProvider {
  synthesize(text: string, voice: VoiceSpec): Promise<SynthesizedAudio>;
}

export type TtsProviders = Partial<Record<Exclude<VoiceProvider, 'browser'>, TtsProvider>>;

export const TTS_TIMEOUT_MS = 20_000;
