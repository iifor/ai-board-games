import { TTS_TIMEOUT_MS, type SynthesizedAudio, type TtsProvider, type VoiceSpec } from './types';

/** 请求的音频格式；与模型名一起决定输出，因此参与缓存键 */
const MIMO_AUDIO_FORMAT = 'mp3';

interface MimoPayload {
  choices?: { message?: { audio?: { data?: string } } }[];
  error?: { message?: string };
}

/** Mimo 语音：OpenAI 兼容的 chat 接口，assistant 消息即要朗读的文本；风格作为前置的 user 指令 */
export function createMimoTts(config: { readonly apiKey: string; readonly baseUrl: string; readonly model: string }): TtsProvider {
  return {
    signature: `mimo:${config.model}:${MIMO_AUDIO_FORMAT}`,
    async synthesize(text: string, voice: VoiceSpec): Promise<SynthesizedAudio> {
      const messages = [...(voice.style ? [{ role: 'user', content: voice.style }] : []), { role: 'assistant', content: text }];
      const response = await fetch(`${config.baseUrl.replace(/\/+$/, '')}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'api-key': config.apiKey },
        body: JSON.stringify({ model: config.model, messages, audio: { voice: voice.voiceName, format: MIMO_AUDIO_FORMAT } }),
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      });
      const payload = (await response.json().catch(() => null)) as MimoPayload | null;
      if (!response.ok) throw new Error(`Mimo 语音合成失败：${payload?.error?.message ?? response.status}`);
      const data = payload?.choices?.[0]?.message?.audio?.data;
      if (!data) throw new Error('Mimo 语音合成失败：响应中没有音频');
      return { data: Buffer.from(data, 'base64'), mime: 'audio/mpeg' };
    },
  };
}
