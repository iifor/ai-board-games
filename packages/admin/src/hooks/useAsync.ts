import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../services/http';

export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: T };

/** 加载数据，提供 loading / error / ready 三态与 reload；reload 时保留旧数据避免闪烁 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> & { reload: () => void; invalidate: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);
  const invalidate = useCallback(() => {
    generation.current++;
    setState({ status: 'loading' });
    reload();
  }, [reload]);

  useEffect(() => {
    let cancelled = false;
    const version = generation.current;
    load().then(
      (data) => !cancelled && version === generation.current && setState({ status: 'ready', data }),
      (error: unknown) => !cancelled && version === generation.current && setState({ status: 'error', message: errorMessage(error) }),
    );
    return () => {
      cancelled = true;
    };
    // 由调用方通过 deps 控制重新加载
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, attempt]);

  return { ...state, reload, invalidate };
}
