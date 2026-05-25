import type { MutableRefObject } from 'react';

export function clearWindowInterval(ref: MutableRefObject<number | null>): void {
  if (!ref.current) return;
  window.clearInterval(ref.current);
  ref.current = null;
}

export function clearWindowTimeout(ref: MutableRefObject<number | null>): void {
  if (!ref.current) return;
  window.clearTimeout(ref.current);
  ref.current = null;
}

export function clearAnimationFrame(ref: MutableRefObject<number | null>): void {
  if (!ref.current) return;
  window.cancelAnimationFrame(ref.current);
  ref.current = null;
}
