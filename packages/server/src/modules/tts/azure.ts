import { buildAzureSsml } from './azureSsml';
import { TTS_TIMEOUT_MS, type SynthesizedAudio, type TtsProvider, type VoiceSpec } from './types';

/** 请求的输出格式；决定音频内容，因此参与缓存键 */
const AZURE_OUTPUT_FORMAT = 'audio-24khz-48kbitrate-mono-mp3';

/** Azure 语音 REST 接口（不依赖 SDK） */
export function createAzureTts(config: { readonly key: string; readonly region: string }): TtsProvider {
  return {
    signature: `azure:${AZURE_OUTPUT_FORMAT}`,
    async synthesize(text: string, voice: VoiceSpec): Promise<SynthesizedAudio> {
      const response = await fetch(`https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': config.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': AZURE_OUTPUT_FORMAT,
          'User-Agent': 'ai-board-games',
        },
        body: buildAzureSsml(voice, text),
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Azure 语音合成失败：${response.status}`);
      return { data: Buffer.from(await response.arrayBuffer()), mime: 'audio/mpeg' };
    },
  };
}
