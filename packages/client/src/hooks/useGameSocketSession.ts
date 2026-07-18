import { useEffect, useRef, useState } from 'react';
import type { GameEvent, QueueItem } from '../types';
import { openGameSocket } from '../services/gameService';
import type { OpenGameSocketOptions } from '../services/gameService';

interface PendingAck {
  socket: WebSocket;
  ackId: number | string;
  generation: number;
}

interface PendingAckToken {
  ackId: number | string;
  generation: number;
}

interface DeferredSocketEvent {
  event: GameEvent;
  socket: WebSocket;
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
  const deferredQueueRef = useRef<DeferredSocketEvent[]>([]);
  const startedAckIdsRef = useRef<Set<number | string>>(new Set());
  const sessionGenerationRef = useRef(0);
  const autoPlayRef = useRef<boolean>(false);
  const ackTimerRef = useRef<number | null>(null);
  const previousSpeechEnabledRef = useRef<boolean>(speechEnabled);
  const disabledSpeechAckTokenRef = useRef<PendingAckToken | null>(null);
  const latestRef = useRef<UseGameSocketSessionParams>({
    gameType, speechEnabled, speak, cancel, applyServerEvent, getNarration, getSpeechOptions, getAckDelay, playPendingEvent, onError, onAcknowledge, onAutoPlayStopped, onSkipPhase
  });

  if (previousSpeechEnabledRef.current && !speechEnabled) {
    const pendingAck = pendingAckRef.current;
    disabledSpeechAckTokenRef.current = autoPlayRef.current
      && pendingAck
      && startedAckIdsRef.current.has(pendingAck.ackId)
      ? { ackId: pendingAck.ackId, generation: pendingAck.generation }
      : null;
  }
  previousSpeechEnabledRef.current = speechEnabled;

  latestRef.current = {
    gameType, speechEnabled, speak, cancel, applyServerEvent, getNarration, getSpeechOptions, getAckDelay, playPendingEvent, onError, onAcknowledge, onAutoPlayStopped, onSkipPhase
  };

  useEffect(() => () => closeSession(), []);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
    if (autoPlay && pendingAckRef.current) continuePendingEvent();
  }, [autoPlay]);

  useEffect(() => {
    if (speechEnabled) return;
    const pendingAckToken = disabledSpeechAckTokenRef.current;
    disabledSpeechAckTokenRef.current = null;
    if (pendingAckToken) acknowledgePending(pendingAckToken.ackId, pendingAckToken.generation);
  }, [speechEnabled]);

  function clearPendingAckTimer() {
    if (!ackTimerRef.current) return;
    window.clearTimeout(ackTimerRef.current);
    ackTimerRef.current = null;
  }

  function resetSessionRefs() {
    sessionGenerationRef.current += 1;
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    deferredQueueRef.current = [];
    startedAckIdsRef.current.clear();
    disabledSpeechAckTokenRef.current = null;
    autoPlayRef.current = false;
    clearPendingAckTimer();
    setAutoPlay(false);
    setIsReplayMode(false);
  }

  function closeSocket() {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }

  function closeSession() {
    sessionGenerationRef.current += 1;
    closeSocket();
  }

  function startSession(payload: Partial<OpenGameSocketOptions> = {}) {
    closeSocket();
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

    if (!event.ackId) {
      latestRef.current.applyServerEvent?.(event);
      return;
    }

    // Queue ack-backed events so visuals advance only after playback sends ack.
    if (pendingAckRef.current) {
      deferredQueueRef.current.push({ event, socket });
      return;
    }

    startPendingEvent(event, socket);
  }

  function acknowledgePending(expectedAckId: number | string, expectedGeneration: number) {
    const pending = pendingAckRef.current;
    if (!pending?.ackId) return;
    if (pending.ackId !== expectedAckId || pending.generation !== expectedGeneration) return;
    if (sessionGenerationRef.current !== expectedGeneration) return;
    if (pending.socket.readyState === WebSocket.OPEN) {
      pending.socket.send(JSON.stringify({ type: 'ack', ackId: pending.ackId }));
    }
    const acknowledgedAckId = pending.ackId;
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    startedAckIdsRef.current.delete(acknowledgedAckId);
    clearPendingAckTimer();
    latestRef.current.onAcknowledge?.();
    startNextDeferredEvent();
  }

  function startPendingEvent(event: GameEvent, socket: WebSocket) {
    latestRef.current.applyServerEvent?.(event);
    pendingAckRef.current = { socket, ackId: event.ackId!, generation: sessionGenerationRef.current };
    pendingEventRef.current = event;
    if (autoPlayRef.current) continuePendingEvent();
  }

  function startNextDeferredEvent() {
    const next = deferredQueueRef.current.shift();
    if (!next) return;
    startPendingEvent(next.event, next.socket);
  }

  function continuePendingEvent() {
    const event = pendingEventRef.current;
    const pending = pendingAckRef.current;
    if (!event || !pending) return;
    const ackId = event.ackId;
    if (ackId && startedAckIdsRef.current.has(ackId)) return;
    if (ackId) startedAckIdsRef.current.add(ackId);
    const generation = pending.generation;
    const acknowledgeCurrent = () => acknowledgePending(ackId!, generation);

    clearPendingAckTimer();

    const handled = latestRef.current.playPendingEvent?.(event, {
      acknowledgePending: acknowledgeCurrent,
      setAckTimer: (delay: number) => {
        ackTimerRef.current = window.setTimeout(acknowledgeCurrent, delay);
      },
      clearPendingAckTimer
    });
    if (handled) return;

    const narration = latestRef.current.getNarration?.(event) || '';
    const speechOptions = latestRef.current.getSpeechOptions?.(event) || {};
    const delay = latestRef.current.getAckDelay?.(event, narration) || 120;
    if (latestRef.current.speechEnabled && narration) {
      latestRef.current.speak?.(narration, acknowledgeCurrent, speechOptions);
    } else {
      ackTimerRef.current = window.setTimeout(acknowledgeCurrent, delay);
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
      const pendingAckId = pendingAckRef.current?.ackId;
      if (pendingAckId != null) startedAckIdsRef.current.delete(pendingAckId);
      latestRef.current.onAutoPlayStopped?.();
    }
  }

  function skipCurrentReplayPhase(message?: string) {
    if (!isReplayMode || socketRef.current?.readyState !== WebSocket.OPEN) return;
    latestRef.current.cancel?.();
    discardPendingReplayPhase();
    latestRef.current.onSkipPhase?.(message);
    socketRef.current.send(JSON.stringify({ type: 'control', action: 'skip-phase' }));
  }

  function discardPendingReplayPhase() {
    const skippedAckId = pendingAckRef.current?.ackId;
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    deferredQueueRef.current = [];
    disabledSpeechAckTokenRef.current = null;
    if (skippedAckId != null) startedAckIdsRef.current.delete(skippedAckId);
    clearPendingAckTimer();
  }

  return {
    autoPlay,
    isReplayMode,
    startSession,
    closeSession,
    resetSessionRefs,
    continuePendingEvent,
    setAutoPlayEnabled,
    skipCurrentReplayPhase,
    sendPlaybackControl,
    clearPendingAckTimer
  };
}
