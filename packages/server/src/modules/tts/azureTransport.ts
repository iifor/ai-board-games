import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { TTS_TIMEOUT_MS } from './types';

export interface AzureWordBoundary {
  readonly text: string;
  readonly startMs: number;
  readonly endMs: number;
}

export interface AzureSynthesisResult {
  readonly data: Buffer;
  readonly mime: string;
  readonly words: readonly AzureWordBoundary[];
}

export type AzureSynthesizer = (ssml: string) => Promise<AzureSynthesisResult>;

/** 官方 SDK 在同一次合成中获取音频与 Azure 时间戳。每次请求单独关闭连接。 */
export function createAzureSynthesis(config: { readonly key: string; readonly region: string }): AzureSynthesizer {
  return ssml => new Promise((resolve, reject) => {
    const speech = sdk.SpeechConfig.fromSubscription(config.key, config.region);
    speech.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
    speech.setProperty(sdk.PropertyId.SpeechServiceResponse_RequestWordBoundary, 'true');
    speech.setProperty(sdk.PropertyId.SpeechServiceResponse_RequestSentenceBoundary, 'true');
    const synthesizer = new sdk.SpeechSynthesizer(speech, null);
    const words: AzureWordBoundary[] = [];
    let settled = false;
    const finish = (error?: Error, result?: AzureSynthesisResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      synthesizer.close();
      if (error) reject(error);
      else if (result) resolve(result);
    };
    const timer = setTimeout(() => finish(new Error('Azure 语音合成超时')), TTS_TIMEOUT_MS);
    synthesizer.wordBoundary = (_sender, event) => {
      if (event.boundaryType === sdk.SpeechSynthesisBoundaryType.Sentence) return;
      const startMs = event.audioOffset / 10_000;
      const durationMs = event.duration / 10_000;
      if (!event.text || !Number.isFinite(startMs) || !Number.isFinite(durationMs) || startMs < 0) return;
      words.push({ text: event.text, startMs, endMs: startMs + Math.max(0, durationMs) });
    };
    try {
      synthesizer.speakSsmlAsync(ssml, result => {
        if (result.reason !== sdk.ResultReason.SynthesizingAudioCompleted) {
          finish(new Error('Azure 语音合成失败，请检查音色及语音服务配置'));
          return;
        }
        finish(undefined, { data: Buffer.from(result.audioData), mime: 'audio/mpeg', words });
      }, () => finish(new Error('无法连接 Azure 语音合成服务')));
    } catch {
      finish(new Error('无法启动 Azure 语音合成'));
    }
  });
}
