import type { AiCallDto, MatchDetailDto } from '@battle/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage, isNotFoundError } from '../../../services/http';
import { onAdminViewResumed, onTraceRemoved } from '../../../services/traceInvalidation';
import { fetchAiCalls, fetchMatchDetail, fetchMatchLog, type LogEntryDto } from '../../../services/matches';
import { startPolling } from '../../../utils/polling';
import { isTerminal, nextDetailPoll, progressChanged, progressMarkerOf, type DetailLoadOutcome, type ProgressMarker } from '../utils';

export interface MatchDetailState {
  readonly detail: MatchDetailDto | null;
  readonly log: readonly LogEntryDto[];
  readonly calls: readonly AiCallDto[];
  readonly error: string | null;
}

const EMPTY: MatchDetailState = { detail: null, log: [], calls: [], error: null };
const STALE: DetailLoadOutcome = { kind: 'stale' };

/**
 * 对局详情、完整日志与 AI 调用。未结束时每 2 秒只轮询详情（上一次结束后才安排下一次）；
 * 完整日志与 AI 调用只在事件进度（lastSeq）或状态变化时重新拉取，reload 则强制全量刷新。
 * 加载失败按退避放慢轮询，对局不存在（404）时停止；回到页面的核实刷新期间保留旧数据。
 */
export function useMatchDetail(matchId: string) {
  const [state, setState] = useState<MatchDetailState>(EMPTY);
  const markerRef = useRef<ProgressMarker | null>(null);
  const generation = useRef(0);

  const load = useCallback(async (force = false): Promise<DetailLoadOutcome> => {
    const version = generation.current;
    try {
      const detail = await fetchMatchDetail(matchId);
      if (version !== generation.current) return STALE;
      const marker = progressMarkerOf(detail);
      if (force || progressChanged(markerRef.current, marker)) {
        const [log, calls] = await Promise.all([fetchMatchLog(matchId), fetchAiCalls(matchId)]);
        if (version !== generation.current) return STALE;
        markerRef.current = marker;
        setState({ detail, log, calls, error: null });
      } else {
        setState((prev) => ({ ...prev, detail, error: null }));
      }
      return { kind: 'loaded', terminal: isTerminal(detail.status) };
    } catch (error) {
      if (version !== generation.current) return STALE;
      setState((prev) => ({ ...prev, error: errorMessage(error) }));
      return { kind: 'failed', notFound: isNotFoundError(error) };
    }
  }, [matchId]);

  const reload = useCallback(() => load(true), [load]);
  useEffect(() => onAdminViewResumed(() => {
    // 作废进行中的旧请求，旧数据留在页面上直到新数据到达
    generation.current++;
    void reload();
  }), [reload]);
  useEffect(() => onTraceRemoved((id) => {
    if (id !== matchId) return;
    generation.current++;
    markerRef.current = null;
    setState((prev) => ({ ...prev, calls: [], detail: prev.detail && { ...prev.detail, traceDeleted: true } }));
    void reload();
  }), [matchId, reload]);

  useEffect(() => {
    markerRef.current = null;
    let failures = 0;
    const stop = startPolling(async () => {
      const outcome = await load();
      if (outcome.kind === 'failed') failures++;
      else if (outcome.kind === 'loaded') failures = 0;
      return nextDetailPoll(outcome, failures);
    });
    return () => {
      stop();
      generation.current++;
    };
  }, [load]);

  return { ...state, reload };
}
