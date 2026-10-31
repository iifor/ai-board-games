import type { AiCallDto, MatchDetailDto } from '@battle/shared';
import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../../services/http';
import { fetchAiCalls, fetchMatchDetail, fetchMatchLog, type LogEntryDto } from '../../../services/matches';
import { isTerminal } from '../utils';

const POLL_MS = 2000;

export interface MatchDetailState {
  readonly detail: MatchDetailDto | null;
  readonly log: readonly LogEntryDto[];
  readonly calls: readonly AiCallDto[];
  readonly error: string | null;
}

/** 对局详情、完整日志与 AI 调用；未结束时每 2 秒刷新 */
export function useMatchDetail(matchId: string) {
  const [state, setState] = useState<MatchDetailState>({ detail: null, log: [], calls: [], error: null });

  const load = useCallback(async () => {
    try {
      const [detail, log, calls] = await Promise.all([fetchMatchDetail(matchId), fetchMatchLog(matchId), fetchAiCalls(matchId)]);
      setState({ detail, log, calls, error: null });
      return detail;
    } catch (error) {
      setState((prev) => ({ ...prev, error: errorMessage(error) }));
      return null;
    }
  }, [matchId]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    const tick = async () => {
      const detail = await load();
      if (!stopped && (!detail || !isTerminal(detail.status))) timer = setTimeout(() => void tick(), POLL_MS);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [load]);

  return { ...state, reload: load };
}
