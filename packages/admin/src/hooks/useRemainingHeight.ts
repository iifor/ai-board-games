import { useLayoutEffect, useRef, useState } from 'react';

/** 根据内容区在页面中的起点计算剩余高度；滚动页面时保持图区稳定。 */
export function useRemainingHeight(minimum: number, bottomGap = 32, sectionSelector?: string) {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(minimum);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => {
      if (!el.getClientRects().length) return;
      const elementTop = el.getBoundingClientRect().top;
      let top = elementTop + window.scrollY;
      // 长页面上的第二个工作区按其自身工具栏预留高度，滚到该区后仍有完整画布。
      const section = sectionSelector && el.closest(sectionSelector);
      if (section) {
        top = elementTop - section.getBoundingClientRect().top + 12;
      }
      setHeight(Math.max(minimum, Math.floor(window.innerHeight - top - bottomGap)));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    const detail = el.closest('.match-detail');
    if (detail) observer.observe(detail);
    window.addEventListener('resize', update);
    return () => { observer.disconnect(); window.removeEventListener('resize', update); };
  }, [minimum, bottomGap, sectionSelector]);
  return { ref, height };
}
