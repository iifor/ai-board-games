import React, { useMemo, useRef, useState, useEffect } from 'react';
import { ArrowLeft, Award, CircleHelp, Crown, GripVertical, Landmark, MessageSquareText, Pause, Play, RotateCcw, Shield, Star, Swords, Users, X } from 'lucide-react';
import { fetchAiPlayers, openGameSocket } from '../api/gameApi';
import { classNames } from '../utils/gameState';
import { useSpeechQueue } from '../hooks/useSpeechQueue';
import '../styles/debate-game.css';

const EMPTY_DEBATE = {
  id: 'pending-debate',
  type: 'debate',
  mode: 'real',
  topic: {
    title: 'AI 会让人类更自由，还是更依赖？',
    proPosition: 'AI 会让人类更自由',
    conPosition: 'AI 会让人类更依赖'
  },
  players: [],
  phases: [],
  rounds: [],
  mvp: null,
  winner: null,
  winReason: ''
};

const DEFAULT_DEBATE_TOPIC = {
  title: 'AI 会让人类更自由，还是更依赖？',
  proPosition: 'AI 会让人类更自由',
  conPosition: 'AI 会让人类更依赖'
};

const DEBATE_STAGE_STEPS = [
  { ids: ['strategy', 'opening'], label: '立论阶段', Icon: Landmark },
  { ids: ['crossfire'], label: '正反攻辩', Icon: Swords },
  { ids: ['free'], label: '自由辩论', Icon: Users },
  { ids: ['closing'], label: '总结陈词', Icon: MessageSquareText },
  { ids: ['judges'], label: '评委点评', Icon: CircleHelp },
  { ids: ['mvp'], label: 'MVP评选', Icon: Star }
];

const DEBATE_SUBTITLE_CONFIG = {
  maxChars: 50
};

export function DebateGame({ selectedPlayerIds, onReturnToSelect }) {
  const [mockMode, setMockMode] = useState(true);
  const [game, setGame] = useState(EMPTY_DEBATE);
  const [status, setStatus] = useState('idle');
  const [streamMessage, setStreamMessage] = useState('Mock 模式已就绪，点击开始后由后端逐条推送辩论赛。');
  const [activeSpeech, setActiveSpeech] = useState(null);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [topicDraft, setTopicDraft] = useState(DEFAULT_DEBATE_TOPIC);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [debateTeamDraft, setDebateTeamDraft] = useState(() => createDefaultDebateTeams(selectedPlayerIds));
  const [autoPlay, setAutoPlay] = useState(false);
  const socketRef = useRef(null);
  const pendingAckRef = useRef(null);
  const pendingEventRef = useRef(null);
  const autoPlayRef = useRef(false);
  const ackTimerRef = useRef(null);
  const { speechEnabled, setSpeechEnabled, speak, cancel } = useSpeechQueue();

  useEffect(() => () => closeSocket(), []);

  useEffect(() => {
    setDebateTeamDraft((value) => normalizeDebateTeamDraft(value, selectedPlayerIds));
  }, [selectedPlayerIds]);

  useEffect(() => {
    if (!topicDialogOpen) return;
    let cancelled = false;
    fetchAiPlayers()
      .then((players) => {
        if (!cancelled) setAvailablePlayers(players);
      })
      .catch(() => {
        if (!cancelled) setAvailablePlayers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [topicDialogOpen]);

  useEffect(() => {
    autoPlayRef.current = autoPlay;
    if (autoPlay && pendingAckRef.current) continuePendingEvent();
  }, [autoPlay]);

  const displayGame = game || EMPTY_DEBATE;
  const currentPhase = displayGame.phases?.at(-1) || null;
  const currentSpeakerId = activeSpeech?.playerId || null;
  const isRunning = status === 'streaming';
  const hasStarted = status !== 'idle' || Boolean(displayGame.phases?.length);
  const controlsLocked = isRunning;
  const canStartNextGame = !isRunning || (mockMode && !autoPlay);
  function resetToIdle(message, nextMockMode = mockMode) {
    closeSocket();
    cancel();
    pendingAckRef.current = null;
    pendingEventRef.current = null;
    clearPendingAckTimer();
    setGame(EMPTY_DEBATE);
    setActiveSpeech(null);
    setStatus('idle');
    setAutoPlay(false);
    autoPlayRef.current = false;
    setStreamMessage(message || (nextMockMode ? 'Mock 模式已就绪，点击开始后由后端逐条推送辩论赛。' : '真实模式已就绪，点击开始后才会调用 AI。'));
  }

  function requestStartGame() {
    if (!canStartNextGame) return;
    setTopicDialogOpen(true);
  }

  function startGame(topic = topicDraft, teams = debateTeamDraft) {
    resetToIdle('');
    const nextTopic = normalizeTopicDraft(topic);
    const nextTeams = normalizeDebateTeamDraft(teams, selectedPlayerIds);
    const orderedPlayerIds = getOrderedDebatePlayerIds(nextTeams, selectedPlayerIds);
    setTopicDraft(nextTopic);
    setDebateTeamDraft(nextTeams);
    setTopicDialogOpen(false);
    setStatus('streaming');
    setAutoPlay(true);
    autoPlayRef.current = true;
    setStreamMessage('游戏准备中...');
    socketRef.current = openGameSocket({
      mode: mockMode ? 'mock' : 'real',
      gameType: 'debate',
      playerIds: orderedPlayerIds,
      topic: nextTopic,
      debateTeams: nextTeams,
      onEvent: handleSocketEvent,
      onError: (error) => {
        setStatus('error');
        setStreamMessage(error.message);
      },
      onClose: () => { }
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
    if (event.type === 'speech' && event.speech) {
      const label = event.speech.side === 'host' ? '主持人' : getDebateSpeakerLabel(event.game?.players || displayGame.players, event.speech.playerId);
      setStreamMessage(`${label}正在发言`);
      setActiveSpeech({
        playerId: event.speech.playerId,
        text: event.speech.text
      });
      return;
    }
    const subtitleText = event.narration || getDebateNarration(event) || event.message;
    if (subtitleText && event.type !== 'game') {
      setActiveSpeech({ playerId: null, text: subtitleText });
    }
    if (event.type === 'done') {
      setStatus('ready');
      setStreamMessage(event.message || '辩论赛已完成。');
    }
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
    const narration = event.narration || getDebateNarration(event);
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
    onReturnToSelect();
  }

  return (
    <main className={classNames('game-shell debate-shell', !mockMode && 'real-mode')}>
      <DebateControls
        autoPlay={autoPlay}
        onReturn={returnToSelect}
        setAutoPlay={handleAutoPlayChange}
        startLabel="开局"
        startTitle={isRunning && autoPlay ? '暂停后可以开始下一局' : displayGame.phases?.length ? '开始下一局' : '开始游戏'}
        startDisabled={!canStartNextGame}
        playbackDisabled={!hasStarted}
        onStart={requestStartGame}
      />

      <DebateArena
        game={displayGame}
        currentSpeakerId={currentSpeakerId}
        currentPhase={currentPhase}
        streamMessage={streamMessage}
        activeSpeech={activeSpeech}
        onPlayerSelect={setSelectedPlayer}
        isIdle={status === 'idle' || !displayGame.phases?.length}
      />

      {status === 'error' && <p className="debate-error">{streamMessage}</p>}

      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          label={getDebatePlayerLabel(displayGame.players, selectedPlayer.id)}
          description={getDebateIdentityDescription(selectedPlayer)}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
      {topicDialogOpen && (
        <DebateTopicDialog
          topic={topicDraft}
          onChange={setTopicDraft}
          selectedPlayerIds={selectedPlayerIds}
          players={availablePlayers}
          teams={debateTeamDraft}
          onTeamsChange={setDebateTeamDraft}
          mockMode={mockMode}
          speechEnabled={speechEnabled}
          onMockModeChange={(value) => {
            if (controlsLocked) return;
            setMockMode(value);
            resetToIdle(undefined, value);
          }}
          onSpeechEnabledChange={setSpeechEnabled}
          onCancel={() => setTopicDialogOpen(false)}
          onStart={(teams) => startGame(topicDraft, teams)}
        />
      )}
    </main>
  );
}

function DebateControls({
  autoPlay,
  startLabel,
  startTitle,
  startDisabled,
  playbackDisabled,
  onReturn,
  setAutoPlay,
  onStart
}) {
  return (
    <nav className="debate-controls" aria-label="辩论赛操作">
      <button type="button" title="返回游戏选择" onClick={onReturn}>
        <ArrowLeft size={18} />
        <span>返回</span>
      </button>
      <button type="button" title={startTitle} onClick={onStart} disabled={startDisabled}>
        <RotateCcw size={18} />
        <span>{startLabel}</span>
      </button>
      <button
        type="button"
        title={playbackDisabled ? '开局后可推进' : autoPlay ? '暂停自动推进' : '继续自动推进'}
        onClick={() => setAutoPlay(!autoPlay)}
        disabled={playbackDisabled}
      >
        {autoPlay ? <Pause size={18} /> : <Play size={18} />}
        <span>{autoPlay ? '暂停' : '推进'}</span>
      </button>
    </nav>
  );
}

function DebateArena({ game, currentSpeakerId, currentPhase, streamMessage, activeSpeech, onPlayerSelect, isIdle }) {
  const proPlayers = useMemo(() => game.players.filter((player) => player.side === 'pro'), [game.players]);
  const conPlayers = useMemo(() => game.players.filter((player) => player.side === 'con'), [game.players]);
  const judges = useMemo(() => game.players.filter((player) => player.side === 'judge'), [game.players]);
  const activeStepIndex = getActiveStageIndex(currentPhase, game.phases);
  const subtitleMaxChars = getDebateSubtitleMaxChars(game);
  const currentTitle = isIdle ? '等待开局' : getStageTitle(currentPhase);
  return (
    <>
      <DebateSide
        title="正方"
        position={game.topic?.proPosition}
        players={proPlayers}
        tone="pro"
        currentSpeakerId={currentSpeakerId}
        onPlayerSelect={onPlayerSelect}
      />

      <div className="debate-center">
        <header className="debate-hero">
          <h1>AI 辩论赛</h1>
          <div className="debate-topic-ribbon">
            <span>辩题：</span>
            <strong>{game.topic?.title || '等待辩题'}</strong>
          </div>
        </header>
        <section className="debate-stage-console">
          <div className="debate-current">
            <span>当前环节</span>
            <h2>{currentTitle}</h2>
            <strong>{streamMessage}</strong>
          </div>
          <DebateResult game={game} />
          <DebatePhaseTimeline activeStepIndex={activeStepIndex} />
        </section>
        <section className="judge-row">
          {Array.from({ length: 3 }).map((_, index) => (
            <DebateSeat
              player={judges[index]}
              slotLabel={`评委`}
              key={judges[index]?.id || `judge-empty-${index}`}
              currentSpeakerId={currentSpeakerId}
              onPlayerSelect={onPlayerSelect}
              tone="judge"
              index={index}
            />
          ))}
        </section>
      </div>

      <DebateSide
        title="反方"
        position={game.topic?.conPosition}
        players={conPlayers}
        tone="con"
        currentSpeakerId={currentSpeakerId}
        onPlayerSelect={onPlayerSelect}
      />
      <DebateSubtitle speech={activeSpeech} players={game.players} maxChars={subtitleMaxChars} />
    </>
  );
}

function DebateSubtitle({ speech, players, maxChars = DEBATE_SUBTITLE_CONFIG.maxChars }) {
  const text = formatDebateSubtitle(speech?.text, maxChars);
  if (!text) return <div className="debate-subtitle empty" aria-hidden="true" />;
  const speaker = speech.playerId ? getDebateSpeakerLabel(players, speech.playerId) : '系统播报';
  return (
    <div className="debate-subtitle" key={`${speech.playerId || 'host'}-${text}`}>
      <p><span>{speaker}</span> {text}</p>
    </div>
  );
}

function formatDebateSubtitle(value, maxChars = DEBATE_SUBTITLE_CONFIG.maxChars) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  const limit = Math.max(1, Math.min(Number(maxChars) || DEBATE_SUBTITLE_CONFIG.maxChars, 50));
  if (!text) return '';
  if (text.length <= limit) return trimSubtitleBreakMark(text);

  const breakMarks = '，,。.!！?？；;、：:';
  let breakIndex = -1;
  for (let index = 0; index < text.length && index < limit; index += 1) {
    if (breakMarks.includes(text[index])) breakIndex = index;
  }

  if (breakIndex >= 0) return trimSubtitleBreakMark(text.slice(0, breakIndex + 1));
  return trimSubtitleBreakMark(text.slice(0, limit));
}

function trimSubtitleBreakMark(value) {
  return String(value || '').trim().replace(/[，,。.!！?？；;、：:]+$/u, '');
}

function getDebateSubtitleMaxChars(game) {
  return game?.subtitleMaxChars || game?.config?.subtitleMaxChars || DEBATE_SUBTITLE_CONFIG.maxChars;
}

function DebateSide({ title, position, players, tone, currentSpeakerId, onPlayerSelect }) {
  const seats = Array.from({ length: 4 }).map((_, index) => players[index] || null);
  return (
    <aside className={`debate-side ${tone}`}>
      <header>
        <DebateFlag tone={tone} label={title.slice(0, 1)} />
        <span>{position || (tone === 'pro' ? '等待正方观点' : '等待反方观点')}</span>
      </header>
      <div className="debate-seat-list">
        {seats.map((player, index) => (
          <DebateSeat
            player={player}
            slotLabel={`${title}${toChineseOrdinal(index + 1)}辩`}
            key={player?.id || `${tone}-empty-${index}`}
            currentSpeakerId={currentSpeakerId}
            onPlayerSelect={onPlayerSelect}
            tone={tone}
            index={index}
          />
        ))}
      </div>
    </aside>
  );
}

function DebateSeat({ player, currentSpeakerId, slotLabel, onPlayerSelect, tone = 'pro', index = 0 }) {
  const isSpeaking = player && Number(currentSpeakerId) === Number(player.id);
  const isJudge = tone === 'judge';
  const isCaptain = !isJudge && player?.debateRole === 'captain';
  const name = player?.nickname || player?.name;
  return (
    <article className={classNames('debate-seat', tone, isSpeaking && 'speaking', !player && 'empty')}>
      <div
        className="debate-avatar player-detail-trigger"
        style={player?.avatar ? { backgroundImage: `url("${formatAvatarUrl(player.avatar)}")` } : undefined}
        onClick={() => player && onPlayerSelect?.(player)}
        aria-label={player ? `查看${name}信息` : `${slotLabel}席位空缺`}
      >
        {!player?.avatar && <span className="avatar-sprite" />}
        {isCaptain && <span className="captain-avatar-badge"><Crown size={42} strokeWidth={3} /></span>}
      </div>
      <div className="debate-nameplate">
        <span className="seat-badge">{isJudge ? slotLabel : `${toChineseOrdinal(index + 1)}辩`}</span>
        <strong>
          {name || slotLabel}
        </strong>
      </div>
    </article>
  );
}

function DebateFlag({ tone, label }) {
  return (
    <span className={`debate-flag ${tone}`} aria-hidden="true">
      <svg viewBox="0 0 78 98" role="img">
        <path className="flag-back" d="M10 5H68V68L39 91L10 68V5Z" />
        <path className="flag-line" d="M17 13H61V63L39 81L17 63V13Z" />
        <path className="flag-top" d="M5 5H73M39 0V10" />
      </svg>
      <b>{label}</b>
    </span>
  );
}

function DebatePhaseTimeline({ activeStepIndex }) {
  return (
    <ol className="debate-phase-timeline" aria-label="辩论流程">
      {DEBATE_STAGE_STEPS.map((step, index) => {
        const Icon = step.Icon;
        return (
          <li
            className={classNames(index === activeStepIndex && 'active', index < activeStepIndex && 'past')}
            key={step.label}
          >
            <span className="phase-number">{index + 1}</span>
            <span className="phase-icon"><Icon size={38} strokeWidth={2.5} /></span>
            <strong>{step.label}</strong>
            {index < DEBATE_STAGE_STEPS.length - 1 && <span className="phase-arrow" />}
          </li>
        );
      })}
    </ol>
  );
}

function getActiveStageIndex(currentPhase, phases = []) {
  const phaseId = currentPhase?.id || phases.at(-1)?.id || '';
  const direct = DEBATE_STAGE_STEPS.findIndex((step) => step.ids.includes(phaseId));
  if (direct >= 0) return direct;
  let latest = -1;
  phases.forEach((phase) => {
    const index = DEBATE_STAGE_STEPS.findIndex((step) => step.ids.includes(phase.id));
    if (index > latest) latest = index;
  });
  return Math.max(0, latest);
}

function getStageTitle(currentPhase) {
  const index = getActiveStageIndex(currentPhase, currentPhase ? [currentPhase] : []);
  return DEBATE_STAGE_STEPS[index]?.label || currentPhase?.name || '等待开赛';
}

function DebateTopicDialog({
  topic,
  onChange,
  selectedPlayerIds,
  players,
  teams,
  onTeamsChange,
  mockMode,
  speechEnabled,
  onMockModeChange,
  onSpeechEnabledChange,
  onCancel,
  onStart
}) {
  const normalizedTeams = normalizeDebateTeamDraft(teams, selectedPlayerIds);
  const proIds = normalizedTeams.proIds;
  const conIds = normalizedTeams.conIds;
  const judgeIds = normalizedTeams.judgeIds;
  const proCaptainId = normalizedTeams.proCaptainId;
  const conCaptainId = normalizedTeams.conCaptainId;
  const judgeSlotCount = Math.max(0, selectedPlayerIds.length - 8);
  const canStart = Boolean(topic.title?.trim() && topic.proPosition?.trim() && topic.conPosition?.trim() && proIds.length === 4 && conIds.length === 4);
  const update = (key, value) => onChange({ ...topic, [key]: value });
  const playerMap = useMemo(() => new Map(players.map((player) => [Number(player.id), player])), [players]);
  const selectedPlayers = selectedPlayerIds.map((id) => playerMap.get(Number(id)) || { id, nickname: `${id}号` });
  const getPlayer = (id) => selectedPlayers.find((player) => Number(player.id) === Number(id));

  const assignPlayerToSlot = (playerId, side, index) => {
    const id = Number(playerId);
    if (!id) return;
    const current = { proIds: [...proIds], conIds: [...conIds], judgeIds: [...judgeIds] };
    const targetKey = getDebateTeamKey(side);
    const target = current[targetKey];
    const capacity = side === 'judge' ? judgeSlotCount : 4;
    const source = findDebateTeamSlot(current, id);
    const targetOccupant = Number(target[index]) || null;
    if (source?.side === side && source.index === index) return;
    if (!targetOccupant && target.length >= capacity && !source) return;

    const next = {
      proIds: removeDebatePlayerIds(current.proIds, id, targetOccupant),
      conIds: removeDebatePlayerIds(current.conIds, id, targetOccupant),
      judgeIds: removeDebatePlayerIds(current.judgeIds, id, targetOccupant)
    };
    next[targetKey][index] = id;
    if (targetOccupant && source) next[getDebateTeamKey(source.side)][source.index] = targetOccupant;
    onTeamsChange(normalizeDebateTeamDraft(next, selectedPlayerIds));
  };

  const handleDrop = (event, side, index) => {
    event.preventDefault();
    const value = event.dataTransfer.getData('text/plain');
    if (value.startsWith('captain:')) return;
    assignPlayerToSlot(value, side, index);
  };

  const setCaptain = (side, playerId) => {
    const id = Number(playerId);
    if (!id) return;
    if (side === 'pro' && proIds.includes(id)) {
      onTeamsChange(normalizeDebateTeamDraft({ ...normalizedTeams, proCaptainId: id }, selectedPlayerIds));
    }
    if (side === 'con' && conIds.includes(id)) {
      onTeamsChange(normalizeDebateTeamDraft({ ...normalizedTeams, conCaptainId: id }, selectedPlayerIds));
    }
  };

  return (
    <div className="debate-topic-backdrop" role="presentation">
      <section className="debate-topic-dialog" role="dialog" aria-modal="true" aria-label="辩论赛设置">
        <header>
          <div className="debate-dialog-title">
            <span><MessageSquareText size={24} /></span>
            <h2>辩论赛设置</h2>
          </div>
          <button type="button" className="debate-topic-close" onClick={onCancel} aria-label="关闭">
            <X size={28} />
          </button>
        </header>

        <section className="debate-topic-fields">
          <label>
            <span>辩题 <b>*</b></span>
            <input value={topic.title} onChange={(event) => update('title', event.target.value)} placeholder="请输入本场辩题" />
          </label>
          <div className="debate-position-row">
            <label>
              <span>正方 <b>*</b></span>
              <input value={topic.proPosition} onChange={(event) => update('proPosition', event.target.value)} placeholder="请输入正方观点" />
            </label>
            <label>
              <span>反方 <b>*</b></span>
              <input value={topic.conPosition} onChange={(event) => update('conPosition', event.target.value)} placeholder="请输入反方观点" />
            </label>
          </div>
        </section>

        <section className="debate-team-board">
          <DebateTeamColumn title="正方" tone="pro" ids={proIds} slots={4} labelPrefix="正方" getPlayer={getPlayer} captainId={proCaptainId} onCaptainDrop={setCaptain} onDrop={handleDrop} />
          <DebateTeamColumn title="评委" tone="judge" ids={judgeIds} slots={judgeSlotCount} labelPrefix="评委" getPlayer={getPlayer} onDrop={handleDrop} />
          <DebateTeamColumn title="反方" tone="con" ids={conIds} slots={4} labelPrefix="反方" getPlayer={getPlayer} captainId={conCaptainId} onCaptainDrop={setCaptain} onDrop={handleDrop} />
        </section>

        {/* <section className="debate-player-pool">
          <div className="player-pool-head">
            <strong>选手列表（{selectedPlayers.length}名）</strong>
            <span>可将选手拖入上方位置；当位置已满时，不可继续拖入</span>
          </div>
          <div className="player-pool-list">
            {selectedPlayers.map((player) => (
              <DraggableDebatePlayer player={player} key={player.id} />
            ))}
          </div>
        </section> */}

        <footer>
          <div className="debate-topic-switches">
            <button type="button" className={classNames('dialog-switch', mockMode && 'active')} onClick={() => onMockModeChange(!mockMode)}>
              <span className="switch-track"><i /></span>
              <strong>{mockMode ? 'Mock 模式' : '真实模式'}</strong>
            </button>
            <button type="button" className={classNames('dialog-switch', speechEnabled && 'active')} onClick={() => onSpeechEnabledChange(!speechEnabled)}>
              <span className="switch-track"><i /></span>
              <strong>{speechEnabled ? '语音开启' : '语音关闭'}</strong>
            </button>
          </div>
          <button type="button" className="primary debate-start-submit" onClick={() => onStart(normalizedTeams)} disabled={!canStart}>保存并开始</button>
        </footer>
      </section>
    </div>
  );
}

function DebateTeamColumn({ title, tone, ids, slots, labelPrefix, getPlayer, captainId, onCaptainDrop, onDrop }) {
  const Icon = tone === 'judge' ? Users : Shield;
  return (
    <div className={`debate-team-column ${tone}`}>
      <h3>
        <Icon size={22} />
        {title}
        {tone !== 'judge' && <CaptainDragToken tone={tone} />}
      </h3>
      <div className="team-slot-list">
        {Array.from({ length: slots }).map((_, index) => {
          const player = getPlayer(ids[index]);
          return (
            <div
              className={classNames('team-drop-slot', player && 'filled')}
              key={`${tone}-${index}`}
              onDragOver={(event) => {
                event.preventDefault();
              }}
              onDrop={(event) => onDrop(event, tone, index)}
            >
              <span className="team-slot-label">{labelPrefix} {index + 1}{tone === 'judge' ? '' : '辩'}</span>
              {player ? (
                <DraggableDebatePlayer
                  player={player}
                  compact
                  tone={tone}
                  isCaptain={Number(captainId) === Number(player.id)}
                  onCaptainDrop={onCaptainDrop}
                />
              ) : <em>+ 拖拽选手到此处</em>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CaptainDragToken({ tone }) {
  return (
    <span
      className="team-captain-token"
      draggable
      title="拖到本方选手卡上设置队长"
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', `captain:${tone}`);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <Crown size={15} />
      队长
    </span>
  );
}

function DraggableDebatePlayer({ player, compact = false, tone = '', isCaptain = false, onCaptainDrop }) {
  const name = player.nickname || player.name || `${player.id}号`;
  const allowCaptainDrop = tone === 'pro' || tone === 'con';
  return (
    <div
      className={classNames('drag-player-card', compact && 'compact', isCaptain && 'captain')}
      draggable
      onDragOver={(event) => {
        if (!allowCaptainDrop) return;
        const value = event.dataTransfer.types.includes('text/plain') ? event.dataTransfer.getData('text/plain') : '';
        if (!value || value === `captain:${tone}`) event.preventDefault();
      }}
      onDrop={(event) => {
        const value = event.dataTransfer.getData('text/plain');
        if (value !== `captain:${tone}`) return;
        event.preventDefault();
        event.stopPropagation();
        onCaptainDrop?.(tone, player.id);
      }}
      onDragStart={(event) => {
        event.dataTransfer.setData('text/plain', String(player.id));
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <span className="drag-player-avatar">{name.slice(0, 1)}</span>
      <strong>{name}</strong>
      {isCaptain && <span className="drag-captain-badge"><Crown size={14} />队长</span>}
      <GripVertical size={18} />
    </div>
  );
}

function DebateResult({ game }) {
  if (!game.winner && !game.mvp) return null;
  const winnerLabel = game.winner === 'pro' ? '正方胜出' : game.winner === 'con' ? '反方胜出' : '双方平局';
  const winnerTone = game.winner === 'con' ? 'con' : game.winner === 'pro' ? 'pro' : 'draw';
  const mvpName = game.mvp?.nickname || game.mvp?.name || (game.mvp?.id ? `${game.mvp.id}号` : '');
  return (
    <section className={`debate-result ${winnerTone}`}>
      {game.winner && (
        <div className="result-winner">
          <Award size={30} />
          <strong>{winnerLabel}</strong>
        </div>
      )}
      {game.mvp && (
        <div className="result-mvp">
          <Star size={26} />
          <span>最佳辩手</span>
          <strong>{mvpName}</strong>
        </div>
      )}
    </section>
  );
}

function getDebateNarration(event) {
  if (event?.type === 'speech') return event.speech?.text || '';
  return event?.message || event?.narration || '';
}

function normalizeTopicDraft(topic) {
  return {
    title: String(topic?.title || DEFAULT_DEBATE_TOPIC.title).trim(),
    proPosition: String(topic?.proPosition || DEFAULT_DEBATE_TOPIC.proPosition).trim(),
    conPosition: String(topic?.conPosition || DEFAULT_DEBATE_TOPIC.conPosition).trim()
  };
}

function createDefaultDebateTeams(playerIds = []) {
  const ids = uniquePlayerIds(playerIds).slice(0, 12);
  const proIds = ids.slice(0, 4);
  const conIds = ids.slice(4, 8);
  return {
    proIds,
    conIds,
    judgeIds: ids.slice(8),
    proCaptainId: proIds[0] || null,
    conCaptainId: conIds[0] || null
  };
}

function normalizeDebateTeamDraft(value, playerIds = []) {
  const selectedIds = uniquePlayerIds(playerIds).slice(0, 12);
  if (!value) return createDefaultDebateTeams(selectedIds);
  const selectedSet = new Set(selectedIds);
  const proIds = uniquePlayerIds(value?.proIds).filter((id) => selectedSet.has(id)).slice(0, 4);
  const proSet = new Set(proIds);
  const conIds = uniquePlayerIds(value?.conIds).filter((id) => selectedSet.has(id) && !proSet.has(id)).slice(0, 4);
  const assigned = new Set([...proIds, ...conIds]);
  const proCaptainId = proIds.includes(Number(value?.proCaptainId)) ? Number(value.proCaptainId) : proIds[0] || null;
  const conCaptainId = conIds.includes(Number(value?.conCaptainId)) ? Number(value.conCaptainId) : conIds[0] || null;
  return {
    proIds,
    conIds,
    judgeIds: selectedIds.filter((id) => !assigned.has(id)),
    proCaptainId,
    conCaptainId
  };
}

function getOrderedDebatePlayerIds(teams, playerIds = []) {
  const selectedIds = uniquePlayerIds(playerIds).slice(0, 12);
  const selectedSet = new Set(selectedIds);
  const assigned = uniquePlayerIds([...(teams?.proIds || []), ...(teams?.conIds || []), ...(teams?.judgeIds || [])])
    .filter((id) => selectedSet.has(id));
  const missing = selectedIds.filter((id) => !assigned.includes(id));
  return [...assigned, ...missing];
}

function uniquePlayerIds(value = []) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(Boolean))];
}

function getDebateTeamKey(side) {
  if (side === 'con') return 'conIds';
  if (side === 'judge') return 'judgeIds';
  return 'proIds';
}

function findDebateTeamSlot(teams, playerId) {
  const id = Number(playerId);
  const groups = [
    ['pro', teams.proIds],
    ['con', teams.conIds],
    ['judge', teams.judgeIds]
  ];
  for (const [side, ids] of groups) {
    const index = ids.findIndex((item) => Number(item) === id);
    if (index >= 0) return { side, index };
  }
  return null;
}

function removeDebatePlayerIds(ids, playerId, targetPlayerId) {
  return ids.map((id) => {
    const value = Number(id);
    if (value === Number(playerId) || value === Number(targetPlayerId)) return undefined;
    return value;
  });
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
