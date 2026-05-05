import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Award, RotateCcw } from 'lucide-react';
import { openGameSocket } from '../api/gameApi';
import { classNames } from '../utils/gameState';
import { useSpeechQueue } from '../hooks/useSpeechQueue';
import { RealStartPanel } from './CenterStage';
import { TopNav } from './TopNav';

const EMPTY_DEBATE = {
  id: 'pending-debate',
  type: 'debate',
  mode: 'real',
  topic: {
    title: '等待主持人公布辩题',
    proPosition: '等待正方观点',
    conPosition: '等待反方观点'
  },
  players: [],
  phases: [],
  rounds: [],
  mvp: null,
  winner: null,
  winReason: ''
};

export function DebateGame({ selectedPlayerIds, onReturnToSelect }) {
  const [mockMode, setMockMode] = useState(true);
  const [game, setGame] = useState(EMPTY_DEBATE);
  const [status, setStatus] = useState('idle');
  const [streamMessage, setStreamMessage] = useState('Mock 模式已就绪，点击开始后由后端逐条推送辩论赛。');
  const [messageLog, setMessageLog] = useState([]);
  const [activeSpeech, setActiveSpeech] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [showRoles, setShowRoles] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const socketRef = useRef(null);
  const pendingAckRef = useRef(null);
  const pendingEventRef = useRef(null);
  const autoPlayRef = useRef(false);
  const { speechEnabled, setSpeechEnabled, speak, cancel } = useSpeechQueue();

  useEffect(() => () => closeSocket(), []);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
    if (autoPlay && pendingAckRef.current) continuePendingEvent();
  }, [autoPlay]);

  const displayGame = game || EMPTY_DEBATE;
  const currentPhase = displayGame.phases?.at(-1) || null;
  const currentSpeakerId = activeSpeech?.playerId || null;
  const isRunning = status === 'streaming';
  const controlsLocked = isRunning;
  const phaseIndex = Math.max(0, displayGame.phases?.length || 0);

  function resetToIdle(message, nextMockMode = mockMode) {
    closeSocket();
    cancel();
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    setGame(EMPTY_DEBATE);
    setMessageLog([]);
    setActiveSpeech(null);
    setStatus('idle');
    setAutoPlay(false);
    autoPlayRef.current = false;
    setStreamMessage(message || (nextMockMode ? 'Mock 模式已就绪，点击开始后由后端逐条推送辩论赛。' : '真实模式已就绪，点击开始后才会调用 AI。'));
  }

  function startGame() {
    resetToIdle('');
    setStatus('streaming');
    setAutoPlay(true);
    autoPlayRef.current = true;
    setStreamMessage('正在连接 AI 辩论赛调度器...');
    socketRef.current = openGameSocket({
      mode: mockMode ? 'mock' : 'real',
      gameType: 'debate',
      playerIds: selectedPlayerIds,
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
      setStreamMessage(event.message || '辩论赛生成失败');
      return;
    }

    applyServerEvent(event);

    if (!event.ackId) return;
    pendingAckRef.current = { socket, ackId: event.ackId };
    pendingEventRef.current = event;
    if (autoPlayRef.current) continuePendingEvent();
  }

  function applyServerEvent(event) {
    if (event.message) setStreamMessage(event.message);
    if (event.game) setGame(event.game);
    if (event.players) setGame((value) => ({ ...(value || EMPTY_DEBATE), players: event.players }));
    recordServerMessage(event);
    if (event.type === 'speech' && event.speech) {
      const label = event.speech.side === 'host' ? '主持人' : getDebateSpeakerLabel(event.game?.players || displayGame.players, event.speech.playerId);
      setStreamMessage(`${label}正在发言`);
      setActiveSpeech(event.speech.side === 'host' ? null : {
        playerId: event.speech.playerId,
        text: event.speech.text
      });
    }
    if (event.type === 'done') {
      setStatus('ready');
      setStreamMessage(event.message || '辩论赛已完成。');
    }
  }

  function recordServerMessage(event) {
    if (!event || event.type === 'done') return;
    if (event.type === 'speech' && event.speech) {
      if (event.speech.side === 'host') {
        setMessageLog((items) => [...items, { type: 'host', playerId: '主持', text: event.speech.text, title: '主持人' }]);
        return;
      }
      const label = getDebateSpeakerLabel(event.game?.players || displayGame.players, event.speech.playerId);
      setMessageLog((items) => [...items, {
        type: 'player',
        playerId: event.speech.playerId,
        side: event.speech.side,
        phaseId: event.speech.phaseId,
        kind: event.speech.kind,
        text: event.speech.text,
        title: `${label}发言`
      }]);
      return;
    }
    const narration = event.narration || getDebateNarration(event) || event.message;
    if (!narration) return;
    setMessageLog((items) => [...items, { type: 'host', playerId: '主持', text: narration, title: '主持人' }]);
  }

  function acknowledgePending() {
    const pending = pendingAckRef.current;
    setActiveSpeech(null);
    if (!pending?.ackId || pending.socket.readyState !== WebSocket.OPEN) return;
    pending.socket.send(JSON.stringify({ type: 'ack', ackId: pending.ackId }));
    pendingAckRef.current = null;
    pendingEventRef.current = null;
  }

  function continuePendingEvent() {
    const event = pendingEventRef.current;
    if (!event) return;
    cancel();
    const narration = event.narration || getDebateNarration(event);
    const speechOptions = event?.speech?.playerId ? { playerId: event.speech.playerId } : {};
    if (speechEnabled && narration) speak(narration, acknowledgePending, speechOptions);
    else window.setTimeout(acknowledgePending, event.type === 'speech' ? 280 : 120);
  }

  function requestModeToggle() {
    if (controlsLocked) return;
    const nextMode = !mockMode;
    setMockMode(nextMode);
    resetToIdle(undefined, nextMode);
  }

  function closeSocket() {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }

  function returnToSelect() {
    if (!isRunning) onReturnToSelect();
  }

  return (
    <main className={classNames('game-shell debate-shell', !mockMode && 'real-mode')}>
      <TopNav
        title="AI 辩论赛"
        subtitle="正反交锋 v1.0"
        currentRound={{ number: phaseIndex || 1 }}
        currentEvent={{ title: currentPhase?.name || '等待开赛' }}
        roundLabel={`${Math.min(phaseIndex || 1, 8)} / 8 环节`}
        autoPlay={autoPlay}
        showRoles={showRoles}
        mockMode={mockMode}
        speechEnabled={speechEnabled}
        controlsLocked={controlsLocked}
        returnDisabled={isRunning}
        onReturn={returnToSelect}
        onModeToggle={requestModeToggle}
        onSpeechToggle={() => !controlsLocked && setSpeechEnabled((value) => !value)}
        setAutoPlay={(value) => setAutoPlay(value)}
        setShowRoles={setShowRoles}
        viewAction={{
          title: isRunning ? '游戏进行中，暂不能开始下一局' : '开始下一局',
          label: '下一局',
          icon: <RotateCcw size={23} />,
          disabled: isRunning,
          onClick: startGame
        }}
      />

      {status === 'idle' || !displayGame.phases?.length ? (
        <section className="debate-start-wrap">
          <RealStartPanel status={status} message={streamMessage} onStart={startGame} />
        </section>
      ) : (
        <DebateArena
          game={displayGame}
          currentSpeakerId={currentSpeakerId}
          activeSpeech={activeSpeech}
          currentPhase={currentPhase}
          streamMessage={streamMessage}
          onPlayerSelect={setSelectedPlayer}
        />
      )}

      {status === 'error' && <p className="debate-error">{streamMessage}</p>}

      <FloatingHistory
        title="辩论历史"
        messages={messageLog}
        open={historyOpen}
        onToggle={() => setHistoryOpen((value) => !value)}
      />
      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          label={getDebatePlayerLabel(displayGame.players, selectedPlayer.id)}
          description={getDebateIdentityDescription(selectedPlayer)}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </main>
  );
}

function DebateArena({ game, currentSpeakerId, activeSpeech, currentPhase, streamMessage, onPlayerSelect }) {
  const proPlayers = useMemo(() => game.players.filter((player) => player.side === 'pro'), [game.players]);
  const conPlayers = useMemo(() => game.players.filter((player) => player.side === 'con'), [game.players]);
  const judges = useMemo(() => game.players.filter((player) => player.side === 'judge'), [game.players]);

  return (
    <section className="debate-arena">
      <div className="debate-stage-bg" aria-hidden="true" />
      <section className="debate-scoreboard">
        <h2>{game.topic?.title || '等待辩题'}</h2>
        <div>
          <span className="pro">正方：{game.topic?.proPosition}</span>
          <span className="con">反方：{game.topic?.conPosition}</span>
        </div>
      </section>

      <DebateSide title="正方" position={game.topic?.proPosition} players={proPlayers} tone="pro" currentSpeakerId={currentSpeakerId} activeSpeech={activeSpeech} onPlayerSelect={onPlayerSelect} />
      <DebateSide title="反方" position={game.topic?.conPosition} players={conPlayers} tone="con" currentSpeakerId={currentSpeakerId} activeSpeech={activeSpeech} onPlayerSelect={onPlayerSelect} />

      <section className="debate-stage-console">
        <div className="debate-current">
          <h3>{currentPhase?.name || '等待开赛'}</h3>
          <strong>{streamMessage}</strong>
        </div>
        <DebateResult game={game} />
        <div className="debate-phase-strip">
          {(game.phases || []).map((phase, index) => (
            <span className={phase.id === currentPhase?.id ? 'active' : ''} key={`${phase.id}-${index}`}>{index + 1}</span>
          ))}
        </div>
      </section>

      <section className="judge-row">
        {judges.length ? judges.map((player, index) => (
          <DebateSeat player={player} slotLabel="评委" key={player.id} currentSpeakerId={currentSpeakerId} activeSpeech={activeSpeech} onPlayerSelect={onPlayerSelect} />
        )) : <p>8 人局暂无评委，主持人负责最佳选手评选与点评。</p>}
      </section>
    </section>
  );
}

function DebateSide({ title, position, players, tone, currentSpeakerId, activeSpeech, onPlayerSelect }) {
  return (
    <aside className={`debate-side ${tone}`}>
      <div className="debate-side-head">
        <h2>{title}</h2>
        <span>{position}</span>
      </div>
      <div className="debate-seat-list">
        {players.map((player, index) => (
          <DebateSeat
            player={player}
            slotLabel={`${title}${toChineseOrdinal(index + 1)}辩`}
            key={player.id}
            currentSpeakerId={currentSpeakerId}
            activeSpeech={activeSpeech}
            onPlayerSelect={onPlayerSelect}
          />
        ))}
      </div>
    </aside>
  );
}

function DebateSeat({ player, currentSpeakerId, activeSpeech, slotLabel, onPlayerSelect }) {
  const isSpeaking = Number(currentSpeakerId) === Number(player.id);
  return (
    <article className={classNames('debate-seat', isSpeaking && 'speaking')}>
      <button
        type="button"
        className="debate-avatar player-detail-trigger"
        style={player.avatar ? { backgroundImage: `url("${formatAvatarUrl(player.avatar)}")` } : undefined}
        onClick={() => onPlayerSelect?.(player)}
        aria-label={`查看${player.nickname || player.name || `${player.id}号`}信息`}
      >
        {!player.avatar && (player.nickname || player.name || `${player.id}`).slice(0, 1)}
      </button>
      {isSpeaking && activeSpeech?.text && <div className="seat-speech-bubble">{activeSpeech.text}</div>}
      <div className="debate-nameplate">
        <strong>
          {player.nickname || player.name || `${player.id}号`}
          {player.debateRole === 'captain' && <em>队长</em>}
        </strong>
        <span>{slotLabel || '评委'}</span>
      </div>
    </article>
  );
}

function FloatingHistory({ title, messages, open, onToggle }) {
  return (
    <aside className={classNames('floating-history', open && 'open')}>
      <button type="button" className="floating-history-toggle" onClick={onToggle}>
        <span>{title}</span>
        <strong>{messages.length}</strong>
      </button>
      {open && (
        <div className="floating-history-panel">
          {messages.length ? messages.slice().reverse().map((message, index) => (
            <article key={`${message.playerId}-${messages.length - index}`}>
              <strong>{message.title || (message.type === 'host' ? '主持人' : `${message.playerId}号`)}</strong>
              <p>{message.text}</p>
            </article>
          )) : <p className="floating-history-empty">暂无历史发言。</p>}
        </div>
      )}
    </aside>
  );
}

function DebateResult({ game }) {
  if (!game.winner && !game.mvp) return null;
  const winner = game.winner === 'pro' ? '正方胜出' : game.winner === 'con' ? '反方胜出' : '双方平局';
  return (
    <section className="debate-result">
      <strong><Award size={18} />{winner}</strong>
      {game.mvp && <span>最佳选手：{game.mvp.nickname || `${game.mvp.id}号`}</span>}
      {game.winReason && <p>{game.winReason}</p>}
    </section>
  );
}

function getDebateNarration(event) {
  if (event?.type === 'speech') return event.speech?.text || '';
  return event?.message || event?.narration || '';
}

function getPlayerLabel(players, playerId) {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  if (!player) return `${playerId}号`;
  return `${player.sideLabel || ''}${player.debateRoleLabel || ''} ${player.nickname || player.name || `${player.id}号`}`;
}

function getDebatePlayerLabel(players, playerId) {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  if (!player) return `${playerId}号`;
  if (player.side === 'judge') return '评委';
  const sidePlayers = players.filter((item) => item.side === player.side);
  const index = sidePlayers.findIndex((item) => Number(item.id) === Number(playerId));
  const sideLabel = player.side === 'pro' ? '正方' : '反方';
  return `${sideLabel}${toChineseOrdinal(index + 1)}辩`;
}

function getDebateSpeakerLabel(players, playerId) {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  const roleLabel = getDebatePlayerLabel(players, playerId);
  if (!player) return roleLabel;
  return `${roleLabel}·${player.nickname || player.name || `${player.id}号`}`;
}

function getDebateIdentityDescription(player) {
  if (player.side === 'judge') return '本局评委，负责从论点清晰度、反驳质量、团队协作和表达感染力判断胜负，并参与最佳选手评选。';
  const side = player.side === 'pro' ? '正方' : '反方';
  const role = player.debateRole === 'captain' ? '队长' : '辩手';
  const position = player.position || player.sideLabel || side;
  return `本局立场：${position}。身份：${side}${role}，需要围绕本方观点推进论证、反驳对方并配合队友。`;
}

function toChineseOrdinal(value) {
  return ['零', '一', '二', '三', '四'][value] || String(value);
}

function PlayerDetailModal({ player, label, description, onClose }) {
  return (
    <div className="player-detail-backdrop" role="presentation" onClick={onClose}>
      <section className="player-detail-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="player-detail-close" onClick={onClose} aria-label="关闭">×</button>
        <div className="player-detail-head">
          <div className="player-detail-avatar" style={player.avatar ? { backgroundImage: `url("${formatAvatarUrl(player.avatar)}")` } : undefined}>
            {!player.avatar && (player.nickname || player.name || `${player.id}`).slice(0, 1)}
          </div>
          <div>
            <h3>{player.nickname || player.name || `${player.id}号`}</h3>
            <p>{label}</p>
          </div>
        </div>
        <dl>
          <div><dt>性格</dt><dd>{player.personality || '暂无'}</dd></div>
          <div><dt>本局身份</dt><dd>{label}</dd></div>
          <div><dt>身份说明</dt><dd>{description}</dd></div>
        </dl>
      </section>
    </div>
  );
}

function formatAvatarUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url.replace(/"/g, '%22');
  return encodeURI(url.startsWith('/') ? url : `/${url}`).replace(/"/g, '%22');
}
