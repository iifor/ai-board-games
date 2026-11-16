import { useSyncExternalStore } from 'react';
import { NARROW_STAGE_MAX_WIDTH } from '../constants';

// 与桌面样式的 min-width: 861px 严格互补：缩放后出现 860.5px 这类小数宽度时两边不会都不生效
const QUERY = `(width < ${NARROW_STAGE_MAX_WIDTH + 1}px)`;

function subscribe(onChange: () => void): () => void {
  if (typeof window === 'undefined' || !window.matchMedia) return () => {};
  const media = window.matchMedia(QUERY);
  media.addEventListener('change', onChange);
  return () => media.removeEventListener('change', onChange);
}

const snapshot = () => typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia(QUERY).matches;

/** 是否是手机宽度的舞台（与 CSS 断点一致）；旋转屏幕、调整窗口时随之切换桌面 / 手机舞台 */
export function useNarrowStage(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
