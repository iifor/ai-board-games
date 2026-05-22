import { useEffect, useRef, useState } from 'react';
import { openGameSocket } from '../services/gameService';

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
}) {
  const [autoPlay, setAutoPlay] = useState(false);
  const [isReplayMode, setIsReplayMode] = useState(false);
  const socketRef = useRef(null);
  const pendingAckRef = useRef(null);
  const pendingEventRef = useRef(null);
  const startedAckIdsRef = useRef(new Set());
  const autoPlayRef = useRef(false);
  const ackTimerRef = useRef(null);
  const latestRef = useRef({});

  latestRef.current = {
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

  function startSession(payload = {}) {
    closeSession();
    resetSessionRefs();
    setAutoPlay(true);
    setIsReplayMode(Boolean(payload.replayGameId));
    autoPlayRef.current = true;
    socketRef.current = openGameSocket({
      ...payload,
      gameType,
      onEvent: handleSocketEvent,
      onError: (error) => latestRef.current.onError?.(error),
      onClose: () => {}
    });
  }

  function handleSocketEvent(event, socket) {
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
      setAckTimer: (delay) => {
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

  function sendPlaybackControl(paused) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'control', action: paused ? 'pause' : 'resume' }));
    }
  }

  function setAutoPlayEnabled(value) {
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

  function skipCurrentReplayPhase(message) {
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
