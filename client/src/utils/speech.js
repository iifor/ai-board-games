import { HOST_VOICE_PROFILE, PLAYER_VOICE_PROFILES, VOICE_KEYWORDS } from '../constants/speech';

export function getChineseVoices() {
  if (!window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => /^zh|Chinese|Mandarin|Cantonese/i.test(`${voice.lang} ${voice.name}`));
}

function voiceMatchesRole(voice, role) {
  const keywords = VOICE_KEYWORDS[role] || [];
  if (keywords.length === 0) return false;
  const voiceText = `${voice.name} ${voice.lang} ${voice.voiceURI}`.toLowerCase();
  return keywords.some((keyword) => voiceText.includes(keyword.toLowerCase()));
}

export function getVoiceForItem(item, voices, profile) {
  if (voices.length === 0) return null;
  if (!item.playerId) return voices[0] || null;

  const matchingVoices = voices.filter((voice) => voiceMatchesRole(voice, profile.role));
  const candidates = matchingVoices.length ? matchingVoices : voices;
  const numericId = getNumericPlayerId(item.playerId);
  return candidates[(numericId - 1) % candidates.length] || candidates[0] || null;
}

export function getProfileForItem(item) {
  if (!item.playerId) return HOST_VOICE_PROFILE;
  const numericId = getNumericPlayerId(item.playerId);
  return PLAYER_VOICE_PROFILES[item.playerId] || {
    role: numericId % 3 === 0 ? 'child' : numericId % 2 === 0 ? 'male' : 'female',
    rate: 0.92 + (numericId % 5) * 0.06,
    pitch: 0.78 + (numericId % 7) * 0.1,
    volume: 1
  };
}

export function getNumericPlayerId(playerId) {
  const numeric = Number(playerId);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const text = String(playerId || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 997;
  }
  return (hash % 12) + 1;
}

export function clampFinite(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

export function normalizeVoiceProfile(profile) {
  return {
    role: profile?.role || 'host',
    rate: clampFinite(profile?.rate, 1, 0.1, 10),
    pitch: clampFinite(profile?.pitch, 1, 0, 2),
    volume: clampFinite(profile?.volume, 1, 0, 1)
  };
}

export function getSpeechFallbackDelay(text) {
  const length = String(text || '').length;
  return Math.max(120000, Math.min(600000, 30000 + length * 1200));
}

export async function fetchServerSpeechAudio(text, voicePackageId) {
  const response = await fetch('/api/toc/voice/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voicePackageId })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.blob();
}
