import { TTS_TIMEOUT_MS, type SynthesizedAudio, type TtsProvider } from './types';

function escapeXml(text: string): string {
  return text.replace(/[<>&'"]/g, (char) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' })[char] ?? char);
}

/** Azure 语音 REST 接口（不依赖 SDK） */
export function createAzureTts(config: { readonly key: string; readonly region: string }): TtsProvider {
  return {
    async synthesize(text: string, voiceName: string): Promise<SynthesizedAudio> {
      const ssml = `<speak version="1.0" xml:lang="zh-CN"><voice name="${escapeXml(voiceName)}">${escapeXml(text)}</voice></speak>`;
      const response = await fetch(`https://${config.region}.tts.speech.microsoft.com/cognitiveservices/v1`, {
        method: 'POST',
        headers: {
          'Ocp-Apim-Subscription-Key': config.key,
          'Content-Type': 'application/ssml+xml',
          'X-Microsoft-OutputFormat': 'audio-24khz-48kbitrate-mono-mp3',
          'User-Agent': 'ai-board-games',
        },
        body: ssml,
        signal: AbortSignal.timeout(TTS_TIMEOUT_MS),
      });
      if (!response.ok) throw new Error(`Azure 语音合成失败：${response.status}`);
      return { data: Buffer.from(await response.arrayBuffer()), mime: 'audio/mpeg' };
    },
  };
}
