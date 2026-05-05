import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Skull, Moon, Shield, Vote, Wand2 } from 'lucide-react';
import { openGameSocket } from '../api/gameApi';
import { classNames } from '../utils/gameState';
import { useSpeechQueue } from '../hooks/useSpeechQueue';
import { RealStartPanel } from './CenterStage';
import { TopNav } from './TopNav';

const EMPTY_WEREWOLF = {
  id: 'pending-werewolf',
  type: 'werewolf',
  mode: 'real',
  event: {
    name: 'AI 狼人杀',
    background: '12人标准局：4狼人、预言家、女巫、猎人、守卫、4村民。'
  },
  players: [],
  rounds: [],
  winner: null,
  winReason: ''
};

const ROLE_NAMES = {
  werewolf: '狼人',
  seer: '预言家',
  witch: '女巫',
  hunter: '猎人',
  guard: '守卫',
  villager: '村民'
};

export function WerewolfGame({ selectedPlayerIds, onReturnToSelect }) {
  const [mockMode, setMockMode] = useState(true);
  const [game, setGame] = useState(EMPTY_WEREWOLF);
  const [status, setStatus] = useState('idle');
  const [streamMessage, setStreamMessage] = useState('Mock 模式已就绪，点击开始后由后端逐条推送狼人杀战报。');
  const [messageLog, setMessageLog] = useState([]);
  const [activeSpeech, setActiveSpeech] = useState(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [visibleRolePlayerId, setVisibleRolePlayerId] = useState(null);
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

  const displayGame = game || EMPTY_WEREWOLF;
  const currentRound = displayGame.rounds?.at(-1) || null;
  const currentSpeakerId = activeSpeech?.playerId || null;
  const isRunning = status === 'streaming';
  const controlsLocked = isRunning;
  const dayLabel = currentRound ? `第 ${currentRound.day} 天` : '等待开局';
  const phaseTitle = getPhaseTitle(currentRound, streamMessage);

  useEffect(() => {
    if (!displayGame.players?.length) {
      setVisibleRolePlayerId(null);
      return;
    }
    setVisibleRolePlayerId((value) => {
      if (value && displayGame.players.some((player) => Number(player.id) === Number(value))) return value;
      const index = Math.floor(Math.random() * displayGame.players.length);
      return displayGame.players[index]?.id || null;
    });
  }, [displayGame.id, displayGame.players?.length]);

  function resetToIdle(message, nextMockMode = mockMode) {
    closeSocket();
    cancel();
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    setGame(EMPTY_WEREWOLF);
    setMessageLog([]);
    setActiveSpeech(null);
    setSelectedPlayer(null);
    setVisibleRolePlayerId(null);
    setStatus('idle');
    setAutoPlay(false);
    autoPlayRef.current = false;
    setStreamMessage(message || (nextMockMode ? 'Mock 模式已就绪，点击开始后由后端逐条推送狼人杀战报。' : '真实模式已就绪，点击开始后才会调用 AI。'));
  }

  function startGame() {
    resetToIdle('');
    setStatus('streaming');
    setAutoPlay(true);
    autoPlayRef.current = true;
    setStreamMessage('正在连接 AI 狼人杀主持人...');
    socketRef.current = openGameSocket({
      mode: mockMode ? 'mock' : 'real',
      gameType: 'werewolf',
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
      setStreamMessage(event.message || '狼人杀生成失败');
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
    if (event.players) setGame((value) => ({ ...(value || EMPTY_WEREWOLF), players: event.players }));
    recordServerMessage(event);
    if (event.type === 'speech' && event.speech) {
      setStreamMessage(`${event.speech.playerId}号正在发言`);
      setActiveSpeech({
        playerId: event.speech.playerId,
        text: event.speech.text
      });
    }
    if ((event.type === 'last-words' || event.type === 'exile-words') && event.testimony) {
      setStreamMessage(`${event.testimony.playerId}号遗言`);
      setActiveSpeech({
        playerId: event.testimony.playerId,
        text: event.testimony.text
      });
    }
    if (event.type === 'done') {
      setStatus('ready');
      setStreamMessage(event.message || '狼人杀已完成。');
    }
  }

  function recordServerMessage(event) {
    if (!event || event.type === 'done') return;
    if (event.type === 'speech' && event.speech) {
      setMessageLog((items) => [...items, {
        type: 'player',
        playerId: event.speech.playerId,
        text: event.speech.text,
        title: `${event.speech.playerId}号发言`
      }]);
      return;
    }
    if ((event.type === 'last-words' || event.type === 'exile-words') && event.testimony) {
      setMessageLog((items) => [...items, {
        type: 'player',
        playerId: event.testimony.playerId,
        text: event.testimony.text,
        title: `${event.testimony.playerId}号遗言`
      }]);
      return;
    }
    const narration = event.narration || getWerewolfNarration(event) || event.message;
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
    const narration = event.narration || getWerewolfNarration(event);
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
    <main className={classNames('game-shell werewolf-shell', !mockMode && 'real-mode')}>
      <TopNav
        title="AI 狼人杀"
        subtitle="12人标准局 v1.0"
        currentRound={{ number: currentRound?.day || 1 }}
        currentEvent={{ title: phaseTitle }}
        roundLabel={dayLabel}
        autoPlay={autoPlay}
        showRoles={showRoles}
        mockMode={mockMode}
        speechEnabled={speechEnabled}
        controlsLocked={controlsLocked}
        returnDisabled={isRunning}
        onReturn={returnToSelect}
        onModeToggle={requestModeToggle}
        onSpeechToggle={() => !controlsLocked && setSpeechEnabled((value) => !value)}
        setAutoPlay={setAutoPlay}
        setShowRoles={setShowRoles}
      />

      {status === 'idle' || !displayGame.rounds?.length ? (
        <section className="werewolf-start-wrap">
          <RealStartPanel status={status} message={streamMessage} onStart={startGame} />
        </section>
      ) : (
        <WerewolfArena
          game={displayGame}
          currentRound={currentRound}
          currentSpeakerId={currentSpeakerId}
          activeSpeech={activeSpeech}
          showRoles={showRoles}
          visibleRolePlayerId={visibleRolePlayerId}
          streamMessage={streamMessage}
          onPlayerSelect={setSelectedPlayer}
        />
      )}

      {status === 'error' && <p className="werewolf-error">{streamMessage}</p>}

      <FloatingHistory
        title="发言历史"
        messages={messageLog}
        open={historyOpen}
        onToggle={() => setHistoryOpen((value) => !value)}
      />
      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          roleVisible={showRoles || Number(selectedPlayer.id) === Number(visibleRolePlayerId)}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </main>
  );
}

function WerewolfArena({ game, currentRound, currentSpeakerId, activeSpeech, showRoles, visibleRolePlayerId, streamMessage, onPlayerSelect }) {
  const deadPlayers = useMemo(() => game.players.filter((player) => !player.alive), [game.players]);

  return (
    <section className="werewolf-arena">
      <div className="werewolf-stage-bg" aria-hidden="true" />
      <section className="werewolf-scoreboard">
        <h2>{currentRound ? `第 ${currentRound.day} 天 · ${getPhaseTitle(currentRound, streamMessage)}` : '月夜圆桌等待开局'}</h2>
        <p>{game.event?.background}</p>
      </section>

      <section className="werewolf-table">
        {game.players.map((player, index) => (
          <WerewolfSeat
            player={player}
            seatIndex={index}
            showRoles={showRoles}
            visibleRolePlayerId={visibleRolePlayerId}
            currentSpeakerId={currentSpeakerId}
            activeSpeech={activeSpeech}
            onPlayerSelect={onPlayerSelect}
            key={player.id}
          />
        ))}
      </section>

      <section className="werewolf-stage">
        <div className="werewolf-current">
          <div><Moon size={20} /><span>{streamMessage}</span></div>
          <strong>{getRoundResult(currentRound)}</strong>
        </div>

        <WerewolfResult game={game} />

        <aside className="werewolf-right">
          <PanelHeader icon={<Skull size={18} />} title={`出局玩家（${deadPlayers.length}）`} />
          <div className="werewolf-dead-list">
            {deadPlayers.length ? deadPlayers.map((player) => (
              <article key={player.id}>
                <strong>{player.nickname || `${player.id}号`}</strong>
                <span>{player.deathReason || '出局'} · 第{player.deathDay || '?'}天</span>
                <em>{getVisibleRoleText(player, showRoles, visibleRolePlayerId)}</em>
              </article>
            )) : <p>暂无出局玩家。</p>}
          </div>
          <SkillLedger round={currentRound} />
        </aside>
      </section>
    </section>
  );
}

function WerewolfSeat({ player, seatIndex, showRoles, visibleRolePlayerId, currentSpeakerId, activeSpeech, onPlayerSelect }) {
  const isSpeaking = Number(currentSpeakerId) === Number(player.id);
  return (
    <article
      className={classNames('werewolf-seat', isSpeaking && 'speaking', !player.alive && 'dead', showRoles && player.role)}
      style={{ '--seat': seatIndex + 1 }}
    >
      <button
        type="button"
        className="werewolf-avatar player-detail-trigger"
        style={player.avatar ? { backgroundImage: `url("${formatAvatarUrl(player.avatar)}")` } : undefined}
        onClick={() => onPlayerSelect?.(player)}
        aria-label={`查看${player.nickname || player.name || `${player.id}号`}信息`}
      >
        {!player.avatar && (player.nickname || player.name || `${player.id}`).slice(0, 1)}
      </button>
      {isSpeaking && activeSpeech?.text && <div className="seat-speech-bubble">{activeSpeech.text}</div>}
      <div className="werewolf-nameplate">
        <strong>{player.nickname || player.name || `${player.id}号`} · {getVisibleRoleText(player, showRoles, visibleRolePlayerId)}</strong>
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

function SkillLedger({ round }) {
  if (!round) return null;
  return (
    <section className="skill-ledger">
      <PanelHeader icon={<Wand2 size={17} />} title="本轮记录" />
      <p>夜晚：{round.night?.deaths?.length ? `${round.night.deaths.map((item) => `${item.id}号`).join('、')}死亡` : '平安夜或等待结算'}</p>
      <p>放逐：{round.exile ? `${round.exile.id}号` : '暂无'}</p>
      <p>猎人：{round.hunterShot ? `${round.hunterShot.from}号带走${round.hunterShot.target}号` : '暂无开枪'}</p>
      <div className="vote-mini">
        <Vote size={16} />
        <span>{formatVotes(round.voteTally)}</span>
      </div>
    </section>
  );
}

function WerewolfResult({ game }) {
  if (!game.winner) return null;
  const winner = game.winner === 'wolves' ? '狼人阵营胜利' : '好人阵营胜利';
  return (
    <section className="werewolf-result">
      <strong><Shield size={18} />{winner}</strong>
      <p>{game.winReason}</p>
    </section>
  );
}

function PanelHeader({ icon, title }) {
  return <div className="werewolf-panel-title">{icon}<strong>{title}</strong></div>;
}

function getPhaseTitle(round, streamMessage) {
  if (!round) return streamMessage || '等待开赛';
  if (round.phase === 'night') return '夜晚行动';
  if (round.phase === 'day') return '白天发言与投票';
  return streamMessage || '游戏进行中';
}

function getRoundResult(round) {
  if (!round) return '等待主持人发牌。';
  const night = round.night?.deaths?.length ? `夜晚死亡：${round.night.deaths.map((item) => `${item.id}号`).join('、')}` : '夜晚：平安夜';
  const exile = round.exile ? `放逐：${round.exile.id}号` : '放逐：暂无';
  return `${night}；${exile}`;
}

function getWerewolfNarration(event) {
  if (event?.type === 'speech') return event.speech?.text || '';
  if (event?.type === 'last-words' || event?.type === 'exile-words') return event.testimony?.text || '';
  return event?.message || event?.narration || '';
}

function getPlayerLabel(players, playerId) {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  if (!player) return `${playerId}号`;
  return `${player.nickname || player.name || `${player.id}号`}`;
}

function formatVotes(tally = {}) {
  const entries = Object.entries(tally || {});
  if (!entries.length) return '暂无投票';
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${id}号${count}票`)
    .join(' · ');
}

function getVisibleRoleText(player, showRoles, visibleRolePlayerId) {
  if (showRoles || Number(player.id) === Number(visibleRolePlayerId)) return player.roleLabel || ROLE_NAMES[player.role] || '未知身份';
  return '身份隐藏';
}

function getRoleDescription(player, roleVisible) {
  if (!roleVisible) return '玩家视角下，本局仅公开一名随机玩家身份；该玩家身份暂时隐藏。';
  const role = player.roleLabel || ROLE_NAMES[player.role] || '未知身份';
  const descriptions = {
    werewolf: '狼人阵营，夜晚参与击杀，白天需要伪装好人、引导票型并保护狼队友。',
    seer: '好人阵营神职，夜晚可以查验一名玩家阵营，白天需要谨慎传递信息。',
    witch: '好人阵营神职，拥有一次解药和一次毒药，需要根据夜晚死亡信息判断用药。',
    hunter: '好人阵营神职，死亡或被放逐时可选择开枪带走一名玩家。',
    guard: '好人阵营神职，夜晚守护一名玩家，不能连续两晚守护同一人。',
    villager: '好人阵营平民，没有夜晚技能，依靠发言、票型和死亡信息寻找狼人。'
  };
  return `${role}：${descriptions[player.role] || '根据公开发言和阶段信息参与判断。'}`;
}

function PlayerDetailModal({ player, roleVisible, onClose }) {
  const roleText = roleVisible ? player.roleLabel || ROLE_NAMES[player.role] || '未知身份' : '身份隐藏';
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
            <p>{roleText}</p>
          </div>
        </div>
        <dl>
          <div><dt>性格</dt><dd>{player.personality || '暂无'}</dd></div>
          <div><dt>本局身份</dt><dd>{roleText}</dd></div>
          <div><dt>身份说明</dt><dd>{getRoleDescription(player, roleVisible)}</dd></div>
          <div><dt>状态</dt><dd>{player.alive ? '存活' : `${player.deathReason || '出局'} · 第${player.deathDay || '?'}天`}</dd></div>
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
