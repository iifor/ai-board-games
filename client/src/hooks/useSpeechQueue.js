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
  return candidates[(Number(item.playerId) - 1) % candidates.length] || candidates[0] || null;
}

function voiceMatchesRole(voice, role) {
  const keywords = VOICE_KEYWORDS[role] || [];
  if (keywords.length === 0) return false;
  const voiceText = `${voice.name} ${voice.lang} ${voice.voiceURI}`.toLowerCase();
  return keywords.some((keyword) => voiceText.includes(keyword.toLowerCase()));
}

function getProfileForItem(item) {
  if (!item.playerId) return HOST_VOICE_PROFILE;
  return PLAYER_VOICE_PROFILES[item.playerId] || {
    role: Number(item.playerId) % 3 === 0 ? 'child' : Number(item.playerId) % 2 === 0 ? 'male' : 'female',
    rate: 0.92 + (Number(item.playerId) % 5) * 0.06,
    pitch: 0.78 + (Number(item.playerId) % 7) * 0.1,
    volume: 1
  };
}

export function useSpeechQueue() {
  const [speechEnabled, setSpeechEnabledState] = useState(false);
  const queueRef = useRef([]);
  const speakingRef = useRef(false);
  const currentItemRef = useRef(null);
  const cancellingRef = useRef(false);
  const enabledRef = useRef(false);
  const voicesRef = useRef([]);

  const playNext = useCallback(() => {
    if (!enabledRef.current || speakingRef.current || !window.speechSynthesis) return;
    if (voicesRef.current.length === 0) voicesRef.current = getChineseVoices();
    const item = queueRef.current.shift();
    if (!item) return;

    currentItemRef.current = item;
    speakingRef.current = true;
    const utterance = new SpeechSynthesisUtterance(item.text);
    const profile = getProfileForItem(item);
    const voice = getVoiceForItem(item, voicesRef.current, profile);
    utterance.lang = 'zh-CN';
    utterance.rate = profile.rate;
    utterance.pitch = profile.pitch;
    utterance.volume = profile.volume;
    if (voice) {
      utterance.voice = voice;
      utterance.lang = voice.lang || 'zh-CN';
    }

    const finish = () => {
      const shouldRunEnd = !cancellingRef.current;
      speakingRef.current = false;
      currentItemRef.current = null;
      if (shouldRunEnd) item.onEnd?.();
      if (shouldRunEnd) playNext();
    };

    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }, []);

  const cancel = useCallback(() => {
    queueRef.current = [];
    speakingRef.current = false;
    currentItemRef.current = null;
    cancellingRef.current = true;
    window.speechSynthesis?.cancel();
    window.setTimeout(() => {
      cancellingRef.current = false;
    }, 0);
  }, []);

  const setSpeechEnabled = useCallback((value) => {
    const next = typeof value === 'function' ? value(enabledRef.current) : value;
    enabledRef.current = next;
    setSpeechEnabledState(next);
    if (!next) cancel();
    else playNext();
  }, [cancel, playNext]);

  const speak = useCallback((text, onEnd, options = {}) => {
    if (!enabledRef.current || !window.speechSynthesis) return;
    queueRef.current.push({ text, onEnd, ...options });
    playNext();
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
    cancel
  };
}
