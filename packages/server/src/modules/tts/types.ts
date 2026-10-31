import type { VoiceProvider } from '@battle/shared';

export interface SynthesizedAudio {
  readonly data: Buffer;
  readonly mime: string;
}

/** 云端语音合成；browser 音色由前端自己朗读，不经过服务端 */
export interface TtsProvider {
  synthesize(text: string, voiceName: string): Promise<SynthesizedAudio>;
}

export type TtsProviders = Partial<Record<Exclude<VoiceProvider, 'browser'>, TtsProvider>>;

export const TTS_TIMEOUT_MS = 20_000;
