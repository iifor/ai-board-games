import type { MatchTraceDto } from '@battle/shared';
import { useEffect } from 'react';
import { useAsync, type AsyncState } from '../../hooks/useAsync';
import { onAdminViewResumed } from '../../services/traceInvalidation';
import { fetchTrace } from '../../services/traces';
import { isTerminal } from '../matches/utils';

export type MatchTraceState = AsyncState<MatchTraceDto | null> & { readonly reload: () => void };

export function useMatchTrace(matchId: string | null): MatchTraceState {
  const result = useAsync(() => matchId ? fetchTrace(matchId) : Promise.resolve(null), [matchId]);
  const {reload} = result;
  useEffect(() => matchId ? onAdminViewResumed(reload) : undefined, [matchId, reload]);
  const running = matchId && result.status === 'ready' && result.data && !isTerminal(result.data.match.status);
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(reload, 4000);
    return () => window.clearInterval(timer);
  }, [running, reload]);
  return result;
}
