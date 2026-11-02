import type { AiCallDto, MatchDetailDto } from '@battle/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../../services/http';
import { fetchAiCalls, fetchMatchDetail, fetchMatchLog, type LogEntryDto } from '../../../services/matches';
import { isTerminal, progressChanged, progressMarkerOf, type ProgressMarker } from '../utils';

const POLL_MS = 2000;

export interface MatchDetailState {
  readonly detail: MatchDetailDto | null;
  readonly log: readonly LogEntryDto[];
  readonly calls: readonly AiCallDto[];
  readonly error: string | null;
}

const EMPTY: MatchDetailState = { detail: null, log: [], calls: [], error: null };

/**
 * 对局详情、完整日志与 AI 调用。未结束时每 2 秒只轮询详情；
 * 完整日志与 AI 调用只在事件进度（lastSeq）或状态变化时重新拉取，reload 则强制全量刷新
 */
export function useMatchDetail(matchId: string) {
  const [state, setState] = useState<MatchDetailState>(EMPTY);
  const markerRef = useRef<ProgressMarker | null>(null);

  const load = useCallback(async (force = false) => {
    try {
      const detail = await fetchMatchDetail(matchId);
      const marker = progressMarkerOf(detail);
      if (force || progressChanged(markerRef.current, marker)) {
        const [log, calls] = await Promise.all([fetchMatchLog(matchId), fetchAiCalls(matchId)]);
        markerRef.current = marker;
        setState({ detail, log, calls, error: null });
      } else {
        setState((prev) => ({ ...prev, detail, error: null }));
      }
      return detail;
    } catch (error) {
      setState((prev) => ({ ...prev, error: errorMessage(error) }));
      return null;
    }
  }, [matchId]);

  const reload = useCallback(() => load(true), [load]);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let stopped = false;
    markerRef.current = null;
    setState(EMPTY);
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

  return { ...state, reload };
}
