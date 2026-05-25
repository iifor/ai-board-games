import { useCallback, useEffect, useRef, useState } from 'react';
import type { QueueItem } from '../types';
import type { SpeechMedia } from '@ai-presenter/shared/types/speechTypes';
import {
  getChineseVoices,
  getVoiceForItem,
  getProfileForItem,
  clampFinite,
  normalizeVoiceProfile,
  getSpeechFallbackDelay,
  fetchServerSpeechMedia,
  getSpeechPlaybackText
} from '../utils/speech';

export function useSpeechQueue() {
  const [speechEnabled, setSpeechEnabledState] = useState<boolean>(true);
  const queueRef = useRef<QueueItem[]>([]);
  const speakingRef = useRef<boolean>(false);
  const currentItemRef = useRef<QueueItem | null>(null);
  const cancellingRef = useRef<boolean>(false);
  const enabledRef = useRef<boolean>(true);
  const voicesRef = useRef<SpeechSynthesisVoice[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const endTimerRef = useRef<number | null>(null);
  const resumeTimerRef = useRef<number | null>(null);
  const audioTimeRafRef = useRef<number | null>(null);

  const clearResumeTimer = useCallback(() => {
    if (!resumeTimerRef.current) return;
    window.clearInterval(resumeTimerRef.current);
    resumeTimerRef.current = null;
  }, []);

  const clearAudioTimeRaf = useCallback(() => {
    if (!audioTimeRafRef.current) return;
    window.cancelAnimationFrame(audioTimeRafRef.current);
    audioTimeRafRef.current = null;
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
      clearAudioTimeRaf();
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
      const spokenText = getSpeechPlaybackText(item.text);
      item.onTimeChange?.(null);
      if (!spokenText) {
        item.onStart?.();
        window.setTimeout(finish, 0);
        return;
      }
      const utterance = new SpeechSynthesisUtterance(spokenText);
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
      endTimerRef.current = window.setTimeout(finish, getSpeechFallbackDelay(spokenText));
    };

    const playServerSpeech = async () => {
      let fallbackStarted = false;
      const fallbackToBrowserSpeech = () => {
        if (fallbackStarted) return;
        fallbackStarted = true;
        clearAudioTimeRaf();
        item.onTimeChange?.(null);
        if (cancellingRef.current || !enabledRef.current) {
          finish();
          return;
        }
        playBrowserSpeech();
      };

      try {
        const spokenText = getSpeechPlaybackText(item.text);
        if (!spokenText) {
          item.onStart?.();
          window.setTimeout(finish, 0);
          return;
        }
        const media: SpeechMedia = item.audioUrl
          ? {
            text: spokenText,
            audioUrl: item.audioUrl,
            audioMimeType: item.audioMimeType || 'audio/mpeg',
            wordBoundaries: item.wordBoundaries || null
          }
          : await fetchServerSpeechMedia(spokenText, item.voicePackageId);
        const url = media.audioUrl;
        const audio = new Audio(url);
        audioRef.current = audio;
        audio.onended = () => {
          clearAudioTimeRaf();
          audioRef.current = null;
          finish();
        };
        audio.onerror = () => {
          clearAudioTimeRaf();
          audioRef.current = null;
          fallbackToBrowserSpeech();
        };
        audio.volume = clampFinite(item.volume, 1, 0, 1);
        await audio.play();
        if (!cancellingRef.current) {
          item.onStart?.(media);
          startAudioTimeUpdates(audio, item);
        }
        endTimerRef.current = window.setTimeout(finish, getSpeechFallbackDelay(spokenText));
      } catch {
        fallbackToBrowserSpeech();
      }
    };

    if (item.audioUrl || item.voicePackageId) playServerSpeech();
    else playBrowserSpeech();
    function startAudioTimeUpdates(audio: HTMLAudioElement, item: QueueItem) {
      clearAudioTimeRaf();
      const tick = () => {
        if (audioRef.current !== audio || cancellingRef.current || !enabledRef.current) {
          clearAudioTimeRaf();
          return;
        }
        item.onTimeChange?.(audio.currentTime * 1000);
        audioTimeRafRef.current = window.requestAnimationFrame(tick);
      };
      item.onTimeChange?.(audio.currentTime * 1000);
      audioTimeRafRef.current = window.requestAnimationFrame(tick);
    }
  }, [clearAudioTimeRaf, clearResumeTimer]);

  const cancel = useCallback(() => {
    queueRef.current = [];
    clearResumeTimer();
    clearAudioTimeRaf();
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
  }, [clearAudioTimeRaf, clearResumeTimer]);

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

  const setSpeechEnabled = useCallback((value: boolean | ((prev: boolean) => boolean)) => {
    const next = typeof value === 'function' ? value(enabledRef.current) : value;
    enabledRef.current = next;
    setSpeechEnabledState(next);
    if (!next) cancel();
    else {
      unlock();
      playNext();
    }
  }, [cancel, playNext, unlock]);

  const speak = useCallback((text: string, onEnd?: () => void, options: Partial<QueueItem> = {}): boolean => {
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
