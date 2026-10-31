import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../services/http';

export type AsyncState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly message: string }
  | { readonly status: 'ready'; readonly data: T };

/** 加载一次性数据，提供 loading / error / ready 三态与重试 */
export function useAsync<T>(load: () => Promise<T>, deps: readonly unknown[]): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ status: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((value) => value + 1), []);

  useEffect(() => {
    let cancelled = false;
    setState({ status: 'loading' });
    load().then(
      (data) => !cancelled && setState({ status: 'ready', data }),
      (error: unknown) => !cancelled && setState({ status: 'error', message: errorMessage(error) }),
    );
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- 由调用方通过 deps 控制重新加载
  }, [...deps, attempt]);

  return { ...state, reload };
}
