import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw, Moon, Shield, Vote, Wand2 } from 'lucide-react';
import { openGameSocket } from '../api/gameApi';
import { classNames } from '../utils/gameState';
import { useSpeechQueue } from '../hooks/useSpeechQueue';
import { SpeechSubtitle } from './SpeechSubtitle';
import { TopNav } from './TopNav';
import '../styles/werewolf-game.css';

const EMPTY_WEREWOLF = {
  id: 'pending-werewolf',
  type: 'werewolf',
  mode: 'real',
  event: {
    name: 'AI 狼人杀',
    background: '12人标准局（预女猎白）：4狼人、预言家、女巫、猎人、白痴、4平民。'
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
  idiot: '白痴',
  guard: '守卫',
  villager: '村民'
};

const WEREWOLF_MODES = [
  {
    id: 'standard-12',
    name: '标准12人局',
    description: '预女猎白：4狼人、预言家、女巫、猎人、白痴、4平民。'
  },
  {
    id: 'mirror-mist',
    name: '镜隐迷踪',
    description: '强调身份误导和镜像信息的迷踪局。'
  },
  {
    id: 'white-wolf-king-knight',
    name: '白狼王騎士',
    description: '加入白狼王与骑士对抗，节奏更激烈。'
  },
  {
    id: 'wolf-beauty-knight',
    name: '狼美人騎士',
    description: '狼美人与骑士同场，夜晚连接和白天决斗并重。'
  },
  {
    id: 'gargoyle-gravekeeper',
    name: '石像鬼守墓人',
    description: '石像鬼查验身份，守墓人追踪放逐信息。'
  },
  {
    id: 'thief-cupid',
    name: '盗贼丘比特',
    description: '盗贼换牌与丘比特情侣线改变阵营判断。'
  }
];

export function WerewolfGame({ selectedPlayerIds, onReturnToSelect }) {
  const [mockMode, setMockMode] = useState(true);
  const [game, setGame] = useState(EMPTY_WEREWOLF);
  const [status, setStatus] = useState('idle');
  const [streamMessage, setStreamMessage] = useState('等待开局');
  const [messageLog, setMessageLog] = useState([]);
  const [activeSpeech, setActiveSpeech] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [werewolfMode, setWerewolfMode] = useState(WEREWOLF_MODES[0]);
  const [visibleRolePlayerId, setVisibleRolePlayerId] = useState(null);
  const [showRoles, setShowRoles] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const socketRef = useRef(null);
  const pendingAckRef = useRef(null);
  const pendingEventRef = useRef(null);
  const autoPlayRef = useRef(false);
  const ackTimerRef = useRef(null);
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
  const canStartNextGame = !isRunning || (mockMode && !autoPlay);
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
    clearPendingAckTimer();
    setGame(EMPTY_WEREWOLF);
    setMessageLog([]);
    setActiveSpeech(null);
    setSelectedPlayer(null);
    setVisibleRolePlayerId(null);
    setStatus('idle');
    setAutoPlay(false);
    autoPlayRef.current = false;
    setStreamMessage(message || (nextMockMode ? '游戏准备' : 'AI游戏准备'));
  }

  function startGame(modeConfig = werewolfMode) {
    resetToIdle('');
    setWerewolfMode(modeConfig);
    setModeDialogOpen(false);
    setStatus('streaming');
    setAutoPlay(true);
    autoPlayRef.current = true;
    setStreamMessage('游戏准备中...');
    socketRef.current = openGameSocket({
      mode: mockMode ? 'mock' : 'real',
      gameType: 'werewolf',
      playerIds: selectedPlayerIds,
      werewolfMode: modeConfig,
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
      return;
    }
    if ((event.type === 'last-words' || event.type === 'exile-words') && event.testimony) {
      setStreamMessage(`${event.testimony.playerId}号遗言`);
      setActiveSpeech({
        playerId: event.testimony.playerId,
        text: event.testimony.text
      });
      return;
    }
    const subtitleText = event.narration || getWerewolfNarration(event) || event.message;
    if (subtitleText && event.type !== 'game') {
      setActiveSpeech({ playerId: null, text: subtitleText });
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
    clearPendingAckTimer();
  }

  function continuePendingEvent() {
    const event = pendingEventRef.current;
    if (!event) return;
    cancel();
    clearPendingAckTimer();
    const narration = event.narration || getWerewolfNarration(event);
    const speechOptions = event?.speech?.playerId ? { playerId: event.speech.playerId } : {};
    if (speechEnabled && narration) speak(narration, acknowledgePending, speechOptions);
    else ackTimerRef.current = window.setTimeout(acknowledgePending, event.type === 'speech' ? 280 : 120);
  }

  function clearPendingAckTimer() {
    if (!ackTimerRef.current) return;
    window.clearTimeout(ackTimerRef.current);
    ackTimerRef.current = null;
  }

  function sendPlaybackControl(paused) {
    if (socketRef.current?.readyState === WebSocket.OPEN) {
      socketRef.current.send(JSON.stringify({ type: 'control', action: paused ? 'pause' : 'resume' }));
    }
  }

  function handleAutoPlayChange(value) {
    const next = Boolean(value);
    setAutoPlay(next);
    autoPlayRef.current = next;
    sendPlaybackControl(!next);
    if (!next) {
      cancel();
      clearPendingAckTimer();
    }
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
        setAutoPlay={handleAutoPlayChange}
        setShowRoles={setShowRoles}
        viewAction={{
          title: isRunning && autoPlay ? '暂停后可以开始下一局' : displayGame.rounds?.length ? '开始下一局' : '开始游戏',
          label: displayGame.rounds?.length ? '下一局' : '开始',
          icon: <RotateCcw size={23} />,
          disabled: !canStartNextGame,
          onClick: () => startGame(WEREWOLF_MODES[0])
        }}
      />

      {status === 'idle' || !displayGame.rounds?.length ? (
        <section className="werewolf-idle-stage" aria-label="狼人杀待开始">
          <div className="game-idle-loading" aria-live="polite">
            <span aria-hidden="true" />
            <strong>等待开局</strong>
          </div>
        </section>
      ) : (
        <WerewolfArena
          game={displayGame}
          messages={messageLog}
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

      {modeDialogOpen && (
        <WerewolfModeDialog
          modes={WEREWOLF_MODES}
          selectedMode={werewolfMode}
          onSelect={setWerewolfMode}
          onCancel={onReturnToSelect}
          onStart={() => startGame(werewolfMode)}
        />
      )}

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

function WerewolfArena({ game, messages, currentRound, currentSpeakerId, activeSpeech, showRoles, visibleRolePlayerId, streamMessage, onPlayerSelect }) {
  const orderedPlayers = (game.players || []).slice().sort((a, b) => Number(a.id) - Number(b.id));

  return (
    <section className="werewolf-arena">
      <div className="werewolf-stage-bg" aria-hidden="true" />
      <section className="werewolf-scoreboard">
        <h2>{currentRound ? `第 ${currentRound.day} 天 · ${getPhaseTitle(currentRound, streamMessage)}` : '月夜圆桌等待开局'}</h2>
        <p>{game.event?.background}</p>
      </section>

      <section className="werewolf-table">
        {orderedPlayers.map((player, index) => (
          <WerewolfSeat
            player={player}
            seatIndex={index}
            actionTarget={shouldShowWerewolfActionTargets(currentRound) ? getWerewolfActionTarget(currentRound, player) : null}
            showRoles={showRoles}
            visibleRolePlayerId={visibleRolePlayerId}
            currentSpeakerId={currentSpeakerId}
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
          <WerewolfGameRecord
            rounds={game.rounds || []}
            players={game.players || []}
            showRoles={showRoles}
            visibleRolePlayerId={visibleRolePlayerId}
          />
          <WerewolfHistory messages={messages} />
        </aside>
      </section>
      <SpeechSubtitle speech={activeSpeech} />
    </section>
  );
}

function WerewolfHistory({ messages }) {
  const [openKey, setOpenKey] = useState('');
  const orderedMessages = messages.slice().reverse();

  return (
    <section className="werewolf-history-panel">
      <PanelHeader icon={<Vote size={17} />} title={`发言历史（${messages.length}）`} />
      <div className="werewolf-history-list">
        {orderedMessages.length ? orderedMessages.map((message, index) => {
          const key = `${message.playerId}-${messages.length - index}`;
          const open = openKey === key;
          return (
            <article className={open ? 'open' : ''} key={key}>
              <button type="button" onClick={() => setOpenKey(open ? '' : key)}>
                {message.title || (message.type === 'host' ? '主持人' : `${message.playerId}号`)}
              </button>
              {open && <p>{message.text}</p>}
            </article>
          );
        }) : <p className="floating-history-empty">暂无历史发言。</p>}
      </div>
    </section>
  );
}

function WerewolfModeDialog({ modes, selectedMode, onSelect, onCancel, onStart }) {
  return (
    <div className="werewolf-mode-backdrop" role="presentation">
      <section className="werewolf-mode-dialog" role="dialog" aria-modal="true" aria-label="选择狼人杀模式">
        <header>
          <h2>选择狼人杀模式</h2>
          <button type="button" onClick={onCancel}>返回</button>
        </header>
        <div className="werewolf-mode-grid">
          {modes.map((mode) => (
            <button
              type="button"
              className={classNames('werewolf-mode-card', selectedMode.id === mode.id && 'active')}
              onClick={() => onSelect(mode)}
              key={mode.id}
            >
              <strong>{mode.name}</strong>
              <span>{mode.description}</span>
            </button>
          ))}
        </div>
        <footer>
          <button type="button" className="primary" onClick={onStart}>开始游戏</button>
        </footer>
      </section>
    </div>
  );
}

function WerewolfSeat({ player, seatIndex, actionTarget, showRoles, visibleRolePlayerId, currentSpeakerId, onPlayerSelect }) {
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
        <span className="werewolf-seat-number">{player.id}</span>
        {!player.alive && <span className="werewolf-dead-badge">出局</span>}
      </button>
      {actionTarget && <span className="werewolf-action-badge">{actionTarget}</span>}
      <div className="werewolf-nameplate">
        <strong>
          {player.nickname || player.name || `${player.id}号`}
          <br />
          {getVisibleRoleText(player, showRoles, visibleRolePlayerId)}
        </strong>
      </div>
    </article>
  );
}

function WerewolfGameRecord({ rounds, players, showRoles, visibleRolePlayerId }) {
  if (!rounds?.length) return null;
  const orderedRounds = rounds.slice().reverse();

  return (
    <section className="skill-ledger werewolf-game-record">
      <PanelHeader icon={<Wand2 size={17} />} title="游戏记录" />
      <div className="werewolf-record-list">
        {orderedRounds.map((round) => (
          <article key={`round-${round.day}`}>
            <strong>第 {round.day} 天</strong>
            {round.sheriffId && <p>警长：{formatWerewolfRecordPlayer(round.sheriffId, players, showRoles, visibleRolePlayerId)}（放逐投票 1.5 票）</p>}
            <p>夜晚：{formatNightSummary(round, players, showRoles, visibleRolePlayerId)}</p>
            {showRoles && <WerewolfGodRecord round={round} players={players} />}
            <p>
              放逐：
              {round.exile
                ? formatWerewolfRecordPlayer(round.exile.id, players, showRoles, visibleRolePlayerId, round.exile.deathReason || round.exile.reason)
                : round.idiotReveal
                  ? `${formatWerewolfRecordPlayer(round.idiotReveal.id, players, showRoles, visibleRolePlayerId)} 翻牌免死`
                  : '暂无'}
            </p>
            <p>
              猎人：
              {round.hunterShot
                ? `${formatWerewolfRecordPlayer(round.hunterShot.from, players, showRoles, visibleRolePlayerId)} 带走 ${formatWerewolfRecordPlayer(round.hunterShot.target, players, showRoles, visibleRolePlayerId)}`
                : '暂无开枪'}
            </p>
            <div className="vote-mini">
              <Vote size={16} />
              <span>{formatVotes(round.voteTally)}</span>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function WerewolfGodRecord({ round, players }) {
  const wolfChoices = Object.entries(round.night?.wolfChoices || {});
  const seerCheck = round.night?.seerCheck;
  const guardTarget = round.night?.guardTarget;
  const witchSave = round.night?.witchSave;
  const poisonTarget = round.night?.witchPoisonTarget;

  return (
    <div className="werewolf-god-record">
      <p>狼人部署：{round.night?.wolfStrategy || (wolfChoices.length ? '见刀口明细' : '暂无')}</p>
      <p>刀口明细：{wolfChoices.length ? wolfChoices.map(([wolfId, target]) => `${formatWerewolfRecordPlayer(wolfId, players, true)} 刀 ${formatWerewolfRecordPlayer(target, players, true)}`).join('；') : '暂无'}</p>
      <p>最终刀口：{round.night?.wolfTarget ? formatWerewolfRecordPlayer(round.night.wolfTarget, players, true) : '暂无'}</p>
      <p>预言家：{seerCheck ? `查验 ${formatWerewolfRecordPlayer(seerCheck.target, players, true)}，结果 ${seerCheck.result}` : '暂无查验'}</p>
      <p>女巫：{witchSave ? `使用解药救 ${formatWerewolfRecordPlayer(round.night?.wolfTarget, players, true)}` : '未使用解药'}；毒药：{poisonTarget ? formatWerewolfRecordPlayer(poisonTarget, players, true) : '未使用'}</p>
      <p>守卫：{guardTarget ? `守护 ${formatWerewolfRecordPlayer(guardTarget, players, true)}` : '暂无守护'}</p>
    </div>
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

function shouldShowWerewolfActionTargets(round) {
  return Boolean(round?.voteTally && Object.keys(round.voteTally).length);
}

function getWerewolfActionTarget(round, player) {
  if (!round || !player) return null;
  return round.votes?.[player.id] || null;
}

function formatNightSummary(round, players, showRoles, visibleRolePlayerId) {
  const deaths = round?.night?.deaths || [];
  if (deaths.length) {
    return `${deaths
      .map((death) => formatWerewolfRecordPlayer(death.id, players, showRoles, visibleRolePlayerId, death.reason))
      .join('、')} 死亡`;
  }

  const wolfTarget = round?.night?.wolfTarget;
  const witchSaved = round?.night?.witchSave;
  const guardTarget = round?.night?.guardTarget;
  const guardSaved = wolfTarget && guardTarget && Number(wolfTarget) === Number(guardTarget);

  if (wolfTarget) {
    const target = formatWerewolfRecordPlayer(wolfTarget, players, showRoles, visibleRolePlayerId);
    const result = witchSaved ? '女巫解救' : guardSaved ? '守护成功' : '无人死亡';
    return `刀口 ${target}，${result}`;
  }

  return round?.phase === 'night' ? '等待夜晚结算' : '平安夜';
}

function formatWerewolfRecordPlayer(playerId, players, showRoles, visibleRolePlayerId, reason) {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  const name = player ? (player.nickname || player.name || `${player.id}号`) : `${playerId}号`;
  const role = player ? getVisibleRoleText(player, showRoles, visibleRolePlayerId) : '';
  const detail = [role, reason].filter(Boolean).join(' · ');
  return `${name}${detail ? `（${detail}）` : ''}`;
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
    idiot: '好人阵营神职，被白天放逐时可翻牌免死，但之后失去投票权。',
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
