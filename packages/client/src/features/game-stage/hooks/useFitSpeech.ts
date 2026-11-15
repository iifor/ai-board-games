import { useLayoutEffect, useRef } from 'react';

/** 优先用满中央高度；仍放不下时缩小字号，整段保持在同一屏。 */
export function useFitSpeech(content: unknown) {
  const trackRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLDivElement>(null);
  const textRef = useRef<HTMLParagraphElement>(null);
  useLayoutEffect(() => {
    const track = trackRef.current, message = messageRef.current, text = textRef.current;
    if (!track || !message || !text) return;
    let disposed = false;
    const measure = () => {
      if (disposed || !track.clientWidth || !track.clientHeight) return;
      text.style.removeProperty('--speech-fit-size');
      const base = parseFloat(getComputedStyle(text).fontSize);
      const style = getComputedStyle(message);
      const progress = track.querySelector('.subtitle-progress');
      const gap = parseFloat(getComputedStyle(track).rowGap) || 0;
      const available = Math.max(1, track.clientHeight - (progress?.getBoundingClientRect().height ?? 0) - gap
        - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom));
      const fits = () => text.scrollHeight <= available && text.scrollWidth <= text.clientWidth;
      if (!fits()) {
        let low = .5, high = base;
        // 二分查找保留尽可能大的字号，包含换行和显式空行的实际高度。
        for (let i = 0; i < 12; i++) {
          const size = (low + high) / 2;
          text.style.setProperty('--speech-fit-size', `${size}px`);
          if (fits()) low = size; else high = size;
        }
        text.style.setProperty('--speech-fit-size', `${Math.floor(low * 100) / 100}px`);
      }
      message.scrollTop = 0;
    };
    const observer = new ResizeObserver(measure);
    observer.observe(track);
    measure();
    void document.fonts?.ready.then(measure);
    return () => { disposed = true; observer.disconnect(); };
  }, [content]);
  return {trackRef, messageRef, textRef};
}
