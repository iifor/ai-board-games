import { useCallback, useEffect, useRef, useState } from 'react';

const HOST_VOICE_PROFILE = { role: 'host', rate: 0.95, pitch: 1, volume: 1 };

const PLAYER_VOICE_PROFILES = {
  1: { role: 'child', rate: 1.18, pitch: 1.72, volume: 1 },
  2: { role: 'male', rate: 0.94, pitch: 0.62, volume: 1 },
  3: { role: 'male', rate: 0.86, pitch: 0.72, volume: 0.98 },
  4: { role: 'male', rate: 0.9, pitch: 0.58, volume: 0.96 },
  5: { role: 'male', rate: 1.06, pitch: 0.82, volume: 1 },
  6: { role: 'male', rate: 0.88, pitch: 0.54, volume: 0.96 },
  7: { role: 'female', rate: 0.96, pitch: 1.34, volume: 1 },
  8: { role: 'child', rate: 1.2, pitch: 1.82, volume: 1 },
  9: { role: 'female', rate: 1.12, pitch: 1.5, volume: 0.98 },
  10: { role: 'female', rate: 0.92, pitch: 1.18, volume: 0.96 },
  11: { role: 'male', rate: 1, pitch: 0.74, volume: 1 },
  12: { role: 'female', rate: 0.88, pitch: 1.28, volume: 0.98 }
};

const VOICE_KEYWORDS = {
  child: [
    'child',
    'kid',
    'girl',
    'boy',
    '儿童',
    '童声',
    '孩',
    'yaoyao',
    'xiaobei'
  ],
  female: [
    'female',
    'woman',
    'girl',
    '女',
    'xiaoxiao',
    'xiaoyi',
    'xiaobei',
    'xiaoni',
    'xiaomo',
    'xiaoqiu',
    'xiaorui',
    'ting-ting',
    'tingting',
    'mei-jia',
    'meijia',
    'sin-ji',
    'sinji',
    'hanhan',
    'huihui'
  ],
  male: [
    'male',
    'man',
    'boy',
    '男',
    'yunxi',
    'yunyang',
    'yunjian',
    'yunhao',
    'kang-kang',
    'kangkang',
    'li-mu',
    'limu'
  ]
};

function getChineseVoices() {
  if (!window.speechSynthesis) return [];
  return window.speechSynthesis
    .getVoices()
    .filter((voice) => /^zh|Chinese|Mandarin|Cantonese/i.test(`${voice.lang} ${voice.name}`));
}

function getVoiceForItem(item, voices, profile) {
  if (voices.length === 0) return null;
  if (!item.playerId) return voices[0] || null;

  const matchingVoices = voices.filter((voice) => voiceMatchesRole(voice, profile.role));
  const candidates = matchingVoices.length ? matchingVoices : voices;
  const numericId = getNumericPlayerId(item.playerId);
  return candidates[(numericId - 1) % candidates.length] || candidates[0] || null;
}

function voiceMatchesRole(voice, role) {
  const keywords = VOICE_KEYWORDS[role] || [];
  if (keywords.length === 0) return false;
  const voiceText = `${voice.name} ${voice.lang} ${voice.voiceURI}`.toLowerCase();
  return keywords.some((keyword) => voiceText.includes(keyword.toLowerCase()));
}

function getProfileForItem(item) {
  if (!item.playerId) return HOST_VOICE_PROFILE;
  const numericId = getNumericPlayerId(item.playerId);
  return PLAYER_VOICE_PROFILES[item.playerId] || {
    role: numericId % 3 === 0 ? 'child' : numericId % 2 === 0 ? 'male' : 'female',
    rate: 0.92 + (numericId % 5) * 0.06,
    pitch: 0.78 + (numericId % 7) * 0.1,
    volume: 1
  };
}

function getNumericPlayerId(playerId) {
  const numeric = Number(playerId);
  if (Number.isFinite(numeric) && numeric > 0) return numeric;
  const text = String(playerId || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = (hash * 31 + text.charCodeAt(index)) % 997;
  }
  return (hash % 12) + 1;
}

function clampFinite(value, fallback, min, max) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.max(min, Math.min(max, numeric));
}

function normalizeVoiceProfile(profile) {
  return {
    role: profile?.role || 'host',
    rate: clampFinite(profile?.rate, 1, 0.1, 10),
    pitch: clampFinite(profile?.pitch, 1, 0, 2),
    volume: clampFinite(profile?.volume, 1, 0, 1)
  };
}

function getSpeechFallbackDelay(text) {
  const length = String(text || '').length;
  return Math.max(120000, Math.min(600000, 30000 + length * 1200));
}

async function fetchServerSpeechAudio(text, voicePackageId) {
  const response = await fetch('/api/toc/voice/synthesize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voicePackageId })
  });
  if (!response.ok) throw new Error(await response.text());
  return response.blob();
}

export function useSpeechQueue() {
  const [speechEnabled, setSpeechEnabledState] = useState(true);
  const queueRef = useRef([]);
  const speakingRef = useRef(false);
  const currentItemRef = useRef(null);
  const cancellingRef = useRef(false);
  const enabledRef = useRef(true);
  const voicesRef = useRef([]);
  const audioRef = useRef(null);
  const endTimerRef = useRef(null);
  const resumeTimerRef = useRef(null);

  const clearResumeTimer = useCallback(() => {
    if (!resumeTimerRef.current) return;
    window.clearInterval(resumeTimerRef.current);
    resumeTimerRef.current = null;
  }, []);

  const playNext = useCallback(() => {
    if (!enabledRef.current || speakingRef.current) return;
    if (cancellingRef.current) {
      window.setTimeout(playNext, 80);
      return;
    }
    const item = queueRef.current.shift();
    if (!item) return;

    currentItemRef.current = item;
    speakingRef.current = true;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      const shouldRunEnd = !cancellingRef.current;
      clearResumeTimer();
      if (endTimerRef.current) {
        window.clearTimeout(endTimerRef.current);
        endTimerRef.current = null;
      }
      speakingRef.current = false;
      currentItemRef.current = null;
      if (shouldRunEnd) item.onEnd?.();
      if (shouldRunEnd) playNext();
    };

    const playBrowserSpeech = () => {
      if (cancellingRef.current || !enabledRef.current) {
        window.setTimeout(finish, 0);
        return;
      }
      if (!window.speechSynthesis) {
        window.setTimeout(finish, 0);
        return;
      }
      if (voicesRef.current.length === 0) voicesRef.current = getChineseVoices();
      const utterance = new SpeechSynthesisUtterance(item.text);
      const profile = normalizeVoiceProfile(getProfileForItem(item));
      const voice = getVoiceForItem(item, voicesRef.current, profile);
      utterance.lang = 'zh-CN';
      utterance.rate = profile.rate;
      utterance.pitch = profile.pitch;
      utterance.volume = profile.volume;
      if (voice) {
        utterance.voice = voice;
        utterance.lang = voice.lang || 'zh-CN';
      }
      utterance.onstart = () => {
        if (!cancellingRef.current) item.onStart?.();
      };
      utterance.onend = finish;
      utterance.onerror = finish;
      try {
        if (cancellingRef.current || !enabledRef.current) {
          window.setTimeout(finish, 0);
          return;
        }
        window.speechSynthesis.resume?.();
        window.speechSynthesis.speak(utterance);
      } catch {
        window.setTimeout(finish, 0);
        return;
      }
      resumeTimerRef.current = window.setInterval(() => {
        if (window.speechSynthesis?.paused) window.speechSynthesis.resume?.();
      }, 1000);
      endTimerRef.current = window.setTimeout(finish, getSpeechFallbackDelay(item.text));
    };

    const playServerSpeech = async () => {
      try {
        item.onStart?.();
        const ownsUrl = !item.audioUrl;
        const url = item.audioUrl || URL.createObjectURL(await fetchServerSpeechAudio(item.text, item.voicePackageId));
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          if (ownsUrl) URL.revokeObjectURL(url);
          audioRef.current = null;
          finish();
        };
        audio.onerror = () => {
          if (ownsUrl) URL.revokeObjectURL(url);
          audioRef.current = null;
          if (cancellingRef.current || !enabledRef.current) {
            finish();
            return;
          }
          playBrowserSpeech();
        };
        audio.volume = clampFinite(item.volume, 1, 0, 1);
        await audio.play();
        endTimerRef.current = window.setTimeout(finish, getSpeechFallbackDelay(item.text));
      } catch {
        if (cancellingRef.current || !enabledRef.current) {
          finish();
          return;
        }
        playBrowserSpeech();
      }
    };

    if (item.audioUrl || item.voicePackageId) playServerSpeech();
    else playBrowserSpeech();
  }, [clearResumeTimer]);

  const cancel = useCallback(() => {
    queueRef.current = [];
    clearResumeTimer();
    if (endTimerRef.current) {
      window.clearTimeout(endTimerRef.current);
      endTimerRef.current = null;
    }
    speakingRef.current = false;
    currentItemRef.current = null;
    cancellingRef.current = true;
    if (audioRef.current) {
      audioRef.current.onended = null;
      audioRef.current.onerror = null;
      audioRef.current.pause();
      audioRef.current.src = '';
      audioRef.current.load?.();
      audioRef.current = null;
    }
    window.speechSynthesis?.cancel();
    window.setTimeout(() => {
      cancellingRef.current = false;
    }, 0);
  }, [clearResumeTimer]);

  const unlock = useCallback(() => {
    if (!enabledRef.current || !window.speechSynthesis || speakingRef.current) return;
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance('语音准备');
      utterance.lang = 'zh-CN';
      utterance.volume = 0;
      utterance.rate = 1;
      utterance.pitch = 1;
      window.speechSynthesis.speak(utterance);
      window.speechSynthesis.resume?.();
    } catch {
      // Browser speech engines can throw before voices are ready; real playback will retry later.
    }
  }, []);

  const setSpeechEnabled = useCallback((value) => {
    const next = typeof value === 'function' ? value(enabledRef.current) : value;
    enabledRef.current = next;
    setSpeechEnabledState(next);
    if (!next) cancel();
    else {
      unlock();
      playNext();
    }
  }, [cancel, playNext, unlock]);

  const speak = useCallback((text, onEnd, options = {}) => {
    if (!enabledRef.current) return false;
    queueRef.current.push({ text, onEnd, ...options });
    if (cancellingRef.current) window.setTimeout(playNext, 80);
    else playNext();
    return true;
  }, [playNext]);

  useEffect(() => {
    if (!window.speechSynthesis) return undefined;
    const refreshVoices = () => {
      voicesRef.current = getChineseVoices();
    };

    refreshVoices();
    window.speechSynthesis.addEventListener?.('voiceschanged', refreshVoices);
    window.speechSynthesis.onvoiceschanged = refreshVoices;

    return () => {
      window.speechSynthesis.removeEventListener?.('voiceschanged', refreshVoices);
      if (window.speechSynthesis.onvoiceschanged === refreshVoices) {
        window.speechSynthesis.onvoiceschanged = null;
      }
    };
  }, []);

  useEffect(() => cancel, [cancel]);

  return {
    speechEnabled,
    setSpeechEnabled,
    speak,
    unlock,
    cancel
  };
}
