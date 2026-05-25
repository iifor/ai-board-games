import { useEffect, useRef, useState } from 'react';
import type { GameEvent, QueueItem } from '../types';
import { openGameSocket } from '../services/gameService';
import type { OpenGameSocketOptions } from '../services/gameService';

interface PendingAck {
  socket: WebSocket;
  ackId: string;
}

interface UseGameSocketSessionParams {
  gameType: string;
  speechEnabled: boolean;
  speak: (text: string, onEnd?: () => void, options?: Partial<QueueItem>) => boolean;
  cancel: () => void;
  applyServerEvent: (event: GameEvent) => void;
  getNarration?: (event: GameEvent) => string | null;
  getSpeechOptions?: (event: GameEvent) => Partial<QueueItem>;
  getAckDelay?: (event: GameEvent, narration: string) => number;
  playPendingEvent: (event: GameEvent, options: { acknowledgePending: () => void; setAckTimer: (delay: number) => void; clearPendingAckTimer: () => void }) => boolean;
  onError: (error: Error | GameEvent) => void;
  onAcknowledge: () => void;
  onAutoPlayStopped?: () => void;
  onSkipPhase: (message?: string) => void;
}

export function useGameSocketSession({
  gameType,
  speechEnabled,
  speak,
  cancel,
  applyServerEvent,
  getNarration,
  getSpeechOptions,
  getAckDelay,
  playPendingEvent,
  onError,
  onAcknowledge,
  onAutoPlayStopped,
  onSkipPhase
}: UseGameSocketSessionParams) {
  const [autoPlay, setAutoPlay] = useState<boolean>(false);
  const [isReplayMode, setIsReplayMode] = useState<boolean>(false);
  const socketRef = useRef<WebSocket | null>(null);
  const pendingAckRef = useRef<PendingAck | null>(null);
  const pendingEventRef = useRef<GameEvent | null>(null);
  const startedAckIdsRef = useRef<Set<string>>(new Set());
  const autoPlayRef = useRef<boolean>(false);
  const ackTimerRef = useRef<number | null>(null);
  const latestRef = useRef<UseGameSocketSessionParams>({
    gameType, speechEnabled, speak, cancel, applyServerEvent, getNarration, getSpeechOptions, getAckDelay, playPendingEvent, onError, onAcknowledge, onAutoPlayStopped, onSkipPhase
  });

  latestRef.current = {
    gameType, speechEnabled, speak, cancel, applyServerEvent, getNarration, getSpeechOptions, getAckDelay, playPendingEvent, onError, onAcknowledge, onAutoPlayStopped, onSkipPhase
  };

  useEffect(() => () => closeSession(), []);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
    if (autoPlay && pendingAckRef.current) continuePendingEvent();
  }, [autoPlay]);

  function clearPendingAckTimer() {
    if (!ackTimerRef.current) return;
    window.clearTimeout(ackTimerRef.current);
    ackTimerRef.current = null;
  }

  function resetSessionRefs() {
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    startedAckIdsRef.current.clear();
    autoPlayRef.current = false;
    clearPendingAckTimer();
    setAutoPlay(false);
    setIsReplayMode(false);
  }

  function closeSession() {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }

  function startSession(payload: Partial<OpenGameSocketOptions> = {}) {
    closeSession();
    resetSessionRefs();
    setAutoPlay(true);
    setIsReplayMode(Boolean(payload.replayGameId));
    autoPlayRef.current = true;
    socketRef.current = openGameSocket({
      ...payload,
      gameType,
      onEvent: handleSocketEvent,
      onError: (error: Error) => latestRef.current.onError?.(error),
      onClose: () => {}
    });
  }

  function handleSocketEvent(event: GameEvent, socket: WebSocket) {
    if (event.type === 'error') {
      latestRef.current.onError?.(event);
      return;
    }

    latestRef.current.applyServerEvent?.(event);

    if (!event.ackId) return;
    pendingAckRef.current = { socket, ackId: event.ackId };
    pendingEventRef.current = event;
    if (autoPlayRef.current) continuePendingEvent();
  }

  function acknowledgePending() {
    const pending = pendingAckRef.current;
    latestRef.current.onAcknowledge?.();
    if (!pending?.ackId || pending.socket.readyState !== WebSocket.OPEN) return;
    pending.socket.send(JSON.stringify({ type: 'ack', ackId: pending.ackId }));
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    startedAckIdsRef.current.delete(pending.ackId);
    clearPendingAckTimer();
  }

  function continuePendingEvent() {
    const event = pendingEventRef.current;
    if (!event) return;
    const ackId = event.ackId;
    if (ackId && startedAckIdsRef.current.has(ackId)) return;
    if (ackId) startedAckIdsRef.current.add(ackId);
    latestRef.current.cancel?.();
    clearPendingAckTimer();

    const handled = latestRef.current.playPendingEvent?.(event, {
      acknowledgePending,
      setAckTimer: (delay: number) => {
        ackTimerRef.current = window.setTimeout(acknowledgePending, delay);
      },
      clearPendingAckTimer
    });
    if (handled) return;

    const narration = latestRef.current.getNarration?.(event) || '';
    const speechOptions = latestRef.current.getSpeechOptions?.(event) || {};
    const delay = latestRef.current.getAckDelay?.(event, narration) || 120;
    if (latestRef.current.speechEnabled && narration) {
      latestRef.current.speak?.(narration, acknowledgePending, speechOptions);
    } else {
      ackTimerRef.current = window.setTimeout(acknowledgePending, delay);
    }
  }

  function sendPlaybackControl(paused: boolean) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'control', action: paused ? 'pause' : 'resume' }));
    }
  }

  function setAutoPlayEnabled(value: boolean) {
    const next = Boolean(value);
    setAutoPlay(next);
    autoPlayRef.current = next;
    sendPlaybackControl(!next);
    if (!next) {
      latestRef.current.cancel?.();
      clearPendingAckTimer();
      latestRef.current.onAutoPlayStopped?.();
    }
  }

  function skipCurrentReplayPhase(message?: string) {
    if (!isReplayMode || socketRef.current?.readyState !== WebSocket.OPEN) return;
    latestRef.current.cancel?.();
    clearPendingAckTimer();
    latestRef.current.onSkipPhase?.(message);
    socketRef.current.send(JSON.stringify({ type: 'control', action: 'skip-phase' }));
  }

  return {
    autoPlay,
    isReplayMode,
    startSession,
    closeSession,
    resetSessionRefs,
    acknowledgePending,
    continuePendingEvent,
    setAutoPlayEnabled,
    skipCurrentReplayPhase,
    sendPlaybackControl,
    clearPendingAckTimer
  };
}
