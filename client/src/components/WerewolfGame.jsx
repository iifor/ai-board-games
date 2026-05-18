import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Crown,
  Eye,
  EyeOff,
  FlaskConical,
  Moon,
  Shield,
  Skull,
  Sparkles,
  Sun,
  Swords,
  Users,
  Vote,
  Wand2,
  ArrowLeft,
  FastForward,
  Pause,
  Play,
  RotateCcw
} from 'lucide-react';
import { fetchAiPlayers, fetchWerewolfModes, openGameSocket } from '../api/gameApi';
import { formatAvatarUrl } from '../utils/avatar';
import { classNames } from '../utils/gameState';
import { useSpeechQueue } from '../hooks/useSpeechQueue';
import { SpeechSubtitle } from './SpeechSubtitle';
import { SpeechInsightOverlay } from './SpeechInsightOverlay';
import '../styles/werewolf-game.css';

const EMPTY_WEREWOLF = {
  id: 'pending-werewolf',
  type: 'werewolf',
  mode: 'real',
  event: {
    name: 'AI 狼人杀',
    background: '12 人标准局：狼人阵营与神职、平民阵营在昼夜轮转中对抗。'
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

const ROLE_ICON = {
  werewolf: <Swords size={18} />,
  seer: <Eye size={18} />,
  witch: <FlaskConical size={18} />,
  hunter: <Vote size={18} />,
  idiot: <Sparkles size={18} />,
  guard: <Shield size={18} />,
  villager: <Users size={18} />
};

const EVENT_LABELS = {
  players: '玩家入场',
  'phase-start': '阶段开始',
  'night-result': '夜间结算',
  'day-start': '天亮播报',
  'sheriff-result': '警长竞选',
  speech: '白天发言',
  'vote-result': '放逐投票',
  'last-words': '夜晚遗言',
  'exile-words': '放逐遗言',
  'hunter-shot': '猎人开枪',
  game: '胜负结算',
  host: '主持播报'
};

export function WerewolfGame({ replayGameId = '', onReturnToSelect }) {
  const [game, setGame] = useState(EMPTY_WEREWOLF);
  const [status, setStatus] = useState('idle');
  const [streamMessage, setStreamMessage] = useState('等待开局');
  const [messageLog, setMessageLog] = useState([]);
  const [eventLog, setEventLog] = useState([]);
  const [activeSpeech, setActiveSpeech] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [werewolfModes, setWerewolfModes] = useState([]);
  const [werewolfMode, setWerewolfMode] = useState(null);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [selectedHostId, setSelectedHostId] = useState('default');
  const [setupError, setSetupError] = useState('');
  const [visibleRolePlayerId, setVisibleRolePlayerId] = useState(null);
  const [showRoles, setShowRoles] = useState(true);
  const [autoPlay, setAutoPlay] = useState(false);
  const [isReplayMode, setIsReplayMode] = useState(false);
  const socketRef = useRef(null);
  const pendingAckRef = useRef(null);
  const pendingEventRef = useRef(null);
  const autoPlayRef = useRef(false);
  const ackTimerRef = useRef(null);
  const { speechEnabled, setSpeechEnabled, speak, cancel } = useSpeechQueue();

  useEffect(() => () => closeSocket(), []);

  useEffect(() => {
    fetchWerewolfModes()
      .then((modes) => {
        const enabledModes = Array.isArray(modes) ? modes : [];
        setWerewolfModes(enabledModes);
        setWerewolfMode((current) => current && enabledModes.some((mode) => mode.id === current.id) ? current : enabledModes[0] || null);
      })
      .catch((error) => {
        setWerewolfModes([]);
        setWerewolfMode(null);
        setStreamMessage(error.message);
      });
  }, []);

  useEffect(() => {
    if (!modeDialogOpen) return;
    let cancelled = false;
    fetchAiPlayers()
      .then((players) => {
        if (cancelled) return;
        const sorted = sortPlayersById(players || []);
        setAvailablePlayers(sorted);
        setSelectedPlayerIds((current) => normalizeWerewolfSelectedIds(current, sorted, werewolfMode));
      })
      .catch((error) => {
        if (cancelled) return;
        setAvailablePlayers([]);
        setSetupError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [modeDialogOpen, werewolfMode?.id]);

  useEffect(() => {
    if (!replayGameId || (!werewolfMode && !replayGameId)) return;
    startGame(werewolfMode, [], selectedHostId, { replayGameId });
  }, [replayGameId, werewolfMode?.id]);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
    if (autoPlay && pendingAckRef.current) continuePendingEvent();
  }, [autoPlay]);

  const displayGame = game || EMPTY_WEREWOLF;
  const currentRound = displayGame.rounds?.at(-1) || null;
  const currentSpeakerId = activeSpeech?.playerId || null;
  const isRunning = status === 'streaming';
  const canStartNextGame = !isRunning || !autoPlay;

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

  function resetToIdle(message) {
    closeSocket();
    cancel();
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    clearPendingAckTimer();
    setGame(EMPTY_WEREWOLF);
    setMessageLog([]);
    setEventLog([]);
    setActiveSpeech(null);
    setSelectedPlayer(null);
    setVisibleRolePlayerId(null);
    setStatus('idle');
    setAutoPlay(false);
    setIsReplayMode(false);
    setSelectedHostId('default');
    autoPlayRef.current = false;
    setStreamMessage(message || 'AI 游戏准备');
  }

  function requestStartGame() {
    if (!canStartNextGame) return;
    setSetupError('');
    setSelectedPlayerIds((current) => normalizeWerewolfSelectedIds(current, availablePlayers, werewolfMode));
    setModeDialogOpen(true);
  }

  function startGame(modeConfig = werewolfMode, playerIds = selectedPlayerIds, hostId = selectedHostId, options = {}) {
    if (!modeConfig?.id && !options.replayGameId) {
      setStatus('error');
      setStreamMessage('暂无可用狼人杀模式，请先在 B 端启用模式。');
      setModeDialogOpen(true);
      return;
    }
    const sortedPlayerIds = sanitizeWerewolfSelectedIds(playerIds, availablePlayers);
    if (!options.replayGameId && sortedPlayerIds.length !== getWerewolfModePlayerCount(modeConfig)) {
      setSetupError(`当前模式需要选择 ${getWerewolfModePlayerCount(modeConfig)} 位玩家。`);
      setModeDialogOpen(true);
      return;
    }
    resetToIdle('');
    setWerewolfMode(modeConfig);
    setSelectedPlayerIds(sortedPlayerIds);
    setSelectedHostId(normalizeWerewolfHostId(hostId));
    setModeDialogOpen(false);
    setStatus('streaming');
    setIsReplayMode(Boolean(options.replayGameId));
    setAutoPlay(true);
    autoPlayRef.current = true;
    setStreamMessage('游戏准备中...');
    socketRef.current = openGameSocket({
      mode: 'real',
      gameType: 'werewolf',
      playerIds: sortedPlayerIds,
      hostId: normalizeWerewolfHostId(hostId),
      werewolfMode: modeConfig,
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
    if (event.players) {
      setGame((value) => ({
        ...(event.game || value || EMPTY_WEREWOLF),
        players: event.players
      }));
    }
    archiveServerEvent(event);

    if (event.type === 'speech' && event.speech) {
      setStreamMessage(`${event.speech.playerId} 号正在发言`);
      setActiveSpeech({
        playerId: event.speech.playerId,
        text: event.subtitle?.text || event.speech.text,
        fullText: event.speech.fullText || event.speech.text,
        thinking: event.speech.thinking || ''
      });
      return;
    }

    if ((event.type === 'last-words' || event.type === 'exile-words') && event.testimony) {
      setStreamMessage(`${event.testimony.playerId} 号遗言`);
      setActiveSpeech({
        playerId: event.testimony.playerId,
        text: event.subtitle?.text || event.testimony.text,
        fullText: event.testimony.fullText || event.testimony.text,
        thinking: event.testimony.thinking || ''
      });
      return;
    }

    const subtitleText = event.subtitle?.text || event.narration || getWerewolfNarration(event) || event.message;
    if (subtitleText && event.type !== 'game') {
      setActiveSpeech({ playerId: null, text: subtitleText });
    }
    if (event.type === 'done') {
      setStatus('ready');
      setStreamMessage(event.message || '狼人杀已完成。');
    }
  }

  function archiveServerEvent(event) {
    if (!event || event.type === 'done') return;
    const entry = buildEventLogEntry(event);
    if (entry) setEventLog((items) => [...items, entry].slice(-80));

    if (event.type === 'speech' && event.speech) {
      setMessageLog((items) => [...items, {
        type: 'player',
        playerId: event.speech.playerId,
        text: event.speech.text,
        title: `${event.speech.playerId} 号发言`
      }].slice(-80));
      return;
    }
    if ((event.type === 'last-words' || event.type === 'exile-words') && event.testimony) {
      setMessageLog((items) => [...items, {
        type: 'player',
        playerId: event.testimony.playerId,
        text: event.testimony.text,
        title: `${event.testimony.playerId} 号遗言`
      }].slice(-80));
      return;
    }
    const narration = event.narration || getWerewolfNarration(event) || event.message;
    if (!narration) return;
    setMessageLog((items) => [...items, { type: 'host', playerId: '主持', text: narration, title: '主持人' }].slice(-80));
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
    const narration = event.subtitle?.text || event.narration || getWerewolfNarration(event);
    const speakerId = event?.speech?.playerId || event?.testimony?.playerId;
    const speechPlayer = speakerId
      ? displayGame.players?.find((player) => Number(player.id) === Number(speakerId))
      : null;
    const speechOptions = speakerId
      ? { playerId: speakerId, voicePackageId: speechPlayer?.voicePackageId, audioUrl: event.audioUrl }
      : { voicePackageId: event.game?.host?.voicePackageId, audioUrl: event.audioUrl };
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

  function skipCurrentReplayPhase() {
    if (!isReplayMode || socketRef.current?.readyState !== WebSocket.OPEN) return;
    cancel();
    clearPendingAckTimer();
    setActiveSpeech(null);
    setStreamMessage('正在跳过当前阶段...');
    socketRef.current.send(JSON.stringify({ type: 'control', action: 'skip-phase' }));
  }

  function closeSocket() {
    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }
  }

  function returnToSelect() {
    closeSocket();
    cancel();
    clearPendingAckTimer();
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    autoPlayRef.current = false;
    onReturnToSelect();
  }

  return (
    <main className="game-shell werewolf-shell real-mode">
      <WerewolfControls
        autoPlay={autoPlay}
        startDisabled={!canStartNextGame}
        playbackDisabled={status === 'idle' && !displayGame.rounds?.length}
        showSkip={isReplayMode}
        skipDisabled={!isReplayMode || status !== 'streaming'}
        onReturn={returnToSelect}
        setAutoPlay={handleAutoPlayChange}
        onStart={requestStartGame}
        onSkipPhase={skipCurrentReplayPhase}
      />

      {status === 'idle' || !displayGame.rounds?.length ? (
        <section className="werewolf-idle-stage" aria-label="狼人杀待开始">
          <div className="werewolf-idle-brand">
            <p>狼人杀</p>
            <h2>观赛视角</h2>
            <span>{werewolfMode?.name || '标准局'}</span>
          </div>
          <div className="werewolf-idle-card">
            <span>月夜圆桌</span>
            <h2>等待开局</h2>
            <p>{werewolfMode?.description || '身份牌已准备，等待主持人开启本局。'}</p>
            <button type="button" disabled={!werewolfMode?.id} onClick={requestStartGame}>
              开始游戏
            </button>
          </div>
          <div className="game-idle-loading" aria-live="polite">
            <span aria-hidden="true" />
            <strong>{streamMessage || '等待开局'}</strong>
          </div>
        </section>
      ) : (
        <WerewolfArena
          game={displayGame}
          mode={werewolfMode}
          currentRound={currentRound}
          currentSpeakerId={currentSpeakerId}
          activeSpeech={activeSpeech}
          showRoles={showRoles}
          visibleRolePlayerId={visibleRolePlayerId}
          streamMessage={streamMessage}
          onShowRolesChange={setShowRoles}
          onPlayerSelect={setSelectedPlayer}
        />
      )}

      {status === 'error' && <p className="werewolf-error">{streamMessage}</p>}

      {modeDialogOpen && (
        <WerewolfModeDialog
          modes={werewolfModes}
          selectedMode={werewolfMode}
          onSelect={(mode) => {
            setWerewolfMode(mode);
            setSetupError('');
            setSelectedPlayerIds((value) => normalizeWerewolfSelectedIds(value, availablePlayers, mode));
          }}
          onCancel={() => setModeDialogOpen(false)}
          players={availablePlayers}
          selectedPlayerIds={selectedPlayerIds}
          selectedHostId={selectedHostId}
          onHostChange={setSelectedHostId}
          onPlayerToggle={(id) => setSelectedPlayerIds((value) => toggleWerewolfPlayerId(value, id, werewolfMode))}
          error={setupError}
          onStart={(mode, playerIds, hostId) => startGame(mode, playerIds, hostId)}
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

function WerewolfControls({ autoPlay, startDisabled, playbackDisabled, showSkip, skipDisabled, onReturn, setAutoPlay, onStart, onSkipPhase }) {
  return (
    <nav className="werewolf-controls" aria-label="狼人杀控制">
      <button type="button" title="返回游戏选择" onClick={onReturn}>
        <ArrowLeft size={18} />
        <span>返回</span>
      </button>
      <button type="button" title={startDisabled ? '暂停后可以开局' : '开局'} disabled={startDisabled} onClick={onStart}>
        <RotateCcw size={18} />
        <span>开局</span>
      </button>
      <button
        type="button"
        title={playbackDisabled ? '开局后可播放' : autoPlay ? '暂停自动播放' : '继续自动播放'}
        disabled={playbackDisabled}
        onClick={() => setAutoPlay(!autoPlay)}
      >
        {autoPlay ? <Pause size={18} /> : <Play size={18} />}
        <span>{autoPlay ? '暂停' : '播放'}</span>
      </button>
      {showSkip && (
        <button
          type="button"
          title={skipDisabled ? '复盘播放中可跳过当前阶段' : '跳过当前阶段'}
          disabled={skipDisabled}
          onClick={onSkipPhase}
        >
          <FastForward size={18} />
          <span>跳过阶段</span>
        </button>
      )}
    </nav>
  );
}

function WerewolfArena({
  game,
  mode,
  currentRound,
  currentSpeakerId,
  activeSpeech,
  showRoles,
  visibleRolePlayerId,
  streamMessage,
  onShowRolesChange,
  onPlayerSelect
}) {
  const orderedPlayers = useMemo(
    () => (game.players || []).slice().sort((a, b) => Number(a.id) - Number(b.id)),
    [game.players]
  );
  const stats = getGameStats(orderedPlayers);
  const phaseTitle = getPhaseTitle(currentRound, streamMessage);

  return (
    <section className="werewolf-arena">
      <div className="werewolf-stage-bg" aria-hidden="true" />
      <div className="werewolf-arena-vignette" aria-hidden="true" />

      <aside className="werewolf-side werewolf-left-board" aria-label="狼人杀左侧信息">
        <WerewolfBrandPanel game={game} mode={mode} showRoles={showRoles} onShowRolesChange={onShowRolesChange} />
        <RoleConfigPanel players={orderedPlayers} mode={mode} showRoles={showRoles} />
        <RoundProgressPanel rounds={game.rounds || []} currentRound={currentRound} />
      </aside>

      <section className="werewolf-orbit-stage" aria-label="狼人杀玩家圆桌">
        <div className="werewolf-scoreboard">
          <span>{game.event?.mode || mode?.name || '标准局'}</span>
          <h2>{currentRound ? `第 ${currentRound.day || 1} 天 · ${phaseTitle}` : '月夜圆桌等待开局'}</h2>
        </div>

        <div className="werewolf-table-ring" aria-hidden="true">
          <section className="werewolf-table" style={{ '--seat-count': orderedPlayers.length }} aria-label="狼人杀玩家座位">
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
        </div>

        <section className="werewolf-center-card" aria-live="polite">
          <div className="werewolf-center-ornament" aria-hidden="true">?</div>
          <span className="werewolf-phase-kicker">{currentRound?.phase === 'night' ? '夜晚行动' : currentRound?.phase === 'day' ? '白天议事' : '实时观战'}</span>
          <h2>{currentRound ? `${currentRound.phase === 'night' ? '夜晚' : '白天'}第 ${currentRound.day || 1} 轮` : '等待开局'}</h2>
          <dl>
            <div><dt>存活玩家</dt><dd>{stats.alive}</dd></div>
            <div><dt>出局玩家</dt><dd>{stats.dead}</dd></div>
          </dl>
          <p>{streamMessage}</p>
          <strong>{getRoundResult(currentRound)}</strong>
        </section>
      </section>

      <aside className="werewolf-side werewolf-right-board" aria-label="狼人杀右侧记录">
        <EliminationPanel players={orderedPlayers} showRoles={showRoles} visibleRolePlayerId={visibleRolePlayerId} />
      </aside>

      <WerewolfResult game={game} />
      <SpeechSubtitle speech={activeSpeech} />
      <SpeechInsightOverlay speech={activeSpeech} players={game.players || []} />
    </section>
  );
}

function WerewolfBrandPanel({ game, mode, showRoles, onShowRolesChange }) {
  return (
    <section className="werewolf-title-panel">
      <p>狼人杀</p>
      <h2>观赛视角</h2>
      <span>{mode?.name || game.event?.name || 'AI 狼人杀'}</span>
      <button type="button" onClick={() => onShowRolesChange((value) => !value)}>
        {showRoles ? <Eye size={18} /> : <EyeOff size={18} />}
        <span>{showRoles ? '上帝视角' : '玩家视角'}</span>
      </button>
    </section>
  );
}

function RoleConfigPanel({ players, mode, showRoles }) {
  const groups = getRoleConfigGroups(players, mode, showRoles);
  return (
    <section className="werewolf-panel werewolf-role-panel">
      <PanelHeader icon={<Users size={18} />} title="角色配置" />
      <div className="werewolf-role-list">
        {groups.map((group) => (
          <article className="werewolf-role-group" key={group.id}>
            <span className={classNames('werewolf-role-icon', group.id === 'wolves' && 'wolf')}>
              {group.icon}
            </span>
            <div>
              <strong>{group.name}<em>x{group.count}</em></strong>
              {group.details.length > 0 && (
                <p>{group.details.map((role) => `${role.name}x${role.count}`).join(' · ')}</p>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function RoundProgressPanel({ rounds, currentRound }) {
  const items = buildRoundProgress(rounds, currentRound);
  return (
    <section className="werewolf-panel werewolf-progress-panel">
      <PanelHeader icon={<Moon size={18} />} title="回合进程" />
      <div className="werewolf-progress-list">
        {items.length ? items.map((item) => (
          <article className={item.active ? 'active' : ''} key={item.key}>
            {item.phase === 'day' ? <Sun size={19} /> : <Moon size={19} />}
            <span>{item.label}</span>
          </article>
        )) : <p>等待主持人开局。</p>}
      </div>
    </section>
  );
}

function EliminationPanel({ players, showRoles, visibleRolePlayerId }) {
  const eliminated = players
    .filter((player) => !player.alive)
    .sort((a, b) => Number(b.deathDay || 0) - Number(a.deathDay || 0));

  return (
    <section className="werewolf-panel werewolf-elimination-panel">
      <PanelHeader icon={<Skull size={18} />} title="淘汰记录" />
      <div className="werewolf-elimination-list">
        {eliminated.length ? eliminated.map((player) => (
          <article key={player.id}>
            <Skull size={18} />
            <strong>玩家 {player.id}</strong>
            <span>{getVisibleRoleText(player, showRoles, visibleRolePlayerId)}</span>
            <em>{player.deathReason || '出局'} · 第 {player.deathDay || '?'} 天</em>
          </article>
        )) : <p>暂无玩家出局。</p>}
      </div>
    </section>
  );
}

function WerewolfModeDialog({ modes, selectedMode, onSelect, players, selectedPlayerIds, selectedHostId, onHostChange, onPlayerToggle, error, onCancel, onStart }) {
  const requiredCount = getWerewolfModePlayerCount(selectedMode);
  const selectedCount = selectedPlayerIds.length;
  const canStart = Boolean(selectedMode?.id) && selectedCount === requiredCount;
  const hostOptions = getWerewolfHostOptions(players);
  return (
    <div className="werewolf-mode-backdrop" role="presentation">
      <section className="werewolf-mode-dialog werewolf-setup-dialog" role="dialog" aria-modal="true" aria-label="狼人杀开局配置">
        <header>
          <h2>狼人杀开局配置</h2>
          <button type="button" onClick={onCancel}>返回</button>
        </header>
        <div className="werewolf-setup-grid">
          <section>
            <PanelHeader icon={<Moon size={18} />} title="模式" />
            <div className="werewolf-mode-grid">
              {modes.length ? modes.map((mode) => (
                <button
                  type="button"
                  className={classNames('werewolf-mode-card', selectedMode?.id === mode.id && 'active')}
                  onClick={() => onSelect(mode)}
                  key={mode.id}
                >
                  <strong>{mode.name}</strong>
                  <span>{mode.description}</span>
                  <small>{formatWerewolfModeSummary(mode)}</small>
                </button>
              )) : <p className="werewolf-mode-empty">暂无可用狼人杀模式，请先在 B 端启用模式。</p>}
            </div>
          </section>
          <section>
            <PanelHeader icon={<Crown size={18} />} title="主持人" />
            <div className="werewolf-host-grid">
              {hostOptions.map((host) => (
                <button
                  type="button"
                  className={String(selectedHostId || 'default') === String(host.id) ? 'checked' : ''}
                  onClick={() => onHostChange(host.id)}
                  key={host.id}
                >
                  <span>{host.badge}</span>
                  <strong>{host.name}</strong>
                  <small>{host.description}</small>
                  {String(selectedHostId || 'default') === String(host.id) && <Check size={15} />}
                </button>
              ))}
            </div>
            <p className="werewolf-order-note">主持人只负责播报和推进流程，不占用玩家座位序号。</p>
          </section>
          <section>
            <PanelHeader icon={<Users size={18} />} title={`玩家 ${selectedCount}/${requiredCount || '-'}`} />
            <div className="werewolf-player-grid">
              {players.length ? players.map((player) => {
                const checked = selectedPlayerIds.includes(Number(player.id));
                return (
                  <button
                    type="button"
                    className={checked ? 'checked' : ''}
                    onClick={() => onPlayerToggle(player.id)}
                    key={player.id}
                  >
                    <span>{player.id}</span>
                    <strong>{player.nickname || player.name || `${player.id}号`}</strong>
                    {checked && <Check size={15} />}
                  </button>
                );
              }) : <p className="werewolf-mode-empty">正在读取 AI 玩家配置。</p>}
            </div>
            <p className="werewolf-order-note">座位序号固定按玩家 ID 升序排列，不能手动拖拽调整。</p>
          </section>
        </div>
        {error && <p className="werewolf-setup-error">{error}</p>}
        <footer>
          <span>{selectedMode?.name || '请选择 B 端启用的模式'}</span>
          <button type="button" className="primary" disabled={!canStart} onClick={() => onStart(selectedMode, selectedPlayerIds, selectedHostId)}>开始游戏</button>
        </footer>
      </section>
    </div>
  );
}

function WerewolfSeat({ player, seatIndex, actionTarget, showRoles, visibleRolePlayerId, currentSpeakerId, onPlayerSelect }) {
  const isSpeaking = Number(currentSpeakerId) === Number(player.id);
  const roleText = getVisibleRoleText(player, showRoles, visibleRolePlayerId);
  return (
    <article
      className={classNames('werewolf-seat', isSpeaking && 'speaking', !player.alive && 'dead', showRoles && player.role)}
      style={{ '--seat': seatIndex }}
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
      {actionTarget && <span className="werewolf-action-badge" title={`投给 ${actionTarget} 号`}>{actionTarget}</span>}
      <div className="werewolf-nameplate">
        <strong>{player.nickname || player.name || `${player.id}号`}</strong>
        <span>{roleText}</span>
      </div>
    </article>
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

function buildEventLogEntry(event) {
  const gameRounds = Array.isArray(event.game?.rounds) ? event.game.rounds : [];
  const round = event.round || gameRounds.at(-1);
  const day = round?.day ? `? ${round.day} ?` : '';
  const title = [day, EVENT_LABELS[event.type] || event.type].filter(Boolean).join(' · ');
  const text = event.message || event.narration || getEventSummary(event) || getWerewolfNarration(event);
  if (!text && event.type !== 'players') return null;
  return {
    id: `${Date.now()}-${event.type}-${Math.random().toString(16).slice(2)}`,
    kind: event.type,
    title,
    text: text || '玩家已经入场，身份牌已秘密分发。',
    icon: getEventIcon(event.type)
  };
}

function getEventSummary(event) {
  if (event.type === 'night-result') return formatNightSummary(event.round, event.game?.players || [], true);
  if (event.type === 'vote-result') return getVoteSummary(event.round);
  if (event.type === 'hunter-shot' && event.shot) return `${event.shot.from} 号猎人开枪，带走 ${event.shot.target} 号。`;
  if (event.type === 'sheriff-result') return event.message || (event.round?.sheriffId ? `${event.round.sheriffId} 号当选警长。` : '本局无人当选警长。');
  if (event.type === 'game') return event.game?.winReason || '';
  return '';
}

function getEventIcon(type) {
  if (type === 'night-result' || type === 'phase-start') return <Moon size={18} />;
  if (type === 'day-start') return <Sun size={18} />;
  if (type === 'vote-result') return <Vote size={18} />;
  if (type === 'hunter-shot') return <Swords size={18} />;
  if (type === 'sheriff-result') return <Crown size={18} />;
  if (type === 'game') return <Shield size={18} />;
  if (type === 'players') return <Users size={18} />;
  return <Wand2 size={18} />;
}

function getRoleConfigGroups(players, mode, showRoles) {
  const sourceRoles = players.length ? players.map((player) => ({
    id: player.role || 'unknown',
    name: getVisibleRoleText(player, showRoles, player.id),
    count: 1,
    faction: player.faction
  })) : normalizeModeRoles(mode);

  const groups = {
    wolves: { id: 'wolves', name: '狼人阵营', count: 0, icon: ROLE_ICON.werewolf, details: [] },
    gods: { id: 'gods', name: '神职阵营', count: 0, icon: <Sparkles size={18} />, details: [] },
    villagers: { id: 'villagers', name: '平民阵营', count: 0, icon: ROLE_ICON.villager, details: [] }
  };
  const details = { wolves: new Map(), gods: new Map() };

  sourceRoles.forEach((role) => {
    const faction = resolveRoleFaction(role);
    groups[faction].count += role.count;
    if (faction === 'wolves' && !isBaseWerewolfRole(role)) addRoleDetail(details.wolves, role);
    if (faction === 'gods') addRoleDetail(details.gods, role);
  });

  groups.wolves.details = [...details.wolves.values()];
  groups.gods.details = [...details.gods.values()];
  return [groups.wolves, groups.gods, groups.villagers];
}

function normalizeModeRoles(mode) {
  if (!Array.isArray(mode?.roles)) return [];
  return mode.roles.map((item) => ({
    id: item.roleId || item.id || item.name || 'unknown',
    name: item.roleName || item.name || ROLE_NAMES[item.roleId] || item.roleId || '未知身份',
    count: Number(item.count || 1),
    faction: item.faction
  }));
}

function resolveRoleFaction(role) {
  const id = String(role.id || '').toLowerCase();
  const name = String(role.name || '');
  const faction = String(role.faction || '').toLowerCase();
  if (faction === 'wolves' || faction === 'wolf' || id.includes('wolf') || name.includes('?')) return 'wolves';
  if (id === 'villager' || id === 'civilian' || name.includes('村民') || name.includes('平民')) return 'villagers';
  return 'gods';
}

function isBaseWerewolfRole(role) {
  const id = String(role.id || '').toLowerCase();
  const name = String(role.name || '');
  return id === 'werewolf' || id === 'wolf' || name === '狼人';
}

function addRoleDetail(map, role) {
  const id = role.id || role.name;
  const current = map.get(id) || { id, name: role.name || ROLE_NAMES[role.id] || '未知身份', count: 0 };
  current.count += role.count;
  map.set(id, current);
}

function buildRoundProgress(rounds, currentRound) {
  const items = [];
  rounds.forEach((round) => {
    const day = Number(round.day || 1);
    items.push({
      key: `night-${day}`,
      phase: 'night',
      label: `夜晚 ${day}`,
      active: Number(currentRound?.day) === day && currentRound?.phase === 'night'
    });
    const hasDay = round.phase === 'day'
      || round.exile
      || round.idiotReveal
      || round.sheriffId
      || Object.keys(round.voteTally || {}).length
      || (round.speeches || []).length;
    if (hasDay) {
      items.push({
        key: `day-${day}`,
        phase: 'day',
        label: `白天 ${day}`,
        active: Number(currentRound?.day) === day && currentRound?.phase === 'day'
      });
    }
  });
  return items.reverse().slice(0, 8);
}

function getGameStats(players) {
  const alive = players.filter((player) => player.alive).length;
  return { alive, dead: Math.max(0, players.length - alive) };
}

function formatWerewolfModeSummary(mode) {
  const roles = Array.isArray(mode.roles) ? mode.roles : [];
  const lineup = roles.map((item) => `${item.count} ${item.roleName || item.name || item.roleId}`).join('?');
  const sheriff = mode.sheriff?.enabled ? '警徽流' : '无警徽';
  const winMap = { side: '屠边局', gods: '屠神局', villagers: '屠民局', all: '屠城局' };
  return [lineup, sheriff, winMap[mode.winCondition] || mode.winCondition].filter(Boolean).join(' · ');
}

function getWerewolfModePlayerCount(mode) {
  const roles = Array.isArray(mode?.roles) ? mode.roles : [];
  const count = roles.reduce((sum, item) => sum + (Number(item.count) || 0), 0);
  return count || 12;
}

function getWerewolfHostOptions(players = []) {
  return [
    { id: 'default', badge: '主', name: '默认主持人', description: '使用全局主持人模型与语音' },
    ...sortPlayersById(players).map((player) => ({
      id: Number(player.id),
      badge: player.id,
      name: player.nickname || player.name || `${player.id}号`,
      description: [player.model, player.voicePackageId ? `语音包 ${player.voicePackageId}` : '未绑定语音'].filter(Boolean).join(' · ')
    }))
  ];
}

function normalizeWerewolfHostId(value) {
  const id = Number(value);
  return id > 0 ? id : 'default';
}

function sortPlayersById(players = []) {
  return players.slice().sort((a, b) => Number(a.id) - Number(b.id));
}

function normalizeWerewolfSelectedIds(ids = [], players = [], mode) {
  const playerIds = new Set(sortPlayersById(players).map((player) => Number(player.id)).filter(Boolean));
  const required = getWerewolfModePlayerCount(mode);
  const selected = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter((id) => playerIds.has(id)))].sort((a, b) => a - b);
  if (selected.length === required) return selected;
  if (selected.length > required) return selected.slice(0, required);
  const missing = sortPlayersById(players)
    .map((player) => Number(player.id))
    .filter((id) => id && !selected.includes(id))
    .slice(0, Math.max(0, required - selected.length));
  return [...selected, ...missing].sort((a, b) => a - b);
}

function sanitizeWerewolfSelectedIds(ids = [], players = []) {
  const playerIds = new Set(sortPlayersById(players).map((player) => Number(player.id)).filter(Boolean));
  const selected = [...new Set((Array.isArray(ids) ? ids : []).map(Number).filter(Boolean))]
    .filter((id) => !playerIds.size || playerIds.has(id));
  return selected.sort((a, b) => a - b);
}

function toggleWerewolfPlayerId(ids = [], id, mode) {
  const target = Number(id);
  if (!target) return ids;
  const required = getWerewolfModePlayerCount(mode);
  const selected = ids.map(Number).filter(Boolean);
  if (selected.includes(target)) return selected.filter((item) => item !== target).sort((a, b) => a - b);
  if (selected.length >= required) return selected;
  return [...selected, target].sort((a, b) => a - b);
}

function getPhaseTitle(round, streamMessage) {
  if (!round) return streamMessage || '等待开局';
  if (round.phase === 'night') return '夜晚行动';
  if (round.phase === 'day') return '白天发言与投票';
  return streamMessage || '游戏进行中';
}

function getRoundResult(round) {
  if (!round) return '等待主持人发牌。';
  const night = round.night?.deaths?.length ? `夜晚死亡：${round.night.deaths.map((item) => `${item.id}号`).join('、')}` : '夜晚：平安夜';
  const exile = round.exile ? `放逐：${round.exile.id}号` : round.idiotReveal ? `白痴翻牌：${round.idiotReveal.id}号` : '放逐：暂无';
  return `${night} ? ${exile}`;
}

function getWerewolfNarration(event) {
  if (event?.type === 'speech') return event.speech?.text || '';
  if (event?.type === 'last-words' || event?.type === 'exile-words') return event.testimony?.text || '';
  if (event?.type === 'hunter-shot') return getEventSummary(event);
  return event?.message || event?.narration || '';
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
    return `刀口 ${target}：${result}`;
  }

  return round?.phase === 'night' ? '等待夜晚结算' : '平安夜';
}

function getVoteSummary(round) {
  if (!round) return '';
  if (round.idiotReveal) return `投票结束：${round.idiotReveal.id} 号翻牌免除放逐。`;
  if (round.exile) return `投票结束：${round.exile.id} 号被放逐。`;
  return '投票出现平票，本轮无人被放逐。';
}

function formatWerewolfRecordPlayer(playerId, players, showRoles, visibleRolePlayerId, reason) {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  const name = player ? (player.nickname || player.name || `${player.id}号`) : `${playerId}号`;
  const role = player ? getVisibleRoleText(player, showRoles, visibleRolePlayerId) : '';
  const detail = [role, reason].filter(Boolean).join(' · ');
  return `${name}${detail ? `?${detail}?` : ''}`;
}

function formatVotes(tally = {}) {
  const entries = Object.entries(tally || {});
  if (!entries.length) return '暂无投票';
  return entries
    .sort((a, b) => b[1] - a[1])
    .map(([id, count]) => `${id}? ${count}?`)
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
          <div><dt>状态</dt><dd>{player.alive ? '存活' : `${player.deathReason || '出局'} · 第 ${player.deathDay || '?'} 天`}</dd></div>
        </dl>
      </section>
    </div>
  );
}
