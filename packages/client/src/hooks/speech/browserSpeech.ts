import type { QueueItem } from '../../types';
import {
  clampFinite,
  getProfileForItem,
  getSpeechPlaybackText,
  getVoiceForItem,
  normalizeVoiceProfile
} from '../../utils/speech';

export function createBrowserSpeechUtterance(item: QueueItem, voices: SpeechSynthesisVoice[]): SpeechSynthesisUtterance | null {
  const spokenText = getSpeechPlaybackText(item.text);
  if (!spokenText) return null;
  const utterance = new SpeechSynthesisUtterance(spokenText);
  const profile = normalizeVoiceProfile(getProfileForItem(item));
  const voice = getVoiceForItem(item, voices, profile);
  utterance.lang = 'zh-CN';
  utterance.rate = clampFinite(
    profile.rate * clampFinite(item.playbackRate, 1, 1, 4),
    profile.rate,
    0.1,
    10,
  );
  utterance.pitch = profile.pitch;
  utterance.volume = profile.volume;
  if (voice) {
    utterance.voice = voice;
    utterance.lang = voice.lang || 'zh-CN';
  }
  return utterance;
}

export function createSilentSpeechUnlockUtterance(): SpeechSynthesisUtterance {
  const utterance = new SpeechSynthesisUtterance('语音准备');
  utterance.lang = 'zh-CN';
  utterance.volume = 0;
  utterance.rate = 1;
  utterance.pitch = 1;
  return utterance;
}
