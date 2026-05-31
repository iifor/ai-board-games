import { DEFAULT_MIMO_BASE_URL, DEFAULT_MIMO_TTS_MODEL, getMimoTtsTimeoutMs } from './constants';
import { getMimoApiKey, normalizeEndpoint } from './utils';
import { AppError, ErrorCodes } from '../../utils/errors';
import type { VoicePackage, WordBoundary } from './utils';

interface MimoSpeechResult {
  buffer: Buffer;
  mimeType: string;
  wordBoundaries: WordBoundary[];
}

interface MimoChatResponse {
  choices?: Array<{
    message?: {
      audio?: {
        data?: string;
        format?: string;
      };
    };
  }>;
  error?: {
    message?: string;
  };
}

async function synthesizeMimoVoice(voicePackage: VoicePackage, text: string): Promise<MimoSpeechResult> {
  const apiKey = getMimoApiKey();
  if (!apiKey) {
    throw new AppError(ErrorCodes.UPSTREAM_ERROR, 'Missing MIMO_API_KEY; Mimo TTS is not configured.', 503);
  }

  const timeoutMs = getMimoTtsTimeoutMs();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(`${getMimoBaseUrl()}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': apiKey
      },
      body: JSON.stringify(buildMimoSpeechPayload(voicePackage, text)),
      signal: controller.signal
    });
    const payload = await response.json().catch(() => null) as MimoChatResponse | null;
    if (!response.ok) {
      throw new AppError(
        ErrorCodes.UPSTREAM_ERROR,
        `Mimo TTS failed: ${payload?.error?.message || response.statusText || response.status}`,
        502
      );
    }

    const audio = payload?.choices?.[0]?.message?.audio;
    if (!audio?.data) {
      throw new AppError(ErrorCodes.UPSTREAM_ERROR, 'Mimo TTS failed: audio data missing from response.', 502);
    }

    const format = normalizeMimoAudioFormat(audio.format || process.env.MIMO_TTS_FORMAT || 'mp3');
    return {
      buffer: Buffer.from(audio.data, 'base64'),
      mimeType: getAudioMimeType(format),
      wordBoundaries: []
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    const message = error instanceof Error && error.name === 'AbortError'
      ? `Mimo TTS timeout after ${timeoutMs}ms`
      : `Mimo TTS failed: ${error instanceof Error ? error.message : String(error)}`;
    throw new AppError(ErrorCodes.UPSTREAM_ERROR, message, error instanceof Error && error.name === 'AbortError' ? 504 : 502);
  } finally {
    clearTimeout(timer);
  }
}

function buildMimoSpeechPayload(voicePackage: VoicePackage, text: string): Record<string, unknown> {
  const style = String(voicePackage.style || '').trim();
  const messages: Array<{ role: string; content: string }> = [];
  if (style) messages.push({ role: 'user', content: style });
  messages.push({ role: 'assistant', content: text });

  return {
    model: process.env.MIMO_TTS_MODEL || DEFAULT_MIMO_TTS_MODEL,
    messages,
    audio: {
      voice: voicePackage.voiceId || process.env.MIMO_TTS_VOICE || 'mimo_zh_male',
      format: normalizeMimoAudioFormat(process.env.MIMO_TTS_FORMAT || 'mp3')
    }
  };
}

function getMimoBaseUrl(): string {
  return normalizeEndpoint(process.env.MIMO_BASE_URL || DEFAULT_MIMO_BASE_URL);
}

function normalizeMimoAudioFormat(value: string): string {
  const format = String(value || '').trim().toLowerCase();
  if (['mp3', 'wav', 'pcm', 'opus'].includes(format)) return format;
  return 'mp3';
}

function getAudioMimeType(format: string): string {
  if (format === 'wav') return 'audio/wav';
  if (format === 'pcm') return 'audio/L16';
  if (format === 'opus') return 'audio/ogg';
  return 'audio/mpeg';
}

export { synthesizeMimoVoice, buildMimoSpeechPayload };
