import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ActionBar } from './components/ActionBar';
import { CenterStage, RealStartPanel } from './components/CenterStage';
import { HistoryModal } from './components/HistoryModal';
import { PlayerList } from './components/PlayerList';
import { StatusPanel } from './components/StatusPanel';
import { ErrorView, LoadingView } from './components/StateViews';
import { TopNav } from './components/TopNav';
import { WinnerModal } from './components/WinnerModal';
import { fetchGameHistory, fetchMockGame, openGameStream } from './api/gameApi';
import { buildTimeline, classNames, createEmptyGame, createPendingRound } from './utils/gameState';
import { useSpeechQueue } from './hooks/useSpeechQueue';
import './styles.css';

function App() {
  const [mockMode, setMockMode] = useState(true);
  const [game, setGame] = useState(null);
  const [step, setStep] = useState(0);
  const [autoPlay, setAutoPlay] = useState(false);
  const [realPaused, setRealPaused] = useState(false);
  const [showRoles, setShowRoles] = useState(false);
  const [showWinnerModal, setShowWinnerModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [historyLogs, setHistoryLogs] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState('');
  const [status, setStatus] = useState('loading');
  const [streamMessage, setStreamMessage] = useState('');
  const streamRef = useRef(null);
  const lastSpokenKeyRef = useRef('');
  const { speechEnabled, setSpeechEnabled, speak, cancel } = useSpeechQueue();

  useEffect(() => {
    if (mockMode) {
      startMockGame();
      return;
    }

    closeStream();
    cancel();
    setGame(createEmptyGame());
    setStep(0);
    setAutoPlay(false);
    setRealPaused(false);
    setShowWinnerModal(false);
    setStatus('idle');
    setStreamMessage('真实模式已就绪，点击开始后才会调用 AI。');
  }, [mockMode]);

  useEffect(() => () => closeStream(), []);

  const timeline = useMemo(() => (game ? buildTimeline(game) : []), [game]);
  const displayGame = game || createEmptyGame();
  const currentEvent = timeline[Math.min(step, Math.max(0, timeline.length - 1))] || {
    type: 'idle',
    title: mockMode ? '等待对局' : '游戏即将开始',
    roundData: displayGame.rounds[0] || createPendingRound()
  };
  const currentRound = currentEvent.roundData || displayGame.rounds.at(-1) || createPendingRound();
  const visibleSpeeches = mockMode
    ? timeline.slice(0, step + 1).filter((event) => event.type === 'speech').map((event) => event.speech)
    : displayGame.rounds.flatMap((round) => round.speeches || []);
  const currentSpeakerId = currentEvent.type === 'speech' ? currentEvent.speech.playerId : null;
  const canShowWinner = Boolean(displayGame.winner && displayGame.rounds.length > 0);
  const paused = mockMode ? !autoPlay : realPaused;

  useEffect(() => {
    if (!mockMode || !autoPlay || timeline.length === 0) return undefined;
    const current = timeline[step];
    const narration = getEventNarration(current);

    if (speechEnabled && narration) {
      speak(narration, () => advanceStep());
      return undefined;
    }

    const timer = window.setTimeout(() => advanceStep(), 900);
    return () => window.clearTimeout(timer);
  }, [autoPlay, mockMode, speak, speechEnabled, step, timeline]);

  useEffect(() => {
    if (!canShowWinner) return;
    if (mockMode && currentEvent.type !== 'end') return;
    if (!mockMode && status !== 'ready') return;
    setShowWinnerModal(true);
  }, [canShowWinner, currentEvent.type, mockMode, status]);

  async function startMockGame() {
    closeStream();
    cancel();
    setStatus('loading');
    setAutoPlay(false);
    setStep(0);
    setShowWinnerModal(false);
    setStreamMessage('');

    try {
      const nextGame = await fetchMockGame();
      setGame(nextGame);
      setStatus('ready');
    } catch (error) {
      console.error(error);
      setStatus('error');
      setStreamMessage(error.message);
    }
  }

  function startRealGame() {
    closeStream();
    cancel();
    lastSpokenKeyRef.current = '';
    setGame(createEmptyGame());
    setStep(0);
    setAutoPlay(false);
    setRealPaused(false);
    setShowWinnerModal(false);
    setStatus('streaming');
    setStreamMessage('正在连接后端，准备调度 AI 玩家...');
    speak('游戏开始，正在连接后端，准备调度 AI 玩家。');

    streamRef.current = openGameStream({
      onEvent: handleStreamEvent,
      onError: (error) => {
        setStatus('error');
        setStreamMessage(error.message);
      }
    });
  }

  function startNextGame() {
    if (mockMode) startMockGame();
    else startRealGame();
  }

  function handleStreamEvent(event) {
    if (event.message) setStreamMessage(event.message);

    if (event.game) {
      setGame(event.game);
      setStep(Math.max(0, buildTimeline(event.game).length - 1));
    }

    const narration = getStreamNarration(event);
    if (narration && !realPaused) speak(narration);

    if (event.type === 'speech' && event.speech) {
      const key = `${event.round?.number || 0}-${event.speech.playerId}-${event.speech.text}`;
      if (lastSpokenKeyRef.current !== key && !realPaused) {
        lastSpokenKeyRef.current = key;
        speak(`${event.speech.playerId}号发言。${event.speech.text}`);
      }
      setStreamMessage(`${event.speech.playerId}号发言完成`);
    }

    if (event.type === 'done') {
      setStatus('ready');
      setStreamMessage('真实 AI 对局已生成完成。');
      closeStream();
    }

    if (event.type === 'error') {
      setStatus('error');
      setStreamMessage(event.message || '真实 AI 对局生成失败');
      closeStream();
    }
  }

  async function openHistory() {
    setShowHistoryModal(true);
    setHistoryLoading(true);
    setHistoryError('');
    try {
      const data = await fetchGameHistory();
      setHistoryLogs(data.logs || []);
    } catch (error) {
      setHistoryError(error.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  function togglePause() {
    if (mockMode) {
      setAutoPlay((value) => !value);
      return;
    }
    setRealPaused((value) => {
      const next = !value;
      if (next) cancel();
      else speak('继续游戏。');
      return next;
    });
  }

  function outputStageInfo() {
    if (mockMode) {
      const narration = getEventNarration(currentEvent);
      setStreamMessage(narration || currentEvent.title);
      if (speechEnabled && narration) speak(narration);
    } else {
      setStreamMessage('真实模式下阶段信息由 AI 自动生成并推送。');
    }
  }

  function nextStage() {
    if (!mockMode) return;
    const nextStep = Math.min(timeline.length - 1, step + 1);
    const nextEvent = timeline[nextStep];
    const narration = getEventNarration(nextEvent);
    setStep(nextStep);
    setStreamMessage(narration || nextEvent?.title || '');
    if (speechEnabled && narration) speak(narration);
  }

  function advanceStep() {
    setStep((value) => {
      if (value >= timeline.length - 1) {
        setAutoPlay(false);
        return value;
      }
      return value + 1;
    });
  }

  function closeStream() {
    if (streamRef.current) {
      streamRef.current.close();
      streamRef.current = null;
    }
  }

  if (status === 'loading' && mockMode) return <LoadingView />;
  if (status === 'error' && !game) {
    return <ErrorView message={streamMessage} onRetry={mockMode ? startMockGame : startRealGame} />;
  }

  return (
    <main className={classNames('game-shell', !mockMode && 'real-mode')}>
      <TopNav
        currentRound={currentRound}
        currentEvent={currentEvent}
        autoPlay={autoPlay}
        showRoles={showRoles}
        mockMode={mockMode}
        status={status}
        speechEnabled={speechEnabled}
        setMockMode={setMockMode}
        setAutoPlay={setAutoPlay}
        setShowRoles={setShowRoles}
        setSpeechEnabled={setSpeechEnabled}
        resetGame={mockMode ? startMockGame : startRealGame}
      />

      <section className="game-grid">
        <PlayerList
          players={displayGame.players}
          round={currentRound}
          showRoles={showRoles}
          currentSpeakerId={currentSpeakerId}
        />

        {!mockMode && (status === 'idle' || displayGame.rounds.length === 0) ? (
          <RealStartPanel status={status} message={streamMessage} onStart={startRealGame} />
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
        mockMode={mockMode}
        onHistory={openHistory}
        onTogglePause={togglePause}
        onExile={outputStageInfo}
        onNextStage={nextStage}
      />

      {showWinnerModal && canShowWinner && (
        <WinnerModal
          game={displayGame}
          onClose={() => setShowWinnerModal(false)}
          onNextGame={startNextGame}
        />
      )}

      {showHistoryModal && (
        <HistoryModal
          logs={historyLogs}
          loading={historyLoading}
          error={historyError}
          onClose={() => setShowHistoryModal(false)}
        />
      )}
    </main>
  );
}

function getEventNarration(event) {
  if (!event) return '';
  if (event.type === 'round') {
    return `第 ${event.roundData.number} 轮开始。本轮议题，A，${event.roundData.question.a}。B，${event.roundData.question.b}。现在开始投票。`;
  }
  if (event.type === 'vote') {
    return `投票结束。A 获得 ${event.roundData.tally.A} 票，B 获得 ${event.roundData.tally.B} 票。本轮共识${event.roundData.consensus ? '成功' : '失败'}。现在进入自由讨论。`;
  }
  if (event.type === 'speech') {
    return `${event.speech.playerId}号发言。${event.speech.text}`;
  }
  if (event.type === 'exile') {
    const eliminated = event.roundData.eliminated?.id ? `${event.roundData.eliminated.id}号被放逐。` : '本轮无人被放逐。';
    return `现在公布放逐投票结果。${eliminated}`;
  }
  if (event.type === 'end') return '游戏结束，现在公布胜负结果。';
  return '';
}

function getStreamNarration(event) {
  if (event.type === 'host' || event.type === 'status') return event.message || '';
  if (event.type === 'round-start') {
    return `第 ${event.round.number} 轮开始。本轮议题，A，${event.round.question.a}。B，${event.round.question.b}。现在开始投票。`;
  }
  if (event.type === 'vote-result') {
    return `投票结束。A 获得 ${event.round.tally.A} 票，B 获得 ${event.round.tally.B} 票。本轮共识${event.round.consensus ? '成功' : '失败'}。现在进入自由讨论。`;
  }
  if (event.type === 'exile-result') {
    const eliminated = event.round.eliminated?.id ? `${event.round.eliminated.id}号被放逐。` : '本轮无人被放逐。';
    return `现在公布放逐投票结果。${eliminated}`;
  }
  if (event.type === 'done') return '游戏结束，完整比赛结果已记录。';
  return '';
}

createRoot(document.getElementById('root')).render(<App />);
