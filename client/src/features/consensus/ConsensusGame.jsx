import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActionBar } from './components/ActionBar';
import { CenterStage, RealStartPanel } from './components/CenterStage';
import { ConfirmResetModal, CurrentGameHistory, EventBackground, InfoModal, StageInfo } from './components/InfoModal';
import { PlayerList } from './components/PlayerList';
import { SpeechSubtitle } from '../../components/SpeechSubtitle';
import { SpeechInsightOverlay } from '../../components/SpeechInsightOverlay';
import { StatusPanel } from './components/StatusPanel';
import { ErrorView, LoadingView } from '../../components/StateViews';
import { TopNav } from '../../components/TopNav';
import { WinnerModal } from './components/WinnerModal';
import { openGameSocket } from '../../api/gameApi';
import { classNames } from '../../utils/classNames';
import { buildTimeline, createEmptyGame, createPendingRound } from './constants';
import { useSpeechQueue } from '../../hooks/useSpeechQueue';

export function ConsensusGame({ replayGameId = '', onReturnToSelect }) {
  const [game, setGame] = useState(() => createEmptyGame());
  const [step, setStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showRoles, setShowRoles] = useState(true);
  const [visibleRolePlayerId, setVisibleRolePlayerId] = useState(null);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [infoModal, setInfoModal] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [status, setStatus] = useState('idle');
  const [streamMessage, setStreamMessage] = useState('真实模式已就绪，点击开始后调用 AI。');
  const [messageLog, setMessageLog] = useState([]);
  const [subtitleSpeech, setSubtitleSpeech] = useState(null);
  const socketRef = useRef(null);
  const pendingAckRef = useRef(null);
  const pendingEventRef = useRef(null);
  const ackTimerRef = useRef(null);
  const pausedRef = useRef(false);
  const introEventIdRef = useRef('');
  const { speechEnabled, setSpeechEnabled, speak, cancel } = useSpeechQueue();

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => () => closeSocket(), []);

  useEffect(() => {
    if (!replayGameId) return;
    startGame({ replayGameId });
  }, [replayGameId]);

  const timeline = useMemo(() => buildTimeline(game), [game]);
  const historyTimeline = useMemo(() => buildTimeline(game, messageLog), [game, messageLog]);
  const displayGame = game || createEmptyGame();
  const currentEvent = timeline[Math.min(step, Math.max(0, timeline.length - 1))] || {
    type: 'idle',
    title: '游戏即将开始',
    roundData: displayGame.rounds[0] || createPendingRound()
  };
  const currentRound = currentEvent.roundData || displayGame.rounds.at(-1) || createPendingRound();
  const visibleSpeeches = messageLog.length ? messageLog : displayGame.rounds.flatMap((round) => round.speeches || []);
  const currentSpeakerId = currentEvent.type === 'speech' ? currentEvent.speech.playerId : null;
  const canShowWinner = Boolean(displayGame.winner && displayGame.rounds.length > 0);
  const isRunning = status === 'streaming';
  const controlsLocked = isRunning && !paused;

  useEffect(() => {
    if (!displayGame.players?.length) {
      setVisibleRolePlayerId(null);
      return;
    }
    setVisibleRolePlayerId((value) => {
      if (value && displayGame.players.some((player) => Number(player.id) === Number(value))) return value;
      return displayGame.players[Math.floor(Math.random() * displayGame.players.length)]?.id || null;
    });
  }, [displayGame.id, displayGame.players?.length]);

  useEffect(() => {
    if (canShowWinner && status === 'ready') setShowWinnerModal(true);
  }, [canShowWinner, status]);

  function resetToIdle(message) {
    closeSocket();
    cancel();
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    clearPendingAckTimer();
    setGame(createEmptyGame());
    setStep(0);
    setAutoPlay(false);
    setPaused(false);
    pausedRef.current = false;
    setShowWinnerModal(false);
    setInfoModal(null);
    setMessageLog([]);
    setSubtitleSpeech(null);
    introEventIdRef.current = '';
    setStatus('idle');
    setStreamMessage(message || '真实模式已就绪，点击开始后调用 AI。');
  }

  function startGame(options = {}) {
    resetToIdle('');
    setStatus('streaming');
    setStreamMessage('游戏准备中...');
    socketRef.current = openGameSocket({
      mode: 'real',
      gameType: 'consensus',
      replayGameId: options.replayGameId || '',
      onEvent: handleSocketEvent,
      onError: (error) => {
        setStatus('error');
        setStreamMessage(error.message);
      },
      onClose: () => {}
    });
  }

  function handleSocketEvent(event, socket) {
    if (event.type === 'error') {
      setStatus('error');
      setStreamMessage(event.message || '对局生成失败');
      return;
    }

    applyServerEvent(event);

    if (!event.ackId) return;
    pendingAckRef.current = { socket, ackId: event.ackId };
    pendingEventRef.current = event;

    const narration = event.subtitle?.text || event.narration || getStreamNarration(event);
    if (pausedRef.current) return;

    const speechOptions = getSpeechOptions(event);
    if (speechEnabled && narration) {
      speak(narration, acknowledgePending, speechOptions);
    } else {
      clearPendingAckTimer();
      ackTimerRef.current = window.setTimeout(acknowledgePending, event.type === 'speech' ? 350 : 120);
    }
  }

  function applyServerEvent(event) {
    recordServerMessage(event);
    if (event.message) setStreamMessage(event.message);
    if (event.game) {
      setGame(event.game);
      setStep(Math.max(0, buildTimeline(event.game).length - 1));
      maybeOpenEventBackground(event.game);
    }
    if (event.players) {
      setGame((value) => ({ ...(value || createEmptyGame()), players: event.players }));
    }
    if (event.type === 'speech' && event.speech) {
      setStreamMessage(`${event.speech.playerId}号发言中`);
      setSubtitleSpeech({
        ...event.speech,
        text: event.subtitle?.text || event.speech.text,
        fullText: event.speech.fullText || event.speech.text,
        thinking: event.speech.thinking || ''
      });
      return;
    }
    const subtitleText = event.subtitle?.text || event.narration || getStreamNarration(event) || event.message;
    if (subtitleText && event.type !== 'game') {
      setSubtitleSpeech({ playerId: null, text: subtitleText });
    }
    if (event.type === 'done') {
      setStatus('ready');
      setStreamMessage(event.message || '对局已完成。');
    }
  }

  function recordServerMessage(event) {
    if (!event || event.type === 'done') return;
    if (event.type === 'speech' && event.speech) {
      setMessageLog((items) => [
        ...items,
        {
          type: 'player',
          playerId: event.speech.playerId,
          text: event.speech.text,
          title: `${event.speech.playerId}号发言`
        }
      ]);
      return;
    }

    const narration = event.subtitle?.text || event.narration || getStreamNarration(event) || event.message;
    if (!narration) return;
    setMessageLog((items) => [
      ...items,
      {
        type: 'host',
        playerId: '主持',
        text: narration,
        title: '主持人'
      }
    ]);
  }

  function acknowledgePending() {
    const pending = pendingAckRef.current;
    if (!pending?.ackId || pending.socket.readyState !== WebSocket.OPEN) return;
    clearPendingAckTimer();
    pending.socket.send(JSON.stringify({ type: 'ack', ackId: pending.ackId }));
    pendingAckRef.current = null;
    pendingEventRef.current = null;
  }

  function sendPlaybackControl(pausedState) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'control', action: pausedState ? 'pause' : 'resume' }));
    }
  }

  function clearPendingAckTimer() {
    if (!ackTimerRef.current) return;
    window.clearTimeout(ackTimerRef.current);
    ackTimerRef.current = null;
  }

  function togglePause() {
    cancel();
    clearPendingAckTimer();
    setPaused((value) => {
      const next = !value;
      pausedRef.current = next;
      sendPlaybackControl(next);
      if (!next && pendingAckRef.current) {
        const event = pendingEventRef.current;
        const narration = event?.subtitle?.text || event?.narration || getStreamNarration(event);
        if (speechEnabled && narration) speak(narration, acknowledgePending, getSpeechOptions(event));
        else acknowledgePending();
      }
      return next;
    });
  }

  function setTopAutoPlay(value) {
    const next = Boolean(value);
    setAutoPlay(next);
    if (!next) {
      pausedRef.current = true;
      setPaused(true);
      sendPlaybackControl(true);
      cancel();
      clearPendingAckTimer();
      return;
    }
    pausedRef.current = false;
    setPaused(false);
    sendPlaybackControl(false);
    if (pendingAckRef.current) {
      const event = pendingEventRef.current;
      const narration = event?.subtitle?.text || event?.narration || getStreamNarration(event);
      if (speechEnabled && narration) speak(narration, acknowledgePending, getSpeechOptions(event));
      else acknowledgePending();
    }
  }

  function requestSpeechToggle() {
    if (controlsLocked) return;
    if (isRunning && paused) {
      setConfirmAction(() => () => {
        resetToIdle('本局比赛已结束。');
        setSpeechEnabled((value) => !value);
      });
      return;
    }
    setSpeechEnabled((value) => !value);
  }

  function confirmReset() {
    const action = confirmAction;
    setConfirmAction(null);
    action?.();
  }

  function openCurrentHistory() {
    setInfoModal({ type: 'history', title: '本局历史', eyebrow: 'CURRENT MATCH', events: historyTimeline });
  }

  function openStageInfo() {
    setInfoModal({ type: 'stage', title: '阶段信息', eyebrow: 'STAGE INFO', event: currentEvent });
  }

  function openEventBackground() {
    setInfoModal({ type: 'background', title: displayGame.event?.name || '事件背景', eyebrow: 'CASE BRIEF', game: displayGame });
  }

  function maybeOpenEventBackground(nextGame) {
    if (!nextGame?.event?.background || nextGame.id === 'pending') return;
    const eventKey = `${nextGame.id}-${nextGame.event.name}`;
    if (introEventIdRef.current === eventKey) return;
    introEventIdRef.current = eventKey;
    setInfoModal({ type: 'background', title: nextGame.event.name, eyebrow: 'CASE BRIEF', game: nextGame });
  }

  function returnToSelect() {
    if (isRunning) return;
    onReturnToSelect();
  }

  function closeSocket() {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }

  if (status === 'loading') return <LoadingView />;
  if (status === 'error' && !game) {
    return <ErrorView message={streamMessage} onRetry={startGame} />;
  }

  return (
    <main className="game-shell real-mode">
      <TopNav
        currentRound={currentRound}
        currentEvent={currentEvent}
        autoPlay={autoPlay}
        showRoles={showRoles}
        speechEnabled={speechEnabled}
        controlsLocked={controlsLocked}
        returnDisabled={isRunning}
        onReturn={returnToSelect}
        onSpeechToggle={requestSpeechToggle}
        setAutoPlay={setTopAutoPlay}
        setShowRoles={setShowRoles}
      />

      <section className="game-grid">
        <PlayerList
          players={displayGame.players}
          round={currentRound}
          showRoles={showRoles}
          visibleRolePlayerId={visibleRolePlayerId}
          currentSpeakerId={currentSpeakerId}
        />
        {status === 'idle' || displayGame.rounds.length === 0 ? (
          <RealStartPanel status={status} message={streamMessage} onStart={startGame} />
        ) : (
          <CenterStage
            game={displayGame}
            round={currentRound}
            speeches={visibleSpeeches}
            step={step}
            timelineLength={timeline.length}
            setStep={setStep}
            autoPlay={autoPlay}
            setAutoPlay={setAutoPlay}
            streamMessage={streamMessage}
          />
        )}
        <StatusPanel game={displayGame} round={currentRound} showRoles={showRoles} visibleRolePlayerId={visibleRolePlayerId} />
      </section>
      <SpeechSubtitle speech={subtitleSpeech} />
      <SpeechInsightOverlay speech={subtitleSpeech} players={displayGame.players} />

      <ActionBar
        paused={paused}
        onHistory={openCurrentHistory}
        onTogglePause={togglePause}
        onBackground={openEventBackground}
        onNextSentence={startGame}
      />

      {showWinnerModal && canShowWinner && <WinnerModal game={displayGame} onClose={() => setShowWinnerModal(false)} />}
      {infoModal && (
        <InfoModal title={infoModal.title} eyebrow={infoModal.eyebrow} onClose={() => setInfoModal(null)}>
          {infoModal.type === 'history' ? (
            <CurrentGameHistory events={infoModal.events || []} />
          ) : infoModal.type === 'background' ? (
            <EventBackground game={infoModal.game || displayGame} />
          ) : (
            <StageInfo event={infoModal.event} />
          )}
        </InfoModal>
      )}
      {confirmAction && <ConfirmResetModal onCancel={() => setConfirmAction(null)} onConfirm={confirmReset} />}
    </main>
  );
}

function getStreamNarration(event) {
  if (!event) return '';
  if (event.type === 'host' || event.type === 'status' || event.type === 'done') return event.message || '';
  return event.narration || '';
}

function getSpeechOptions(event) {
  const base = { audioUrl: event?.audioUrl };
  if (event?.type !== 'speech' || !event.speech?.playerId) return base;
  const player = event.game?.players?.find((item) => Number(item.id) === Number(event.speech.playerId));
  return { ...base, playerId: event.speech.playerId, voicePackageId: player?.voicePackageId };
}

