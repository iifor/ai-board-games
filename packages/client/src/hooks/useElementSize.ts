import { useEffect, useState, type RefObject } from 'react';

export interface ElementSize {
  readonly width: number;
  readonly height: number;
}

/** 元素的布局尺寸（ResizeObserver，取整）；量到之前为 null；尺寸没变时返回同一个对象 */
export function useElementSize(ref: RefObject<HTMLElement | null>): ElementSize | null {
  const [size, setSize] = useState<ElementSize | null>(null);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const update = () => {
      const rect = element.getBoundingClientRect();
      const width = Math.round(rect.width);
      const height = Math.round(rect.height);
      setSize((prev) => (prev && prev.width === width && prev.height === height ? prev : { width, height }));
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [ref]);
  return size;
}
