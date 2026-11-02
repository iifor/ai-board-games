import { useCallback, useEffect, useRef, useState } from 'react';
import { matchStreamUrl } from '../../../services/matches';
import { INITIAL_STREAM_STATE, MatchStreamConnection } from '../stream/connection';
import type { StreamState } from '../types';

/**
 * 订阅对局播放流（连接、续播、重连策略都在 MatchStreamConnection 里）：
 * 收到事件后由播放器播放，播放完调用 ack；自动重连放弃后可 retry。
 * session 变化时从头重新订阅（"从头回放"）。
 */
export function useMatchStream(matchId: string, session = 0) {
  const [state, setState] = useState<StreamState>(INITIAL_STREAM_STATE);
  const connectionRef = useRef<MatchStreamConnection | null>(null);

  useEffect(() => {
    const connection = new MatchStreamConnection(matchStreamUrl(matchId));
    connectionRef.current = connection;
    setState(connection.state);
    const unsubscribe = connection.subscribe(() => setState(connection.state));
    return () => {
      unsubscribe();
      connection.dispose();
      if (connectionRef.current === connection) connectionRef.current = null;
    };
  }, [matchId, session]);

  const ack = useCallback((seq: number) => connectionRef.current?.ack(seq), []);
  const retry = useCallback(() => connectionRef.current?.retry(), []);
  return { ...state, ack, retry };
}
