import { useSyncExternalStore } from 'react';
import type { SegmentControl, SegmentState } from '../playback/segment';

const IDLE: SegmentState = { rate: 1, muted: false, progress: null };
const idle = () => IDLE;
const never = () => () => {};

/** 订阅当前这段的播放状态（倍速、静音、进度）；没有在播时返回空闲状态。只有订阅的组件会随进度重渲染 */
export function useSegmentState(control: SegmentControl | null | undefined): SegmentState {
  return useSyncExternalStore(control?.subscribe ?? never, control?.getSnapshot ?? idle, control?.getSnapshot ?? idle);
}
