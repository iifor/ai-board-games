import { useLayoutEffect, useState, type RefObject } from 'react';
import type { SeatAnchor } from '../animation/skillTypes';

export interface SeatAnchors {
  readonly seats: ReadonlyMap<number, SeatAnchor>;
  readonly width: number;
  readonly height: number;
}

/** 读取实际立绘坐标：同时适配桌面椭圆、窄屏网格和座位缩放。 */
export function useSeatAnchors(root: RefObject<HTMLDivElement | null>, active: boolean): SeatAnchors {
  const [anchors, setAnchors] = useState<SeatAnchors>({ seats: new Map(), width: 0, height: 0 });
  useLayoutEffect(() => {
    const element = root.current;
    if (!active || !element) return;
    const measure = () => {
      const bounds = element.getBoundingClientRect();
      const seats = new Map<number, SeatAnchor>();
      for (const seat of element.querySelectorAll<HTMLElement>('[data-seat-trigger]')) {
        const figure = seat.querySelector('.seat-figure') ?? seat;
        const rect = figure.getBoundingClientRect();
        seats.set(Number(seat.dataset['seatTrigger']), { x: rect.left + rect.width / 2 - bounds.left,
          y: rect.top + rect.height * .52 - bounds.top, width: rect.width, height: rect.height });
      }
      setAnchors((old) => {
        const same = old.width === bounds.width && old.height === bounds.height && old.seats.size === seats.size && [...seats].every(([n, at]) => {
          const before = old.seats.get(n);
          return before && Math.abs(before.x - at.x) < .5 && Math.abs(before.y - at.y) < .5 && Math.abs(before.height - at.height) < .5;
        });
        return same ? old : { seats, width: bounds.width, height: bounds.height };
      });
    };
    let frame = 0;
    const follow = () => {
      cancelAnimationFrame(frame);
      const until = performance.now() + 450;
      const tick = () => { measure(); if (performance.now() < until) frame = requestAnimationFrame(tick); };
      frame = requestAnimationFrame(tick);
    };
    const observer = new ResizeObserver(follow);
    observer.observe(element);
    for (const seat of element.querySelectorAll('[data-seat-trigger]')) observer.observe(seat);
    window.addEventListener('resize', follow);
    element.addEventListener('transitionend', measure);
    measure(); follow();
    return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', follow); element.removeEventListener('transitionend', measure); };
  }, [root, active]);
  return anchors;
}
