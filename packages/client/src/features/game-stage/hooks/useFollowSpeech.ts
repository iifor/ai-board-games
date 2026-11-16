import { useEffect, useLayoutEffect, useRef } from 'react';
import { progressFraction, type SegmentControl } from '../playback/segment';

/** 每这么久按播放进度重排一次滚动位置（计时进度不会主动通知，需要轮询） */
const FOLLOW_INTERVAL_MS = 250;

/** 读到第 fraction 处时容器应滚到的位置：让正在读的那一行停在可视区上方约 40% 处 */
export function followScrollTop(fraction: number, scrollHeight: number, clientHeight: number): number {
  const max = Math.max(0, scrollHeight - clientHeight);
  return Math.round(Math.min(max, Math.max(0, fraction * scrollHeight - clientHeight * 0.4)));
}

/**
 * 手机发言卡跟读：换段时回到顶部，播放期间按进度把正在读的位置滚进可视区，
 * 长发言不会停在卡片下方看不到的地方，上一段手动滚过的位置也不会带到下一段。
 */
export function useFollowSpeech<T extends HTMLElement>(seq: number | undefined, control: SegmentControl | null) {
  const ref = useRef<T | null>(null);
  useLayoutEffect(() => {
    if (ref.current) ref.current.scrollTop = 0;
  }, [seq]);
  useEffect(() => {
    if (!control) return;
    const timer = setInterval(() => {
      const box = ref.current;
      if (!box || box.scrollHeight <= box.clientHeight) return;
      const fraction = progressFraction(control.getSnapshot().progress, Date.now());
      box.scrollTop = followScrollTop(fraction, box.scrollHeight, box.clientHeight);
    }, FOLLOW_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [control]);
  return ref;
}
