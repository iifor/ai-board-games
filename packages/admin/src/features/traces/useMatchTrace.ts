import type { MatchTraceDto } from '@battle/shared';
import { useEffect } from 'react';
import { useAsync, type AsyncState } from '../../hooks/useAsync';
import { onAdminViewResumed } from '../../services/traceInvalidation';
import { fetchTrace } from '../../services/traces';
import { isTerminal } from '../matches/utils';
import { TRACE_POLL_MS } from './constants';

export type MatchTraceState = AsyncState<MatchTraceDto | null> & { readonly reload: () => void };

/**
 * 对局调用链；对局未结束时轮询。下一次轮询只在上一次结果落定（data 换成新对象）后才安排，
 * 慢请求不会叠在一起；加载失败时停在错误态，由页面的重试恢复。
 */
export function useMatchTrace(matchId: string | null): MatchTraceState {
  const result = useAsync(() => matchId ? fetchTrace(matchId) : Promise.resolve(null), [matchId]);
  const { reload } = result;
  useEffect(() => matchId ? onAdminViewResumed(reload) : undefined, [matchId, reload]);
  const data = result.status === 'ready' ? result.data : null;
  const running = matchId !== null && data !== null && !isTerminal(data.match.status);
  useEffect(() => {
    if (!running) return;
    const timer = window.setTimeout(reload, TRACE_POLL_MS);
    return () => window.clearTimeout(timer);
  }, [running, reload, data]);
  return result;
}
