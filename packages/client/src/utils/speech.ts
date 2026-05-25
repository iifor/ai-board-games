import type { VoiceProfile, QueueItem } from '../types';
import type { SpeechMedia } from '@ai-presenter/shared/types/speechTypes';
import { HOST_VOICE_PROFILE, PLAYER_VOICE_PROFILES, VOICE_KEYWORDS } from '../constants/speech';
import { stripSpeechParentheses } from './playableText';

export function getChineseVoices(): SpeechSynthesisVoice[] {
  if (!window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => /^zh|Chinese|Mandarin|Cantonese/i.test(`${voice.lang} ${voice.name}`));
}

function voiceMatchesRole(voice: SpeechSynthesisVoice, role: string): boolean {
  const keywords: readonly string[] = VOICE_KEYWORDS[role as keyof typeof VOICE_KEYWORDS] || [];
  if (keywords.length === 0) return false;
  const voiceText = `${voice.name} ${voice.lang} ${voice.voiceURI}`.toLowerCase();
  return keywords.some((keyword) => voiceText.includes(keyword.toLowerCase()));
}

export function getVoiceForItem(item: QueueItem, voices: SpeechSynthesisVoice[], profile: VoiceProfile): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null;
  if (!item.playerId) return voices[0] || null;

  const matchingVoices = voices.filter((voice) => voiceMatchesRole(voice, profile.role));
  const candidates = matchingVoices.length ? matchingVoices : voices;
  const numericId = getNumericPlayerId(item.playerId);
  return candidates[(numericId - 1) % candidates.length] || candidates[0] || null;
}

export function getProfileForItem(item: QueueItem): VoiceProfile {
  if (!item.playerId) return HOST_VOICE_PROFILE;
  const numericId = getNumericPlayerId(item.playerId);
  return PLAYER_VOICE_PROFILES[item.playerId as keyof typeof PLAYER_VOICE_PROFILES] || {
    role: numericId % 3 === 0 ? 'child' : numericId % 2 === 0 ? 'male' : 'female',
    rate: 0.92 + (numericId % 5) * 0.06,
    pitch: 0.78 + (numericId % 7) * 0.1,
    volume: 1
  };
}

export function getNumericPlayerId(playerId: string): number {
  const numeric = Number(playerId);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const text = String(playerId || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 997;
  }
  return (hash % 12) + 1;
}

export function clampFinite(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function normalizeVoiceProfile(profile: Partial<VoiceProfile> | null | undefined): VoiceProfile {
  return {
    role: profile?.role || 'host',
    rate: clampFinite(profile?.rate, 1, 0.1, 10),
    pitch: clampFinite(profile?.pitch, 1, 0, 2),
    volume: clampFinite(profile?.volume, 1, 0, 1)
  };
}

export function getSpeechFallbackDelay(text: string): number {
  const length = String(text || '').length;
  return Math.max(120000, Math.min(600000, 30000 + length * 1200));
}

export function getSpeechPlaybackText(text: string): string {
  return stripSpeechParentheses(text);
}

export async function fetchServerSpeechAudio(text: string, voicePackageId: number | null | undefined): Promise<Blob> {
  const response = await fetch('/api/toc/voice/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voicePackageId })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.blob();
}

export async function fetchServerSpeechMedia(text: string, voicePackageId: number | null | undefined): Promise<SpeechMedia> {
  const response = await fetch('/api/toc/voice/synthesize-media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voicePackageId })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || '语音媒体生成失败');
  if (!payload?.data?.audioUrl) throw new Error(payload?.message || '语音媒体地址缺失');
  return payload.data;
}
