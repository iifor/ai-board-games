import { azureStyleCandidates, parseSpeechTags, type AzureVoiceCatalogEntry, type VoiceControlSupport } from '@battle/shared';
import { logger } from '../../utils/logger';
import type { PreparedSpeech, VoiceSpec } from './types';

/** 先移除控制标签，再把情绪映射为当前音色支持的风格。 */
export async function prepareAzureSpeech(text: string, voice: VoiceSpec, catalog: () => Promise<AzureVoiceCatalogEntry[]>, controls: VoiceControlSupport = { pause: false, rate: false, pitch: false }): Promise<PreparedSpeech> {
  const parsed = parseSpeechTags(text);
  if (!parsed.hasTags) return { text, voice: { ...voice, controls } };
  let supported: readonly string[] = [];
  if (parsed.text.trim()) {
    try {
      const voices = await catalog();
      supported = voices.find(item => item.voiceName.toLowerCase() === voice.voiceName.toLowerCase())?.styles ?? [];
    } catch (error) {
      logger.warn('读取 Azure 风格目录失败，本次情绪标签使用自然风格', { error: error instanceof Error ? error.message : '目录不可用' });
    }
  }
  const defaultStyle = supported.includes(voice.style) ? voice.style : '';
  const resolveStyle = (style: string | null): string => {
    if (style === '') return '';
    if (style !== null) return azureStyleCandidates(style).find(candidate => supported.includes(candidate)) ?? defaultStyle;
    return defaultStyle;
  };
  const segments = parsed.segments.map(segment => ({
    text: segment.text,
    style: resolveStyle(segment.style),
    ...(controls.pause && segment.pauseBeforeMs ? { pauseBeforeMs: segment.pauseBeforeMs } : {}),
    ...(controls.rate && segment.rateOffset !== undefined ? { rate: adjustPercent(voice.rate, segment.rateOffset, 100) } : {}),
    ...(controls.pitch && segment.pitchOffset !== undefined ? { pitch: adjustPercent(voice.pitch, segment.pitchOffset, 50) } : {}),
  }));
  return { text: parsed.text, voice: { ...voice, controls, segments } };
}

function adjustPercent(base: string, offset: number, upper: number): string {
  const baseline = Number.parseFloat(base) || 0;
  const adjusted = ((1 + baseline / 100) * (1 + offset / 100) - 1) * 100;
  return `${Math.round(Math.max(-50, Math.min(upper, adjusted)) * 100) / 100}%`;
}
