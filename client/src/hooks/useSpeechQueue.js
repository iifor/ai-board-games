import { useCallback, useEffect, useRef, useState } from 'react';

export function useSpeechQueue() {
  const [speechEnabled, setSpeechEnabledState] = useState(false);
  const queueRef = useRef([]);
  const speakingRef = useRef(false);
  const currentItemRef = useRef(null);
  const cancellingRef = useRef(false);
  const enabledRef = useRef(false);

  const playNext = useCallback(() => {
    if (!enabledRef.current || speakingRef.current || !window.speechSynthesis) return;
    const item = queueRef.current.shift();
    if (!item) return;

    currentItemRef.current = item;
    speakingRef.current = true;
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1;
    utterance.pitch = 1;

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

  const speak = useCallback((text, onEnd) => {
    if (!enabledRef.current || !window.speechSynthesis) return;
    queueRef.current.push({ text, onEnd });
    playNext();
  }, [playNext]);

  useEffect(() => cancel, [cancel]);

  return {
    speechEnabled,
    setSpeechEnabled,
    speak,
    cancel
  };
}
