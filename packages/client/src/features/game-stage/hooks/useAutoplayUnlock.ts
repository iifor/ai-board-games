import { useCallback, useSyncExternalStore } from 'react';
import { isAutoplayBlocked, subscribeAutoplayBlocked, unlockAudio } from '../playback/audioUnlock';

/** 声音是否被浏览器拦截，以及在点击里解锁的动作；解锁失败时提示保留，用户可以再点一次 */
export function useAutoplayUnlock(): { readonly blocked: boolean; readonly unlock: () => void } {
  const blocked = useSyncExternalStore(subscribeAutoplayBlocked, isAutoplayBlocked, () => false);
  const unlock = useCallback(() => {
    unlockAudio().catch((error: unknown) => console.error('[playback] 开启声音失败', error));
  }, []);
  return { blocked, unlock };
}
