import * as sdk from 'microsoft-cognitiveservices-speech-sdk';
import { DEFAULT_SAMPLE_TEXT, getAzureTtsTimeoutMs } from './constants';
import {
  getAzureSpeechKey, normalizeEndpoint, parseRegionFromEndpoint,
  buildAzureSsml
} from './utils';
import { synthesizeMimoVoice } from './mimo';
import { AppError, ErrorCodes } from '../../utils/errors';
import type { VoicePackage, WordBoundary } from './utils';

interface SynthesizePreviewOptions {
  collectWordBoundaries?: boolean;
}

interface SynthesizePreviewResult {
  buffer: Buffer;
  mimeType: string;
  wordBoundaries: WordBoundary[];
}

async function synthesizeVoicePreview(
  voicePackage: VoicePackage | null | undefined,
  text?: string | null,
  options: SynthesizePreviewOptions = {}
): Promise<SynthesizePreviewResult> {
  if (!voicePackage) throw new AppError(ErrorCodes.NOT_FOUND, '语音包不存在', 404);
  const provider = String(voicePackage.provider || 'browser').trim().toLowerCase();
  const content = String(text || voicePackage.sampleText || DEFAULT_SAMPLE_TEXT).trim() || DEFAULT_SAMPLE_TEXT;

  if (provider === 'azure') return synthesizeAzureVoice(voicePackage, content, options);
  if (provider === 'mimo') return synthesizeMimoVoice(voicePackage, content);
  throw new AppError('UNSUPPORTED_VOICE', '该语音包使用浏览器本地语音，请在前端直接试听。', 422);
}

interface SynthesizeMediaResult {
  text: string;
  audioUrl: string;
  audioMimeType: string;
  wordBoundaries: WordBoundary[] | null;
}

async function synthesizeVoiceMedia(
  voicePackage: VoicePackage,
  text: string,
  gameId: string | null = null
): Promise<SynthesizeMediaResult> {
  const { prepareVoiceAudio } = require('./cache');
  const content = String(text || '').trim();
  const saved = await prepareVoiceAudio(voicePackage, content, gameId);
  if (!saved) throw new AppError('UNSUPPORTED_VOICE', '该语音包无法生成服务端语音媒体。', 422);
  return {
    text: content,
    audioUrl: saved.audioUrl,
    audioMimeType: saved.audioMimeType,
    wordBoundaries: saved.wordBoundaries || null
  };
}

async function synthesizeAzureVoice(
  voicePackage: VoicePackage,
  text: string,
  options: SynthesizePreviewOptions = {}
): Promise<SynthesizePreviewResult> {
  const key = getAzureSpeechKey();
  const endpoint = normalizeEndpoint(process.env.AZURE_SPEECH_ENDPOINT);
  const region = process.env.AZURE_SPEECH_REGION || parseRegionFromEndpoint(endpoint);
  if (!key || !region) {
    throw new AppError(ErrorCodes.UPSTREAM_ERROR, '缺少 AZURE_SPEECH_KEY 或 AZURE_SPEECH_REGION/AZURE_SPEECH_ENDPOINT，无法合成 Azure 语音。', 503);
  }

  const collectBoundaries = options.collectWordBoundaries !== false;

  return new Promise((resolve, reject) => {
    let synthesizer: sdk.SpeechSynthesizer | null = null;
    let settled = false;
    const timeoutMs = getAzureTtsTimeoutMs();
    const finish = <T>(handler: (value: T) => void, value: T): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (synthesizer) synthesizer.close();
      handler(value);
    };
    const timer = setTimeout(() => {
      finish(reject, new AppError(ErrorCodes.UPSTREAM_ERROR, `Azure 语音合成超时：${timeoutMs}ms`, 504));
    }, timeoutMs);

    try {
      const speechConfig = sdk.SpeechConfig.fromSubscription(key, region);
      speechConfig.speechSynthesisOutputFormat = sdk.SpeechSynthesisOutputFormat.Audio24Khz48KBitRateMonoMp3;
      if (voicePackage.language) speechConfig.speechSynthesisLanguage = voicePackage.language;

      const pullStream = sdk.AudioOutputStream.createPullStream();
      const audioConfig = sdk.AudioConfig.fromStreamOutput(pullStream);
      synthesizer = new sdk.SpeechSynthesizer(speechConfig, audioConfig);

      const wordBoundaries: WordBoundary[] = [];
      if (collectBoundaries) {
        synthesizer.wordBoundary = (_sender: unknown, event: sdk.SpeechSynthesisWordBoundaryEventArgs) => {
          wordBoundaries.push({
            offset: Math.round(event.audioOffset / 10000),
            duration: Math.round(event.duration / 10000),
            text: event.text
          });
        };
      }

      const ssml = buildAzureSsml(voicePackage, text);

      synthesizer.speakSsmlAsync(
        ssml,
        (result) => {
          if (result.reason === sdk.ResultReason.SynthesizingAudioCompleted) {
            finish(resolve, {
              buffer: Buffer.from(result.audioData),
              mimeType: 'audio/mpeg',
              wordBoundaries
            });
          } else {
            const detail = sdk.CancellationDetails.fromResult(result);
            finish(reject, new AppError(ErrorCodes.UPSTREAM_ERROR, `Azure 语音合成失败：${detail.errorDetails || result.reason}`, 502));
          }
        },
        (error) => {
          finish(reject, new AppError(ErrorCodes.UPSTREAM_ERROR, `Azure 语音合成失败：${error}`, 502));
        }
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      finish(reject, new AppError(ErrorCodes.UPSTREAM_ERROR, `Azure SDK 初始化失败：${message}`, 503));
    }
  });
}

export { synthesizeVoicePreview, synthesizeVoiceMedia };
