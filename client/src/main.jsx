import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ActionBar } from './components/ActionBar';
import { CenterStage, RealStartPanel } from './components/CenterStage';
import { ConfirmResetModal, CurrentGameHistory, InfoModal, StageInfo } from './components/InfoModal';
import { PlayerList } from './components/PlayerList';
import { StatusPanel } from './components/StatusPanel';
import { ErrorView, LoadingView } from './components/StateViews';
import { TopNav } from './components/TopNav';
import { WinnerModal } from './components/WinnerModal';
import { openGameSocket } from './api/gameApi';
import { buildTimeline, classNames, createEmptyGame, createPendingRound } from './utils/gameState';
import { useSpeechQueue } from './hooks/useSpeechQueue';
import './styles.css';

function App() {
  const [mockMode, setMockMode] = useState(true);
  const [game, setGame] = useState(() => createEmptyGame());
  const [step, setStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [paused, setPaused] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [infoModal, setInfoModal] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [status, setStatus] = useState('idle');
  const [streamMessage, setStreamMessage] = useState('Mock 模式已就绪，点击开始后由后端逐条推送。');
  const socketRef = useRef(null);
  const pendingAckRef = useRef(null);
  const pendingEventRef = useRef(null);
  const pausedRef = useRef(false);
  const { speechEnabled, setSpeechEnabled, speak, cancel } = useSpeechQueue();

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  useEffect(() => () => closeSocket(), []);

  const timeline = useMemo(() => buildTimeline(game), [game]);
  const displayGame = game || createEmptyGame();
  const currentEvent = timeline[Math.min(step, Math.max(0, timeline.length - 1))] || {
    type: 'idle',
    title: mockMode ? '等待 Mock 对局' : '游戏即将开始',
    roundData: displayGame.rounds[0] || createPendingRound()
  };
  const currentRound = currentEvent.roundData || displayGame.rounds.at(-1) || createPendingRound();
  const visibleSpeeches = displayGame.rounds.flatMap((round) => round.speeches || []);
  const currentSpeakerId = currentEvent.type === 'speech' ? currentEvent.speech.playerId : null;
  const canShowWinner = Boolean(displayGame.winner && displayGame.rounds.length > 0);
  const isRunning = status === 'streaming';
  const controlsLocked = isRunning && !paused;

  useEffect(() => {
    if (canShowWinner && status === 'ready') setShowWinnerModal(true);
  }, [canShowWinner, status]);

  function resetToIdle(message, nextMockMode = mockMode) {
    closeSocket();
    cancel();
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    setGame(createEmptyGame());
    setStep(0);
    setAutoPlay(false);
    setPaused(false);
    pausedRef.current = false;
    setShowWinnerModal(false);
    setInfoModal(null);
    setStatus('idle');
    setStreamMessage(
      message ||
        (nextMockMode
          ? 'Mock 模式已就绪，点击开始后由后端逐条推送。'
          : '真实模式已就绪，点击开始后才会调用 AI。')
    );
  }

  function startGame() {
    resetToIdle('');
    setStatus('streaming');
    setStreamMessage('正在连接后端调度器...');
    socketRef.current = openGameSocket({
      mode: mockMode ? 'mock' : 'real',
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

    const narration = event.narration || getStreamNarration(event);
    if (pausedRef.current) return;

    if (speechEnabled && narration) {
      speak(narration, acknowledgePending);
    } else {
      window.setTimeout(acknowledgePending, event.type === 'speech' ? 350 : 120);
    }
  }

  function applyServerEvent(event) {
    if (event.message) setStreamMessage(event.message);
    if (event.game) {
      setGame(event.game);
      setStep(Math.max(0, buildTimeline(event.game).length - 1));
    }
    if (event.players) {
      setGame((value) => ({ ...(value || createEmptyGame()), players: event.players }));
    }
    if (event.type === 'speech' && event.speech) {
      setStreamMessage(`${event.speech.playerId}号发言中`);
    }
    if (event.type === 'done') {
      setStatus('ready');
      setStreamMessage(event.message || '对局已完成。');
    }
  }

  function acknowledgePending() {
    const pending = pendingAckRef.current;
    if (!pending?.ackId || pending.socket.readyState !== WebSocket.OPEN) return;
    pending.socket.send(JSON.stringify({ type: 'ack', ackId: pending.ackId }));
    pendingAckRef.current = null;
    pendingEventRef.current = null;
  }

  function togglePause() {
    cancel();
    setPaused((value) => {
      const next = !value;
      pausedRef.current = next;
      if (!next && pendingAckRef.current) {
        const event = pendingEventRef.current;
        const narration = event?.narration || getStreamNarration(event);
        if (speechEnabled && narration) speak(narration, acknowledgePending);
        else acknowledgePending();
      }
      return next;
    });
  }

  function requestModeToggle() {
    if (controlsLocked) return;
    const nextMode = !mockMode;
    if (isRunning && paused) {
      setConfirmAction(() => () => {
        setMockMode(nextMode);
        resetToIdle('本局比赛已结束。', nextMode);
      });
      return;
    }
    setMockMode(nextMode);
    resetToIdle(undefined, nextMode);
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
    setInfoModal({ type: 'history', title: '本局历史', eyebrow: 'CURRENT MATCH', events: timeline });
  }

  function openStageInfo() {
    setInfoModal({ type: 'stage', title: '阶段信息', eyebrow: 'STAGE INFO', event: currentEvent });
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
    <main className={classNames('game-shell', !mockMode && 'real-mode')}>
      <TopNav
        currentRound={currentRound}
        currentEvent={currentEvent}
        autoPlay={autoPlay}
        showRoles={showRoles}
        mockMode={mockMode}
        speechEnabled={speechEnabled}
        controlsLocked={controlsLocked}
        onModeToggle={requestModeToggle}
        onSpeechToggle={requestSpeechToggle}
        setAutoPlay={setAutoPlay}
        setShowRoles={setShowRoles}
      />

      <section className="game-grid">
        <PlayerList players={displayGame.players} round={currentRound} showRoles={showRoles} currentSpeakerId={currentSpeakerId} />
        {status === 'idle' || displayGame.rounds.length === 0 ? (
          <RealStartPanel status={status} message={streamMessage} onStart={startGame} />
        ) : (
          <CenterStage
            round={currentRound}
            speeches={visibleSpeeches}
            step={step}
            timelineLength={timeline.length}
            setStep={setStep}
            autoPlay={autoPlay}
            setAutoPlay={setAutoPlay}
            mockMode={mockMode}
            streamMessage={streamMessage}
          />
        )}
        <StatusPanel game={displayGame} round={currentRound} showRoles={showRoles} />
      </section>

      <ActionBar
        paused={paused}
        onHistory={openCurrentHistory}
        onTogglePause={togglePause}
        onStageInfo={openStageInfo}
        onNextSentence={startGame}
      />

      {showWinnerModal && canShowWinner && <WinnerModal game={displayGame} onClose={() => setShowWinnerModal(false)} />}
      {infoModal && (
        <InfoModal title={infoModal.title} eyebrow={infoModal.eyebrow} onClose={() => setInfoModal(null)}>
          {infoModal.type === 'history' ? <CurrentGameHistory events={infoModal.events || []} /> : <StageInfo event={infoModal.event} />}
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

createRoot(document.getElementById('root')).render(<App />);
