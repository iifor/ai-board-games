import type { ServerMessage } from '@battle/shared';
import { useCallback, useEffect, useRef, useState } from 'react';
import { matchStreamUrl } from '../../../services/matches';
import type { StreamState } from '../types';

const RECONNECT_DELAY_MS = 1500;
const INITIAL: StreamState = { items: [], status: null, ended: false, result: null, error: null, connected: false };

/**
 * 订阅对局播放流：收到事件后由播放器播放，播放完调用 ack；
 * 断线后从最后确认的 seq 续播，重复收到的事件按 seq 去重。
 */
export function useMatchStream(matchId: string) {
  const [state, setState] = useState<StreamState>(INITIAL);
  const socketRef = useRef<WebSocket | null>(null);
  const ackedRef = useRef(0);
  const endedRef = useRef(false);

  useEffect(() => {
    let disposed = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setState(INITIAL);
    ackedRef.current = 0;
    endedRef.current = false;

    const handle = (message: ServerMessage) => {
      if (message.type === 'event') {
        setState((prev) => {
          const last = prev.items[prev.items.length - 1]?.event.seq ?? 0;
          if (message.event.seq <= last) return prev;
          return { ...prev, items: [...prev.items, { event: message.event, audio: message.audio }] };
        });
      } else if (message.type === 'end') {
        endedRef.current = true;
        setState((prev) => ({ ...prev, ended: true, result: message.result, status: 'completed' }));
      } else if (message.type === 'status') {
        if (message.status === 'failed') endedRef.current = true;
        setState((prev) => ({ ...prev, status: message.status, error: message.error, ended: prev.ended || message.status === 'failed' }));
      } else {
        endedRef.current = true;
        setState((prev) => ({ ...prev, error: message.message, ended: true }));
      }
    };

    const connect = () => {
      const socket = new WebSocket(matchStreamUrl(matchId));
      socketRef.current = socket;
      socket.addEventListener('open', () => {
        setState((prev) => ({ ...prev, connected: true }));
        socket.send(JSON.stringify({ type: 'hello', afterSeq: ackedRef.current }));
      });
      socket.addEventListener('message', (message) => handle(JSON.parse(String(message.data)) as ServerMessage));
      socket.addEventListener('close', () => {
        setState((prev) => ({ ...prev, connected: false }));
        if (!disposed && !endedRef.current) timer = setTimeout(connect, RECONNECT_DELAY_MS);
      });
    };
    connect();

    return () => {
      disposed = true;
      if (timer) clearTimeout(timer);
      socketRef.current?.close();
    };
  }, [matchId]);

  const ack = useCallback((seq: number) => {
    ackedRef.current = Math.max(ackedRef.current, seq);
    const socket = socketRef.current;
    if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'ack', seq }));
  }, []);

  return { ...state, ack };
}
