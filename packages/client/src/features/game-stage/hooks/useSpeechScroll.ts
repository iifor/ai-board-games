import { useLayoutEffect, useRef } from 'react';
import { progressFraction, type SegmentControl } from '../playback/segment';

/** 完整对话共用滚动容器。长发言随进度展开，手动回看后停跟随，换人时重新定位。 */
export function useSpeechScroll(control: SegmentControl | null, sequence: number) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const currentRef = useRef<HTMLElement>(null);
  const manual = useRef(false);
  const lastSequence = useRef<number | null>(null);
  useLayoutEffect(() => {
    const scroll = scrollRef.current;
    const current = currentRef.current;
    if (!scroll || !current) return;
    if (lastSequence.current !== sequence) {
      manual.current = false;
      lastSequence.current = sequence;
    }
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let frame = 0;
    let firstScreen = 0;
    let lastScreen = 0;
    function follow() {
      cancelAnimationFrame(frame);
      if (!scroll || manual.current || motion.matches) return;
      const progress = control?.progress ?? null;
      const fraction = control ? progressFraction(progress, Date.now()) : 1;
      // 给首尾两屏各留一点完整阅读时间。
      scroll.scrollTop = firstScreen + (lastScreen - firstScreen) * Math.max(0, Math.min(1, (fraction - 0.08) / 0.84));
      if (progress?.kind === 'timed' && fraction < 1) frame = requestAnimationFrame(follow);
    }
    const measure = () => {
      lastScreen = Math.max(0, scroll.scrollHeight - scroll.clientHeight);
      const currentTop = current.getBoundingClientRect().top - scroll.getBoundingClientRect().top + scroll.scrollTop - scroll.clientTop;
      firstScreen = Math.min(lastScreen, Math.max(0, currentTop - 12));
      if (motion.matches && !manual.current) scroll.scrollTop = firstScreen;
      follow();
    };
    const resize = new ResizeObserver(measure);
    resize.observe(scroll);
    resize.observe(current);
    measure();
    const unsubscribe = control?.subscribe(follow);
    motion.addEventListener('change', measure);
    return () => {
      cancelAnimationFrame(frame);
      resize.disconnect();
      unsubscribe?.();
      motion.removeEventListener('change', measure);
    };
  }, [control, sequence]);
  return { scrollRef, currentRef, readManually: () => { manual.current = true; } };
}
