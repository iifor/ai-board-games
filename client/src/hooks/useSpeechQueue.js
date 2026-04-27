import { useCallback, useEffect, useRef, useState } from 'react';

export function useSpeechQueue() {
  const [speechEnabled, setSpeechEnabled] = useState(false);
  const queueRef = useRef([]);
  const speakingRef = useRef(false);

  const playNext = useCallback(() => {
    if (!speechEnabled || speakingRef.current || !window.speechSynthesis) return;
    const item = queueRef.current.shift();
    if (!item) return;

    speakingRef.current = true;
    const utterance = new SpeechSynthesisUtterance(item.text);
    utterance.lang = 'zh-CN';
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.onend = () => {
      speakingRef.current = false;
      item.onEnd?.();
      playNext();
    };
    utterance.onerror = () => {
      speakingRef.current = false;
      item.onEnd?.();
      playNext();
    };
    window.speechSynthesis.speak(utterance);
  }, [speechEnabled]);

  const speak = useCallback((text, onEnd) => {
    if (!speechEnabled || !window.speechSynthesis) {
      onEnd?.();
      return;
    }
    queueRef.current.push({ text, onEnd });
    playNext();
  }, [playNext, speechEnabled]);

  const cancel = useCallback(() => {
    queueRef.current = [];
    speakingRef.current = false;
    window.speechSynthesis?.cancel();
  }, []);

  useEffect(() => {
    if (!speechEnabled) cancel();
    else playNext();
  }, [cancel, playNext, speechEnabled]);

  useEffect(() => cancel, [cancel]);

  return {
    speechEnabled,
    setSpeechEnabled,
    speak,
    cancel
  };
}
