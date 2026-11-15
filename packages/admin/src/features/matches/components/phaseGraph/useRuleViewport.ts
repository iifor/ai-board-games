import { useCallback, useLayoutEffect, useRef, useState, type PointerEvent } from 'react';

type Point = { x: number; y: number };
export const MIN_SCALE = 0.75;
export const MAX_SCALE = 2;

/** 所有定位都使用布局坐标；缩放只改变画布，不改变阶段连线。 */
export function useRuleViewport(selected: Point | undefined) {
  const viewport = useRef<HTMLDivElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const nextCenter = useRef<Point | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  const center = useCallback((point: Point, zoom = scale) => {
    const el = viewport.current;
    const canvas = board.current;
    if (!el?.clientWidth || !el.clientHeight || !canvas) return;
    el.scrollTo(canvas.offsetLeft + point.x * zoom - el.clientWidth / 2,
      canvas.offsetTop + point.y * zoom - el.clientHeight / 2);
  }, [scale]);

  function zoom(value: number) {
    const el = viewport.current;
    const canvas = board.current;
    const next = Math.min(MAX_SCALE, Math.max(MIN_SCALE, value));
    if (!el || !canvas || next === scale) return;
    nextCenter.current = {
      x: (el.scrollLeft + el.clientWidth / 2 - canvas.offsetLeft) / scale,
      y: (el.scrollTop + el.clientHeight / 2 - canvas.offsetTop) / scale,
    };
    setScale(next);
  }

  function focus(point: Point) {
    nextCenter.current = null;
    if (scale < 1) setScale(1);
    center(point, Math.max(scale, 1));
  }

  useLayoutEffect(() => {
    const point = nextCenter.current ?? selected;
    nextCenter.current = null;
    const el = viewport.current;
    if (!point || !el) return;
    const position = () => center(point);
    position();
    const observer = new ResizeObserver(position);
    observer.observe(el);
    return () => observer.disconnect();
  }, [center, selected]);

  function startDrag(event: PointerEvent<HTMLDivElement>) {
    if (event.pointerType !== 'mouse' || event.button !== 0 || (event.target as Element).closest('button')) return;
    const el = event.currentTarget;
    drag.current = { x: event.clientX, y: event.clientY, left: el.scrollLeft, top: el.scrollTop };
    el.setPointerCapture(event.pointerId);
    el.dataset.dragging = 'true';
  }
  function moveDrag(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) event.currentTarget.scrollTo(drag.current.left + drag.current.x - event.clientX,
      drag.current.top + drag.current.y - event.clientY);
  }
  function endDrag(event: PointerEvent<HTMLDivElement>) {
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
  }
  return { viewport, board, scale, zoom, focus, center, dragProps: {
    onPointerDown: startDrag, onPointerMove: moveDrag, onLostPointerCapture: endDrag,
  } };
}
