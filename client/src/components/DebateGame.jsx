import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Award, CircleHelp, Crown, GripVertical, Landmark, MessageSquareText, Shield, Star, Swords, Users, X } from 'lucide-react';
import { fetchAiHealth } from '../api/gameApi';
import { classNames } from '../utils/gameState';
import { getPlayerAvatar, normalizeHostId } from '../utils/player';
import { useSpeechQueue } from '../hooks/useSpeechQueue';
import { useGameSocketSession } from '../hooks/useGameSocketSession';
import { DebateControls } from './debate/DebateControls';
import { PlayerAvatar } from './common/BaseModal';
import { HostSelector } from './common/HostSelector';
import { PlayerDetailModal } from './common/PlayerDetailModal';
import {
  DEBATE_SUBTITLE_CONFIG,
  formatDebateSubtitle,
  getSubtitleChunkDelay,
  getSubtitlePlaybackDelay,
  splitDebateSubtitle
} from './debate/debateSubtitle';
import { SpeechInsightOverlay } from './SpeechInsightOverlay';
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

const DEFAULT_DEBATE_STAGE_STEPS = [
  { ids: ['strategy', 'opening'], label: '立论阶段', Icon: Landmark },
  { ids: ['crossfire'], label: '正反攻辩', Icon: Swords },
  { ids: ['free'], label: '自由辩论', Icon: Users },
  { ids: ['closing'], label: '总结陈词', Icon: MessageSquareText },
  { ids: ['judges'], label: '评委点评', Icon: CircleHelp },
  { ids: ['mvp'], label: '最佳辩手评选', Icon: Star },
  { ids: ['postgame'], label: '赛后发言', Icon: MessageSquareText }
];

export function DebateGame({ replayGameId = '', onReturnToSelect }) {
  const [game, setGame] = useState(EMPTY_DEBATE);
  const [status, setStatus] = useState('idle');
  const [streamMessage, setStreamMessage] = useState('真实模式已就绪，点击开始后调用 AI。');
  const [activeSpeech, setActiveSpeech] = useState(null);
  const [subtitleSpeech, setSubtitleSpeech] = useState(null);
  const [isThinking, setIsThinking] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [topicDraft, setTopicDraft] = useState(DEFAULT_DEBATE_TOPIC);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [captainEnabled, setCaptainEnabled] = useState(true);
  const [debateTeamDraft, setDebateTeamDraft] = useState(() => createDefaultDebateTeams([]));
  const [selectedHostId, setSelectedHostId] = useState('default');
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const subtitleTimerRef = useRef(null);
  const { speechEnabled, setSpeechEnabled, speak, unlock, cancel } = useSpeechQueue();

  useEffect(() => {
    if (!replayGameId) return;
    startGame(topicDraft, debateTeamDraft, selectedHostId, { replayGameId });
  }, [replayGameId]);

  useEffect(() => {
    if (!topicDialogOpen) return;
    let cancelled = false;
    fetchAiHealth()
      .then((data) => {
        if (cancelled) return;
        setAvailablePlayers(data.players || []);
        setSelectedHostId((current) => current === 'default' ? normalizeHostId(data.defaultHostId) : current);
      })
      .catch(() => {
        if (!cancelled) setAvailablePlayers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [topicDialogOpen]);

  const displayGame = game || EMPTY_DEBATE;
  const currentPhase = displayGame.phases?.at(-1) || null;
  const currentSpeakerId = activeSpeech?.playerId || null;
  const {
    autoPlay,
    isReplayMode,
    startSession,
    closeSession,
    resetSessionRefs,
    acknowledgePending,
    setAutoPlayEnabled,
    skipCurrentReplayPhase,
    clearPendingAckTimer
  } = useGameSocketSession({
    gameType: 'debate',
    speechEnabled,
    speak,
    cancel,
    applyServerEvent,
    playPendingEvent: playPendingDebateEvent,
    onError: (error) => {
      setStatus('error');
      setIsThinking(false);
      setStreamMessage(error.message || '辩论赛生成失败');
    },
    onAcknowledge: () => {
      setActiveSpeech(null);
      if (status === 'streaming') setIsThinking(true);
    },
    onAutoPlayStopped: () => {
      clearSubtitleTimer();
      setSubtitleSpeech(null);
      setActiveSpeech(null);
      setIsThinking(false);
    },
    onSkipPhase: () => {
      clearSubtitleTimer();
      setActiveSpeech(null);
      setSubtitleSpeech(null);
      setIsThinking(true);
      setStreamMessage('正在跳过当前阶段...');
    }
  });
  const isRunning = status === 'streaming';
  const hasStarted = status !== 'idle' || Boolean(displayGame.phases?.length);
  const controlsLocked = isRunning;
  const canStartNextGame = !isRunning || !autoPlay;
  function resetToIdle(message) {
    closeSession();
    cancel();
    resetSessionRefs();
    clearSubtitleTimer();
    setResultModalOpen(false);
    setGame(EMPTY_DEBATE);
    setActiveSpeech(null);
    setSubtitleSpeech(null);
    setIsThinking(false);
    setStatus('idle');
    setSelectedHostId('default');
    setStreamMessage(message || '真实模式已就绪，点击开始后调用 AI。');
  }

  function requestStartGame() {
    if (!canStartNextGame) return;
    setTopicDialogOpen(true);
  }

  function startGame(topic = topicDraft, teams = debateTeamDraft, hostId = selectedHostId, options = {}) {
    resetToIdle('');
    if (speechEnabled) unlock();
    const nextTopic = normalizeTopicDraft(topic);
    const playerIdsForTeams = availablePlayers.map((player) => player.id);
    const normalizedTeamsForStart = normalizeDebateTeamDraft(teams, playerIdsForTeams);
    const effectiveCaptainEnabled = captainEnabled && Boolean(normalizedTeamsForStart.proCaptainId && normalizedTeamsForStart.conCaptainId);
    const nextTeams = {
      ...normalizedTeamsForStart,
      captainEnabled: effectiveCaptainEnabled,
      proCaptainId: effectiveCaptainEnabled ? normalizedTeamsForStart.proCaptainId : null,
      conCaptainId: effectiveCaptainEnabled ? normalizedTeamsForStart.conCaptainId : null
    };
    const assignedPlayerIds = uniquePlayerIds([...(nextTeams.proIds || []), ...(nextTeams.conIds || []), ...(nextTeams.judgeIds || [])]);
    const shouldSendTeams = assignedPlayerIds.length >= 8;
    setTopicDraft(nextTopic);
    setDebateTeamDraft(nextTeams);
    setSelectedHostId(normalizeHostId(hostId));
    setTopicDialogOpen(false);
    setStatus('streaming');
    setIsThinking(true);
    setStreamMessage('游戏准备中...');
    startSession({
      mode: 'real',
      hostId: normalizeHostId(hostId),
      topic: nextTopic,
      debateTeams: shouldSendTeams ? nextTeams : null,
      replayGameId: options.replayGameId || ''
    });
  }

  function replayCurrentGame() {
    setResultModalOpen(false);
    if (!displayGame.id) return;
    startGame(displayGame.topic, createDebateTeamsFromPlayers(displayGame.players || []), selectedHostId, { replayGameId: displayGame.id });
  }

  function openNextGameSettings() {
    setResultModalOpen(false);
    requestStartGame();
  }

  function applyServerEvent(event) {
    setIsThinking(false);
    if (event.message) setStreamMessage(event.message);
    if (event.game) setGame(event.game);
    if (event.players) setGame((value) => ({ ...(value || EMPTY_DEBATE), players: event.players }));
    if (event.type === 'speech' && event.speech) {
      const label = event.speech.side === 'host' ? '主持人' : getDebateSpeakerLabel(event.game?.players || displayGame.players, event.speech.playerId);
      setStreamMessage(`${label}正在发言`);
      setActiveSpeech(event.speech.side === 'host' ? null : { playerId: event.speech.playerId, text: event.speech.text });
      if (!speechEnabled) playSubtitleText(event.speech.text, event.speech.playerId, event.ackId, event);
      return;
    }
    const subtitleText = event.subtitle?.text || event.narration || getDebateNarration(event) || event.message;
    if (subtitleText && event.type !== 'game') {
      setActiveSpeech({ playerId: null, text: subtitleText });
      if (!speechEnabled) playSubtitleText(subtitleText, null, event.ackId, event);
    }
    if (event.type === 'done') {
      setStatus('ready');
      setIsThinking(false);
      setStreamMessage(event.message || '辩论赛已完成。');
      if (event.game?.winner || event.game?.mvp) setResultModalOpen(true);
    }
  }

  function playPendingDebateEvent(event, { setAckTimer }) {
    const narration = event.subtitle?.text || event.narration || getDebateNarration(event);
    if (speechEnabled && narration) {
      const shouldUseSentenceQueue = Boolean(event?.speech?.playerId);
      const queued = shouldUseSentenceQueue
        ? speakSubtitleChunks(narration, event?.speech?.playerId || null, event.ackId, event)
        : event.audioUrl
        ? speakServerSubtitle(narration, event?.speech?.playerId || null, event.ackId, event)
        : speakSubtitleChunks(narration, event?.speech?.playerId || null, event.ackId, event);
      if (!queued) {
        playSubtitleText(narration, event?.speech?.playerId || null, event.ackId, event);
        setAckTimer(getSubtitlePlaybackDelay(narration));
      }
    } else {
      playSubtitleText(narration, event?.speech?.playerId || null, event.ackId, event);
      setAckTimer(getSubtitlePlaybackDelay(narration));
    }
    return true;
  }

  function playSubtitleText(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const chunks = splitDebateSubtitle(text, DEBATE_SUBTITLE_CONFIG.maxChars);
    if (!chunks.length) {
      setSubtitleSpeech(null);
      return;
    }
    let index = 0;
    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const showNext = () => {
      setSubtitleSpeech({
        id: `${baseId}-${index}`,
        playerId,
        text: chunks[index],
        speakerLabel: event?.subtitle?.speakerLabel || '',
        speakerRole: event?.subtitle?.speakerRole || ''
      });
      index += 1;
      if (index < chunks.length) {
        subtitleTimerRef.current = window.setTimeout(showNext, getSubtitleChunkDelay(chunks[index - 1]));
      }
    };
    showNext();
  }

  function speakSubtitleChunks(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const chunks = splitDebateSubtitle(text, DEBATE_SUBTITLE_CONFIG.maxChars);
    if (!chunks.length) return false;
    const baseId = `${ackId || Date.now()}-${playerId || 'system'}`;
    const voicePackageId = (event?.game?.players || game?.players || []).find((player) => Number(player.id) === Number(playerId))?.voicePackageId;
    let queued = true;
    chunks.forEach((chunk, index) => {
      const isLast = index === chunks.length - 1;
      const speechText = chunk;
      const itemQueued = speak(speechText, isLast ? acknowledgePending : undefined, {
        playerId,
        voicePackageId,
        audioUrl: event?.audioSegments?.[index]?.audioUrl,
        onStart: () => {
          setSubtitleSpeech({
            id: `${baseId}-${index}`,
            playerId,
            text: chunk,
            speakerLabel: event?.subtitle?.speakerLabel || '',
            speakerRole: event?.subtitle?.speakerRole || '',
            fullText: event?.speech?.fullText || text,
            thinking: event?.speech?.thinking || ''
          });
        }
      });
      if (!itemQueued) queued = false;
    });
    return queued;
  }

  function getDebateSpeechOptions(event, playerId) {
    const player = (event?.game?.players || game?.players || []).find((item) => Number(item.id) === Number(playerId));
    const hostVoicePackageId = event?.game?.host?.voicePackageId || game?.host?.voicePackageId || null;
    return {
      playerId,
      voicePackageId: player?.voicePackageId || (!playerId ? hostVoicePackageId : null),
      audioUrl: event?.audioUrl
    };
  }

  function speakServerSubtitle(text, playerId, ackId, event) {
    clearSubtitleTimer();
    const speechText = text;
    return speak(speechText, acknowledgePending, {
      ...getDebateSpeechOptions(event, playerId),
      onStart: () => {
        setSubtitleSpeech({
          id: `${ackId || Date.now()}-${playerId || 'system'}`,
          playerId,
          text,
          speakerLabel: event?.subtitle?.speakerLabel || '',
          speakerRole: event?.subtitle?.speakerRole || '',
          fullText: event?.speech?.fullText || text,
          thinking: event?.speech?.thinking || ''
        });
      }
    });
  }

  function clearSubtitleTimer() {
    if (!subtitleTimerRef.current) return;
    window.clearTimeout(subtitleTimerRef.current);
    subtitleTimerRef.current = null;
  }

  function handleAutoPlayChange(value) {
    setAutoPlayEnabled(value);
  }

  function returnToSelect() {
    closeSession();
    cancel();
    clearPendingAckTimer();
    resetSessionRefs();
    onReturnToSelect();
  }

  return (
    <main className="game-shell debate-shell real-mode">
      <DebateControls
        autoPlay={autoPlay}
        onReturn={returnToSelect}
        setAutoPlay={handleAutoPlayChange}
        startLabel="开局"
        startTitle={isRunning && autoPlay ? '暂停后可以开始下一局' : displayGame.phases?.length ? '开始下一局' : '开始游戏'}
        startDisabled={!canStartNextGame}
        playbackDisabled={!hasStarted}
        showSkip={isReplayMode}
        skipDisabled={!isReplayMode || !hasStarted || status !== 'streaming'}
        onStart={requestStartGame}
        onSkipPhase={skipCurrentReplayPhase}
      />

      <DebateArena
        game={displayGame}
        currentSpeakerId={currentSpeakerId}
        currentPhase={currentPhase}
        streamMessage={streamMessage}
        activeSpeech={activeSpeech}
        subtitleSpeech={subtitleSpeech}
        isThinking={isThinking}
        onPlayerSelect={setSelectedPlayer}
        isIdle={status === 'idle' || !displayGame.phases?.length}
      />

      {status === 'error' && <p className="debate-error">{streamMessage}</p>}

      {resultModalOpen && (
        <DebateResultModal
          game={displayGame}
          onNextGame={openNextGameSettings}
          onReplay={replayCurrentGame}
        />
      )}

      {selectedPlayer && (
        <PlayerDetailModal
          player={selectedPlayer}
          subtitle={getDebatePlayerLabel(displayGame.players, selectedPlayer.id)}
          fields={[
            { label: '性格', value: selectedPlayer.personality || '暂无' },
            { label: '本局身份', value: getDebatePlayerLabel(displayGame.players, selectedPlayer.id) },
            { label: '身份说明', value: getDebateIdentityDescription(selectedPlayer) }
          ]}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
      {topicDialogOpen && (
        <DebateTopicDialog
          topic={topicDraft}
          onChange={setTopicDraft}
          selectedPlayerIds={availablePlayers.map((player) => player.id)}
          players={availablePlayers}
          teams={debateTeamDraft}
          selectedHostId={selectedHostId}
          onHostChange={setSelectedHostId}
          onTeamsChange={setDebateTeamDraft}
          captainEnabled={captainEnabled}
          onCaptainEnabledChange={setCaptainEnabled}
          speechEnabled={speechEnabled}
          onSpeechEnabledChange={(value) => {
            setSpeechEnabled(value);
            if (value) unlock();
          }}
          onCancel={() => setTopicDialogOpen(false)}
          onStart={(topic, teams, hostId) => startGame(topic, teams, hostId)}
        />
      )}
      <SpeechInsightOverlay speech={subtitleSpeech} players={displayGame.players} />
    </main>
  );
}

function DebateArena({ game, currentSpeakerId, currentPhase, streamMessage, subtitleSpeech, isThinking, onPlayerSelect, isIdle }) {
  const proPlayers = useMemo(() => game.players.filter((player) => player.side === 'pro'), [game.players]);
  const conPlayers = useMemo(() => game.players.filter((player) => player.side === 'con'), [game.players]);
  const judges = useMemo(() => game.players.filter((player) => player.side === 'judge'), [game.players]);
  const mvpVoteTargets = useMemo(() => currentPhase?.id === 'mvp' ? getMvpVoteTargetMap(game) : new Map(), [game, currentPhase]);
  const phaseSteps = useMemo(() => getDebatePhaseSteps(game.phases, currentPhase), [game.phases, currentPhase]);
  const activeStepIndex = getActiveStageIndex(currentPhase, phaseSteps);
  const subtitleMaxChars = getDebateSubtitleMaxChars(game);
  const currentTitle = isIdle ? '等待开局' : getStageTitle(currentPhase);
  return (
    <>
      <DebateSide
        title="正方"
        position={game.topic?.proPosition}
        players={proPlayers}
        tone="pro"
        mvpId={game.mvp?.id}
        currentSpeakerId={currentSpeakerId}
        onPlayerSelect={onPlayerSelect}
        mvpVoteTargets={mvpVoteTargets}
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
          {isThinking && <DebateThinking />}
          <DebatePhaseTimeline steps={phaseSteps} activeStepIndex={activeStepIndex} />
        </section>
        {judges.length > 0 && (
          <section className="judge-row">
            {judges.map((judge, index) => (
              <DebateSeat
                player={judge}
                slotLabel={`评委`}
                key={judge.id || `judge-${index}`}
                currentSpeakerId={currentSpeakerId}
                onPlayerSelect={onPlayerSelect}
                tone="judge"
                index={index}
                mvpVoteTarget={mvpVoteTargets.get(Number(judge.id))}
                isMvp={Number(game.mvp?.id) === Number(judge.id)}
              />
            ))}
          </section>
        )}
      </div>

      <DebateSide
        title="反方"
        position={game.topic?.conPosition}
        players={conPlayers}
        tone="con"
        mvpId={game.mvp?.id}
        currentSpeakerId={currentSpeakerId}
        onPlayerSelect={onPlayerSelect}
        mvpVoteTargets={mvpVoteTargets}
      />
      <DebateSubtitle speech={subtitleSpeech} players={game.players} maxChars={subtitleMaxChars} />
    </>
  );
}

function DebateThinking() {
  return (
    <div className="debate-thinking">
      <span />
      <strong>正在思考中</strong>
    </div>
  );
}

function DebateSubtitle({ speech, players, maxChars = DEBATE_SUBTITLE_CONFIG.maxChars }) {
  const text = formatDebateSubtitle(speech?.text, maxChars);
  if (!text) return <div className="debate-subtitle empty" aria-hidden="true" />;
  const speaker = speech.speakerLabel || (speech.playerId ? getDebateSpeakerLabel(players, speech.playerId) : '主持人');
  return (
    <div className="debate-subtitle" key={speech.id || `${speech.playerId || 'host'}-${text}`}>
      <p><span>{speaker}</span> {text}</p>
    </div>
  );
}

function getDebateSubtitleMaxChars(game) {
  return game?.subtitleMaxChars || game?.config?.subtitleMaxChars || DEBATE_SUBTITLE_CONFIG.maxChars;
}

function removeParentheticalText(value) {
  return String(value || '')
    .replace(/（[^（）]*）/g, '')
    .replace(/\([^()]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function DebateSide({ title, position, players, tone, mvpId, currentSpeakerId, onPlayerSelect, mvpVoteTargets }) {
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
            mvpVoteTarget={mvpVoteTargets?.get(Number(player?.id))}
            isMvp={Number(player?.id) === Number(mvpId)}
          />
        ))}
      </div>
    </aside>
  );
}

function DebateSeat({ player, currentSpeakerId, slotLabel, onPlayerSelect, tone = 'pro', index = 0, mvpVoteTarget = '', isMvp = false }) {
  const isSpeaking = player && Number(currentSpeakerId) === Number(player.id);
  const isJudge = tone === 'judge';
  const isCaptain = !isJudge && player?.debateRole === 'captain';
  const name = player?.nickname || player?.name;
  return (
    <article className={classNames('debate-seat', tone, isSpeaking && 'speaking', isMvp && 'mvp-seat', !player && 'empty')}>
      <div
        className="debate-avatar player-detail-trigger"
        style={getPlayerAvatar(player) ? { backgroundImage: `url("${formatAvatarUrl(getPlayerAvatar(player))}")` } : undefined}
        onClick={() => player && onPlayerSelect?.(player)}
        aria-label={player ? `查看${name}信息` : `${slotLabel}席位空缺`}
      >
        {!getPlayerAvatar(player) && <span className="avatar-sprite" />}
        {isCaptain && <span className="captain-avatar-badge">队长</span>}
        {isMvp && <span className="mvp-avatar-badge"><Crown size={18} strokeWidth={3} />最佳</span>}
      </div>
      <div className="debate-nameplate">
        <span className="seat-badge">{isJudge ? slotLabel : `${toChineseOrdinal(index + 1)}辩`}</span>
        <strong>
          {name || slotLabel}
        </strong>
        {isMvp && <span className="seat-mvp-badge">本场最佳辩手</span>}
        {mvpVoteTarget && <span className="seat-mvp-vote">投 {mvpVoteTarget}</span>}
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

function DebatePhaseTimeline({ steps, activeStepIndex }) {
  const displaySteps = steps.length ? steps : [{ id: 'pending', label: '等待开局', Icon: MessageSquareText }];
  return (
    <ol className="debate-phase-timeline" aria-label="比赛流程">
      {displaySteps.map((step, index) => {
        const Icon = step.Icon;
        return (
          <li
            className={classNames(index === activeStepIndex && 'active', index < activeStepIndex && 'past')}
            key={step.id || step.label}
          >
            <span className="phase-number">{index + 1}</span>
            <span className="phase-icon"><Icon size={38} strokeWidth={2.5} /></span>
            <strong>{step.label}</strong>
            {index < displaySteps.length - 1 && <span className="phase-arrow" />}
          </li>
        );
      })}
    </ol>
  );
}

function getDebatePhaseSteps(phases = [], currentPhase = null) {
  const source = Array.isArray(phases) ? phases : [];
  const steps = [];
  const seen = new Set();
  [...source, currentPhase].filter(Boolean).forEach((phase) => {
    const id = String(phase.id || phase.phase || phase.name || `phase-${steps.length + 1}`);
    if (seen.has(id)) return;
    seen.add(id);
    steps.push({
      id,
      label: phase.name || phase.title || getDefaultPhaseLabel(id),
      Icon: getPhaseIcon(id, phase)
    });
  });
  return steps;
}

function getActiveStageIndex(currentPhase, steps = []) {
  const phaseId = String(currentPhase?.id || steps.at(-1)?.id || '');
  const direct = steps.findIndex((step) => step.id === phaseId);
  if (direct >= 0) return direct;
  return Math.max(0, steps.length - 1);
}

function getStageTitle(currentPhase) {
  return currentPhase?.name || currentPhase?.title || getDefaultPhaseLabel(currentPhase?.id) || '等待开赛';
}

function getDefaultPhaseLabel(phaseId) {
  const text = String(phaseId || '');
  const matched = DEFAULT_DEBATE_STAGE_STEPS.find((step) => step.ids.includes(text));
  if (matched) return matched.label;
  if (!text) return '';
  return text
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPhaseIcon(phaseId, phase = {}) {
  const id = String(phaseId || '').toLowerCase();
  const matched = DEFAULT_DEBATE_STAGE_STEPS.find((step) => step.ids.some((item) => id === item || id.includes(item)));
  if (matched) return matched.Icon;
  const text = `${id} ${phase.name || ''} ${phase.title || ''}`.toLowerCase();
  if (text.includes('judge') || text.includes('评委') || text.includes('点评')) return CircleHelp;
  if (text.includes('mvp') || text.includes('最佳')) return Star;
  if (text.includes('cross') || text.includes('attack') || text.includes('clash') || text.includes('攻辩') || text.includes('交锋')) return Swords;
  if (text.includes('free') || text.includes('自由')) return Users;
  if (text.includes('open') || text.includes('立论') || text.includes('开场')) return Landmark;
  if (text.includes('post') || text.includes('result') || text.includes('赛后') || text.includes('结果')) return Award;
  return MessageSquareText;
}

function DebateTopicDialog({
  topic,
  onChange,
  selectedPlayerIds,
  players,
  teams,
  selectedHostId,
  onHostChange,
  onTeamsChange,
  captainEnabled,
  onCaptainEnabledChange,
  speechEnabled,
  onSpeechEnabledChange,
  onCancel,
  onStart
}) {
  const isReplayLocked = false;
  const effectiveTopic = topic;
  const effectivePlayerIds = selectedPlayerIds;
  const effectiveTeams = teams;
  const normalizedTeams = normalizeDebateTeamDraft(effectiveTeams, effectivePlayerIds);
  const proIds = normalizedTeams.proIds;
  const conIds = normalizedTeams.conIds;
  const judgeIds = normalizedTeams.judgeIds;
  const proCaptainId = captainEnabled ? normalizedTeams.proCaptainId : null;
  const conCaptainId = captainEnabled ? normalizedTeams.conCaptainId : null;
  const judgeSlotCount = Math.max(0, effectivePlayerIds.length - 8);
  const canStart = Boolean(effectiveTopic.title?.trim() && effectiveTopic.proPosition?.trim() && effectiveTopic.conPosition?.trim() && proIds.filter(Boolean).length === 4 && conIds.filter(Boolean).length === 4);
  const update = (key, value) => {
    if (isReplayLocked) return;
    onChange({ ...topic, [key]: value });
  };
  const playerMap = useMemo(() => new Map(players.map((player) => [Number(player.id), player])), [players]);
  const selectedPlayers = effectivePlayerIds.map((id) => playerMap.get(Number(id)) || { id, nickname: `${id}号` });
  const getPlayer = (id) => selectedPlayers.find((player) => Number(player.id) === Number(id));
  const assignedIds = new Set([...proIds, ...conIds, ...judgeIds].map(Number));
  const audiencePlayers = selectedPlayers.filter((player) => !assignedIds.has(Number(player.id)));

  const assignPlayerToSlot = (playerId, side, index) => {
    if (isReplayLocked) return;
    const id = Number(playerId);
    if (!id) return;
    const current = { proIds: [...proIds], conIds: [...conIds], judgeIds: [...judgeIds] };
    const targetKey = getDebateTeamKey(side);
    const target = current[targetKey];
    const capacity = side === 'judge' ? judgeSlotCount : 4;
    const source = findDebateTeamSlot(current, id);
    const targetOccupant = Number(target[index]) || null;
    if (source?.side === side && source.index === index) return;
    if (index >= capacity) return;

    const next = {
      proIds: removeDebatePlayerIds(current.proIds, id, targetOccupant),
      conIds: removeDebatePlayerIds(current.conIds, id, targetOccupant),
      judgeIds: removeDebatePlayerIds(current.judgeIds, id, targetOccupant)
    };
    next[targetKey][index] = id;
    if (targetOccupant && source) next[getDebateTeamKey(source.side)][source.index] = targetOccupant;
    onTeamsChange(normalizeDebateTeamDraft(next, effectivePlayerIds));
  };

  const handleDrop = (event, side, index) => {
    if (isReplayLocked) return;
    event.preventDefault();
    const value = event.dataTransfer.getData('text/plain');
    if (value.startsWith('captain:')) return;
    assignPlayerToSlot(value, side, index);
  };

  const returnPlayerToAudience = (event) => {
    if (isReplayLocked) return;
    event.preventDefault();
    const id = Number(event.dataTransfer.getData('text/plain'));
    if (!id) return;
    onTeamsChange(normalizeDebateTeamDraft({
      ...normalizedTeams,
      proIds: proIds.filter((item) => Number(item) !== id),
      conIds: conIds.filter((item) => Number(item) !== id),
      judgeIds: judgeIds.filter((item) => Number(item) !== id),
      proCaptainId: Number(proCaptainId) === id ? null : proCaptainId,
      conCaptainId: Number(conCaptainId) === id ? null : conCaptainId
    }, effectivePlayerIds));
  };

  const setCaptain = (side, playerId) => {
    if (isReplayLocked || !captainEnabled) return;
    const id = Number(playerId);
    if (!id) return;
    if (side === 'pro' && proIds.includes(id)) {
      onTeamsChange(normalizeDebateTeamDraft({ ...normalizedTeams, proCaptainId: id }, effectivePlayerIds));
    }
    if (side === 'con' && conIds.includes(id)) {
      onTeamsChange(normalizeDebateTeamDraft({ ...normalizedTeams, conCaptainId: id }, effectivePlayerIds));
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
            <input value={effectiveTopic.title} onChange={(event) => update('title', event.target.value)} placeholder="请输入本场辩题" disabled={isReplayLocked} />
          </label>
          <div className="debate-position-row">
            <label>
              <span>正方 <b>*</b></span>
              <input value={effectiveTopic.proPosition} onChange={(event) => update('proPosition', event.target.value)} placeholder="请输入正方观点" disabled={isReplayLocked} />
            </label>
            <label>
              <span>反方 <b>*</b></span>
              <input value={effectiveTopic.conPosition} onChange={(event) => update('conPosition', event.target.value)} placeholder="请输入反方观点" disabled={isReplayLocked} />
            </label>
          </div>
        </section>

        <section className="debate-team-board">
          <DebateTeamColumn title="正方" tone="pro" ids={proIds} slots={4} labelPrefix="正方" getPlayer={getPlayer} captainId={proCaptainId} onCaptainDrop={setCaptain} onDrop={handleDrop} disabled={isReplayLocked} captainEnabled={captainEnabled} />
          <DebateTeamColumn title="评委" tone="judge" ids={judgeIds} slots={judgeSlotCount} labelPrefix="评委" getPlayer={getPlayer} onDrop={handleDrop} disabled={isReplayLocked} />
          <DebateTeamColumn title="反方" tone="con" ids={conIds} slots={4} labelPrefix="反方" getPlayer={getPlayer} captainId={conCaptainId} onCaptainDrop={setCaptain} onDrop={handleDrop} disabled={isReplayLocked} captainEnabled={captainEnabled} />
        </section>

        <HostSelector
          players={players}
          selectedHostId={selectedHostId}
          onChange={onHostChange}
          className="debate-host-config"
          listClassName="debate-host-list"
          description="可将任意 AI 玩家设为本局主持人，不占用正反方或评委席位"
        />

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

        <section
          className="debate-player-pool"
          onDragOver={(event) => !isReplayLocked && event.preventDefault()}
          onDrop={returnPlayerToAudience}
        >
          <div className="player-pool-head">
            <strong>观众席（{audiencePlayers.length}名）</strong>
            <span>拖入正方、反方或评委席才会参与本局；从比赛席拖回这里则移出本局。</span>
          </div>
          <div className="player-pool-list">
            {audiencePlayers.map((player) => (
              <DraggableDebatePlayer player={player} key={player.id} />
            ))}
            {!audiencePlayers.length && <em className="player-pool-empty">观众席为空</em>}
          </div>
        </section>

        <footer>
          <div className="debate-topic-switches">
            <button
              type="button"
              className={classNames('dialog-switch', captainEnabled && 'active')}
              onClick={() => onCaptainEnabledChange?.(!captainEnabled)}
              disabled={isReplayLocked && !captainEnabled}
              title={isReplayLocked && !captainEnabled ? '导入对局未配置队长' : '切换本局是否启用队长'}
            >
              <span className="switch-track"><i /></span>
              <strong>{captainEnabled ? '队长开启' : '无队长'}</strong>
            </button>
            <button type="button" className={classNames('dialog-switch', speechEnabled && 'active')} onClick={() => onSpeechEnabledChange(!speechEnabled)}>
              <span className="switch-track"><i /></span>
              <strong>{speechEnabled ? '语音开启' : '语音关闭'}</strong>
            </button>
          </div>
          <button type="button" className="primary debate-start-submit" onClick={() => onStart(effectiveTopic, normalizedTeams, selectedHostId)} disabled={!canStart}>保存并开始</button>
        </footer>
      </section>
    </div>
  );
}

function DebateTeamColumn({ title, tone, ids, slots, labelPrefix, getPlayer, captainId, onCaptainDrop, onDrop, disabled = false, captainEnabled = true }) {
  const Icon = tone === 'judge' ? Users : Shield;
  return (
    <div className={`debate-team-column ${tone}`}>
      <h3>
        <Icon size={22} />
        {title}
        {tone !== 'judge' && captainEnabled && <CaptainDragToken tone={tone} disabled={disabled} />}
      </h3>
      <div className="team-slot-list">
        {Array.from({ length: slots }).map((_, index) => {
          const player = getPlayer(ids[index]);
          return (
            <div
              className={classNames('team-drop-slot', player && 'filled', disabled && 'locked')}
              key={`${tone}-${index}`}
              onDragOver={(event) => {
                if (!disabled) event.preventDefault();
              }}
              onDrop={(event) => !disabled && onDrop(event, tone, index)}
            >
              <span className="team-slot-label">{labelPrefix} {index + 1}{tone === 'judge' ? '' : '辩'}</span>
              {player ? (
                <DraggableDebatePlayer
                  player={player}
                  compact
                  tone={tone}
                  isCaptain={captainEnabled && Number(captainId) === Number(player.id)}
                  onCaptainDrop={onCaptainDrop}
                  disabled={disabled}
                />
              ) : <em>+ 拖拽选手到此处</em>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CaptainDragToken({ tone, disabled = false }) {
  return (
    <span
      className={classNames('team-captain-token', disabled && 'locked')}
      draggable={!disabled}
      title="拖到本方选手卡上设置队长"
      onDragStart={(event) => {
        if (disabled) return;
        event.dataTransfer.setData('text/plain', `captain:${tone}`);
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <Crown size={15} />
      队长
    </span>
  );
}

function DraggableDebatePlayer({ player, compact = false, tone = '', isCaptain = false, onCaptainDrop, disabled = false }) {
  const name = player.nickname || player.name || `${player.id}号`;
  const allowCaptainDrop = tone === 'pro' || tone === 'con';
  return (
    <div
      className={classNames('drag-player-card', compact && 'compact', isCaptain && 'captain', disabled && 'locked')}
      draggable={!disabled}
      onDragOver={(event) => {
        if (disabled) return;
        if (!allowCaptainDrop) return;
        const value = event.dataTransfer.types.includes('text/plain') ? event.dataTransfer.getData('text/plain') : '';
        if (!value || value === `captain:${tone}`) event.preventDefault();
      }}
      onDrop={(event) => {
        if (disabled) return;
        const value = event.dataTransfer.getData('text/plain');
        if (value !== `captain:${tone}`) return;
        event.preventDefault();
        event.stopPropagation();
        onCaptainDrop?.(tone, player.id);
      }}
      onDragStart={(event) => {
        if (disabled) return;
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
      <div className="debate-result-summary">
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
      </div>
    </section>
  );
}

function DebateResultModal({ game, onNextGame, onReplay }) {
  const report = useMemo(() => getShareReport(game), [game]);
  const [posterUrl, setPosterUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    setPosterUrl('');
    createDebateResultPoster(report)
      .then((url) => {
        if (!cancelled && url) setPosterUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPosterUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [report]);

  return (
    <div className="debate-result-modal-backdrop" role="presentation">
      <section className="debate-result-modal share-report-modal" role="dialog" aria-modal="true" aria-label="本局比赛结束">
        {posterUrl
          ? <img className="debate-result-poster" src={posterUrl} alt="本局比赛结束战报海报" />
          : <div className="debate-result-poster debate-result-poster-loading" aria-label="正在生成战报海报" />}

        <footer>
          <button type="button" onClick={onReplay}>复盘</button>
          <button type="button" onClick={() => downloadResultPoster(posterUrl, report)} disabled={!posterUrl}>下载海报</button>
          <button type="button" className="primary" onClick={onNextGame}>下一局</button>
        </footer>
      </section>
    </div>
  );
}

function getShareReport(game) {
  if (game?.shareReport) {
    const playerMap = new Map((game.players || []).map((player) => [Number(player.id), player]));
    const withPlayerAvatar = (players = []) => players.map((player) => {
      const match = playerMap.get(Number(player.id));
      return {
        ...player,
        avatar: getPlayerAvatar(player) || getPlayerAvatar(match) || '',
        avatarUrl: getPlayerAvatar(player) || getPlayerAvatar(match) || ''
      };
    });
    return {
      ...game.shareReport,
      proLineup: withPlayerAvatar(game.shareReport.proLineup || []),
      conLineup: withPlayerAvatar(game.shareReport.conLineup || []),
      judges: withPlayerAvatar(game.shareReport.judges || []),
      highlights: game.shareReport.highlights || [],
      judgeComments: game.shareReport.judgeComments || []
    };
  }
  const players = game?.players || [];
  const phases = game?.phases || [];
  return {
    topic: game?.topic?.title || '',
    proPosition: game?.topic?.proPosition || '',
    conPosition: game?.topic?.conPosition || '',
    proLineup: sortReportPlayers(players.filter((player) => player.side === 'pro')),
    conLineup: sortReportPlayers(players.filter((player) => player.side === 'con')),
    judges: sortReportPlayers(players.filter((player) => player.side === 'judge')),
    winner: game?.winner || null,
    winnerLabel: game?.winner === 'pro' ? '正方胜出' : game?.winner === 'con' ? '反方胜出' : game?.winner === 'draw' ? '双方平局' : '待公布',
    winReason: game?.winReason || '',
    mvp: game?.mvp || null,
    highlights: extractClientHighlights(phases, players),
    judgeComments: extractClientJudgeComments(phases, players),
    generatedAt: game?.createdAt || new Date().toISOString()
  };
}

function sortReportPlayers(players) {
  return [...players].sort((a, b) => (Number(a.sideIndex) || 0) - (Number(b.sideIndex) || 0));
}

function extractClientJudgeComments(phases, players) {
  const playerMap = new Map(players.map((player) => [Number(player.id), player]));
  const judgePhase = phases.find((phase) => phase.id === 'judges');
  return (judgePhase?.speeches || [])
    .filter((speech) => speech.kind === 'judge-review' || speech.side === 'judge' || speech.side === 'host')
    .map((speech) => {
      const player = playerMap.get(Number(speech.playerId));
      return {
        judgeId: speech.playerId,
        judgeName: player?.nickname || speech.speakerLabel || '评委',
        text: cleanPosterText(speech.text).slice(0, 120)
      };
    })
    .filter((item) => item.text)
    .slice(0, 3);
}

function extractClientHighlights(phases, players) {
  const playerMap = new Map(players.map((player) => [Number(player.id), player]));
  const phasePriority = new Set(['opening', 'free', 'closing', 'postgame']);
  return phases
    .flatMap((phase) => (phase.speeches || []).map((speech) => ({ phase, speech })))
    .filter(({ phase, speech }) => phasePriority.has(phase.id) && (speech.side === 'pro' || speech.side === 'con'))
    .map(({ speech }) => {
      const text = compactPosterText(speech.text, 56);
      const player = playerMap.get(Number(speech.playerId));
      return {
        playerId: speech.playerId,
        speaker: player?.nickname || speech.speakerLabel || `${speech.playerId}号`,
        side: speech.side,
        text
      };
    })
    .filter((item) => item.text.length >= 12)
    .slice(0, 4);
}

function formatReportNames(players = []) {
  return players.map((player) => player.nickname || player.name || `${player.id}号`).filter(Boolean).join(' / ');
}

const DEBATE_RESULT_POSTER_DESIGN = { width: 1672, height: 941 };
const DEBATE_RESULT_DEBATER_SLOTS = {
  pro: [
    { x: 98, avatarY: 355, nameY: 552, roleY: 590, radius: 58 },
    { x: 258, avatarY: 360, nameY: 557, roleY: 595, radius: 58 },
    { x: 410, avatarY: 365, nameY: 562, roleY: 600, radius: 58 },
    { x: 555, avatarY: 370, nameY: 567, roleY: 605, radius: 58 }
  ],
  con: [
    { x: 1130, avatarY: 370, nameY: 552, roleY: 590, radius: 58 },
    { x: 1285, avatarY: 360, nameY: 557, roleY: 595, radius: 58 },
    { x: 1435, avatarY: 360, nameY: 562, roleY: 600, radius: 58 },
    { x: 1580, avatarY: 355, nameY: 567, roleY: 605, radius: 58 }
  ]
};
const DEBATE_RESULT_JUDGE_SLOTS = [
  { x: 702, avatarY: 834, nameY: 910, radius: 42 },
  { x: 848, avatarY: 834, nameY: 910, radius: 42 },
  { x: 992, avatarY: 834, nameY: 910, radius: 42 }
];
const DEBATE_RESULT_ROLE_LABELS = ['一辩', '二辩', '三辩', '四辩'];

async function createDebateResultPoster(report) {
  if (typeof document === 'undefined') return '';
  const canvas = document.createElement('canvas');
  canvas.width = DEBATE_RESULT_POSTER_DESIGN.width;
  canvas.height = DEBATE_RESULT_POSTER_DESIGN.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  await drawDebateResultPosterBackground(ctx, canvas.width, canvas.height);
  drawDebateResultPosterFrames(ctx);
  await drawDebateResultPosterAvatars(ctx, report);
  drawDebateResultPosterText(ctx, report);

  try {
    return canvas.toDataURL('image/png');
  } catch (error) {
    return '';
  }
}

async function drawDebateResultPosterBackground(ctx, width, height) {
  try {
    const image = await loadPosterImage('/resources/debate_result_poster_bg.png');
    ctx.drawImage(image, 0, 0, width, height);
  } catch (error) {
    // Background is optional; keep the poster information layer usable without it.
  }
}

function drawDebateResultPosterFrames(ctx) {
  DEBATE_RESULT_DEBATER_SLOTS.pro.forEach((slot) => drawPosterAvatarPlaceholder(ctx, slot, 'pro'));
  DEBATE_RESULT_DEBATER_SLOTS.con.forEach((slot) => drawPosterAvatarPlaceholder(ctx, slot, 'con'));
  DEBATE_RESULT_JUDGE_SLOTS.forEach((slot) => drawPosterAvatarPlaceholder(ctx, slot, 'judge'));
}

function drawPosterAvatarPlaceholder(ctx, slot, tone) {
  const color = tone === 'con' ? 'rgba(255, 96, 106, 0.78)' : tone === 'judge' ? 'rgba(240, 226, 255, 0.72)' : 'rgba(86, 168, 255, 0.78)';
  ctx.save();
  ctx.fillStyle = tone === 'con' ? 'rgba(55, 8, 12, 0.34)' : tone === 'judge' ? 'rgba(24, 18, 36, 0.34)' : 'rgba(8, 25, 58, 0.34)';
  ctx.beginPath();
  ctx.arc(slot.x, slot.avatarY, slot.radius, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(slot.x, slot.avatarY, slot.radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function loadPosterImage(src) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    if (/^https?:/i.test(src)) image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function drawDebateResultPosterText(ctx, report) {
  drawPosterBoxText(ctx, report.topic || 'AI 辩论赛', {
    x: 436,
    y: 105,
    width: 800,
    height: 155,
    maxLines: 2,
    maxSize: 60,
    minSize: 34,
    lineHeight: 72,
    color: '#ffffff',
    weight: '950',
    align: 'center',
    shadow: true
  });

  drawPosterSingleLine(ctx, '正方', 90, 718, 150, 46, 32, '#ffffff', '950', 'left');
  drawRotatedPosterBoxText(ctx, report.proPosition || '正方立场', {
    x: 90,
    y: 735,
    width: 520,
    height: 70,
    angle: -2.5,
    maxLines: 2,
    maxSize: 34,
    minSize: 22,
    lineHeight: 42,
    color: '#ffffff',
    weight: '800',
    align: 'left',
    shadow: true
  });
  drawPosterSingleLine(ctx, '反方', 1580, 718, 150, 46, 32, '#ffffff', '950', 'right');
  drawRotatedPosterBoxText(ctx, report.conPosition || '反方立场', {
    x: 1060,
    y: 735,
    width: 520,
    height: 70,
    angle: 2.5,
    maxLines: 2,
    maxSize: 34,
    minSize: 22,
    lineHeight: 42,
    color: '#ffffff',
    weight: '800',
    align: 'right',
    shadow: true
  });

  drawPosterLineup(ctx, 'pro', sortReportPlayers(report.proLineup || []), '#ffffff', '#dbeaff');
  drawPosterLineup(ctx, 'con', sortReportPlayers(report.conLineup || []), '#ffffff', '#ffb8b8');
  drawPosterJudges(ctx, sortReportPlayers(report.judges || []));
}

function drawPosterLineup(ctx, side, players, nameColor, roleColor) {
  const slots = DEBATE_RESULT_DEBATER_SLOTS[side] || [];
  slots.forEach((slot, index) => {
    const player = players[index];
    const name = getPosterPlayerName(player) || `${index + 1}号`;
    drawPosterSingleLine(ctx, name, slot.x, slot.nameY, 144, 23, 16, nameColor, '900', 'center');
    drawPosterSingleLine(ctx, DEBATE_RESULT_ROLE_LABELS[index], slot.x, slot.roleY, 96, 21, 16, roleColor, '850', 'center');
  });
}

function drawPosterJudges(ctx, judges) {
  DEBATE_RESULT_JUDGE_SLOTS.forEach((slot, index) => {
    const judge = judges[index];
    const name = judge ? getPosterPlayerName(judge) : '';
    if (!name) return;
    drawPosterSingleLine(ctx, name, slot.x, slot.nameY, 112, 19, 14, '#f6f0ff', '850', 'center');
  });
}

async function drawDebateResultPosterAvatars(ctx, report) {
  const proPlayers = sortReportPlayers(report.proLineup || []);
  const conPlayers = sortReportPlayers(report.conLineup || []);
  const judgePlayers = sortReportPlayers(report.judges || []).slice(0, 3);
  const tasks = [
    ...DEBATE_RESULT_DEBATER_SLOTS.pro.map((slot, index) => drawCircularAvatar(ctx, proPlayers[index], slot, 'pro')),
    ...DEBATE_RESULT_DEBATER_SLOTS.con.map((slot, index) => drawCircularAvatar(ctx, conPlayers[index], slot, 'con')),
    ...DEBATE_RESULT_JUDGE_SLOTS.map((slot, index) => drawCircularAvatar(ctx, judgePlayers[index], slot, 'judge'))
  ];
  await Promise.all(tasks);
}

async function drawCircularAvatar(ctx, player, slot, fallbackTone) {
  const src = formatAvatarUrl(player?.avatar);
  if (!src) return;
  try {
    const image = await loadPosterImage(src);
    const diameter = slot.radius * 2;
    const sourceSize = Math.min(image.naturalWidth || image.width, image.naturalHeight || image.height);
    const sourceX = ((image.naturalWidth || image.width) - sourceSize) / 2;
    const sourceY = ((image.naturalHeight || image.height) - sourceSize) / 2;
    const avatarCanvas = document.createElement('canvas');
    avatarCanvas.width = diameter;
    avatarCanvas.height = diameter;
    const avatarCtx = avatarCanvas.getContext('2d');
    if (!avatarCtx) return;
    avatarCtx.drawImage(image, sourceX, sourceY, sourceSize, sourceSize, 0, 0, diameter, diameter);
    avatarCanvas.toDataURL('image/png');
    ctx.save();
    ctx.beginPath();
    ctx.arc(slot.x, slot.avatarY, slot.radius, 0, Math.PI * 2);
    ctx.clip();
    ctx.drawImage(avatarCanvas, slot.x - slot.radius, slot.avatarY - slot.radius, diameter, diameter);
    ctx.restore();
    drawAvatarRing(ctx, slot, fallbackTone);
  } catch (error) {
    // Avatar drawing is best-effort; keep the poster usable if an image cannot load.
  }
}

function drawAvatarRing(ctx, slot, tone) {
  const color = tone === 'con' ? 'rgba(255, 88, 92, 0.82)' : tone === 'judge' ? 'rgba(232, 213, 255, 0.72)' : 'rgba(76, 159, 255, 0.82)';
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(slot.x, slot.avatarY, slot.radius + 2, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRotatedPosterBoxText(ctx, text, options) {
  const { x, y, width, height, angle = 0 } = options;
  ctx.save();
  ctx.translate(x + width / 2, y + height / 2);
  ctx.rotate((angle * Math.PI) / 180);
  drawPosterBoxText(ctx, text, {
    ...options,
    x: -width / 2,
    y: -height / 2
  });
  ctx.restore();
}

function drawPosterBoxText(ctx, text, options) {
  const {
    x,
    y,
    width,
    height,
    maxLines,
    maxSize,
    minSize,
    lineHeight,
    color,
    weight,
    align = 'left',
    shadow = false
  } = options;
  const clean = cleanPosterText(text);
  let size = maxSize;
  let lines = [];
  do {
    ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
    lines = wrapCanvasText(ctx, clean, width, maxLines);
    if (lines.length <= maxLines && lines.every((line) => ctx.measureText(line).width <= width)) break;
    size -= 2;
  } while (size > minSize);
  const actualLineHeight = Math.min(lineHeight, size + 14);
  const blockHeight = Math.min(height, lines.length * actualLineHeight);
  const startY = y + Math.max(0, (height - blockHeight) / 2) + size;
  ctx.save();
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  if (shadow) {
    ctx.shadowColor = 'rgba(0, 0, 0, 0.72)';
    ctx.shadowBlur = 10;
    ctx.shadowOffsetY = 3;
  }
  const textX = align === 'center' ? x + width / 2 : align === 'right' ? x + width : x;
  lines.slice(0, maxLines).forEach((line, index) => {
    ctx.fillText(line, textX, startY + index * actualLineHeight);
  });
  ctx.restore();
}

function drawPosterSingleLine(ctx, text, x, y, width, maxSize, minSize, color, weight, align = 'center') {
  let size = maxSize;
  const clean = cleanPosterText(text);
  ctx.save();
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.shadowColor = 'rgba(0, 0, 0, 0.82)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  do {
    ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
    if (ctx.measureText(clean).width <= width || size <= minSize) break;
    size -= 1;
  } while (size > minSize);
  const display = truncateCanvasText(ctx, clean, width);
  ctx.fillText(display, x, y);
  ctx.restore();
}

function truncateCanvasText(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let next = text;
  while (next.length > 1 && ctx.measureText(`${next}...`).width > width) next = next.slice(0, -1);
  return `${next}...`;
}

function createDebatePoster(report, variant) {
  if (typeof document === 'undefined') return '';
  const vertical = variant === 'vertical';
  const canvas = document.createElement('canvas');
  canvas.width = vertical ? 1080 : 1600;
  canvas.height = vertical ? 1920 : 900;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  drawPosterBackground(ctx, canvas.width, canvas.height, report.winner);
  if (vertical) drawVerticalPoster(ctx, report, canvas.width, canvas.height);
  else drawWidePoster(ctx, report, canvas.width, canvas.height);
  return canvas.toDataURL('image/png');
}

function drawPosterBackground(ctx, width, height, winner) {
  const bg = ctx.createLinearGradient(0, 0, width, height);
  bg.addColorStop(0, '#071225');
  bg.addColorStop(0.5, '#132442');
  bg.addColorStop(1, '#1b1029');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = winner === 'pro' ? 'rgba(37, 128, 255, 0.28)' : 'rgba(255, 77, 128, 0.22)';
  ctx.beginPath();
  ctx.arc(width * 0.18, height * 0.12, width * 0.28, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = winner === 'con' ? 'rgba(255, 77, 128, 0.26)' : 'rgba(69, 219, 255, 0.18)';
  ctx.beginPath();
  ctx.arc(width * 0.86, height * 0.86, width * 0.34, 0, Math.PI * 2);
  ctx.fill();
}

function drawVerticalPoster(ctx, report, width, height) {
  let y = 110;
  drawPosterKicker(ctx, 'AI 辩论赛战报', 72, y);
  y += 92;
  y = drawWrappedPosterText(ctx, report.topic || 'AI 辩论赛', 72, y, width - 144, 64, '#ffffff', 3, 78);
  y += 28;
  drawWinnerPill(ctx, report.winnerLabel, 72, y, report.winner);
  drawPosterText(ctx, `最佳辩手 ${getPosterPlayerName(report.mvp)}`, 420, y + 34, 36, '#f6dc85', '900');
  y += 120;
  y = drawPosterPositions(ctx, report, 72, y, width - 144);
  y += 36;
  y = drawLineupBlock(ctx, '正方阵容', report.proLineup, 72, y, width - 144, '#5db8ff');
  y = drawLineupBlock(ctx, '反方阵容', report.conLineup, 72, y + 20, width - 144, '#ff7aa7');
  y = drawLineupBlock(ctx, '评委阵容', report.judges, 72, y + 20, width - 144, '#d6b4ff');
  y += 28;
  y = drawPosterSection(ctx, '胜负理由', report.winReason || '评委综合双方论证质量、反驳力度和团队协作给出结果。', 72, y, width - 144, 44, 3);
  y += 22;
  y = drawPosterList(ctx, '精彩金句', report.highlights.map((item) => item.text), 72, y, width - 144, 2);
  y += 22;
  drawPosterList(ctx, '评委短评', report.judgeComments.map((item) => item.text), 72, y, width - 144, 2);
  drawPosterFooter(ctx, width, height);
}

function drawWidePoster(ctx, report, width, height) {
  drawPosterKicker(ctx, 'AI 辩论赛战报', 72, 80);
  drawWrappedPosterText(ctx, report.topic || 'AI 辩论赛', 72, 150, 740, 54, '#ffffff', 3, 64);
  drawWinnerPill(ctx, report.winnerLabel, 72, 365, report.winner);
  drawPosterText(ctx, `最佳辩手 ${getPosterPlayerName(report.mvp)}`, 350, 399, 36, '#f6dc85', '900');
  drawPosterSection(ctx, '胜负理由', report.winReason || '评委综合双方论证质量、反驳力度和团队协作给出结果。', 72, 470, 690, 34, 3);
  drawPosterPositions(ctx, report, 850, 95, 670);
  drawLineupBlock(ctx, '正方阵容', report.proLineup, 850, 300, 670, '#5db8ff');
  drawLineupBlock(ctx, '反方阵容', report.conLineup, 850, 400, 670, '#ff7aa7');
  drawLineupBlock(ctx, '评委阵容', report.judges, 850, 500, 670, '#d6b4ff');
  drawPosterList(ctx, '精彩金句', report.highlights.map((item) => item.text), 850, 610, 670, 2);
  drawPosterList(ctx, '评委短评', report.judgeComments.map((item) => item.text), 72, 640, 690, 2);
  drawPosterFooter(ctx, width, height);
}

function drawPosterPositions(ctx, report, x, y, width) {
  const gap = 20;
  const cardWidth = (width - gap) / 2;
  drawPosterCard(ctx, x, y, cardWidth, 150, '正方立场', report.proPosition, '#5db8ff');
  drawPosterCard(ctx, x + cardWidth + gap, y, cardWidth, 150, '反方立场', report.conPosition, '#ff7aa7');
  return y + 150;
}

function drawLineupBlock(ctx, title, players, x, y, width, color) {
  drawPosterText(ctx, title, x, y, 28, color, '900');
  drawWrappedPosterText(ctx, formatReportNames(players) || '暂无', x, y + 38, width, 30, '#edf6ff', 2, 34);
  return y + 92;
}

function drawPosterSection(ctx, title, text, x, y, width, fontSize, maxLines) {
  drawPosterText(ctx, title, x, y, 28, '#9edcff', '900');
  return drawWrappedPosterText(ctx, text, x, y + 42, width, fontSize, '#edf6ff', maxLines, fontSize + 10);
}

function drawPosterList(ctx, title, items, x, y, width, maxItems) {
  drawPosterText(ctx, title, x, y, 28, '#9edcff', '900');
  let nextY = y + 42;
  const list = items.length ? items : ['双方围绕核心标准持续交锋，完整呈现了一场 AI 辩论。'];
  list.slice(0, maxItems).forEach((item) => {
    nextY = drawWrappedPosterText(ctx, `“${item}”`, x, nextY, width, 32, '#ffffff', 2, 40) + 10;
  });
  return nextY;
}

function drawPosterCard(ctx, x, y, width, height, title, text, color) {
  ctx.fillStyle = 'rgba(8, 20, 42, 0.72)';
  roundRect(ctx, x, y, width, height, 18);
  ctx.fill();
  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.stroke();
  drawPosterText(ctx, title, x + 24, y + 40, 26, color, '900');
  drawWrappedPosterText(ctx, text, x + 24, y + 82, width - 48, 30, '#ffffff', 2, 38);
}

function drawWinnerPill(ctx, text, x, y, winner) {
  const color = winner === 'con' ? '#ff5f97' : winner === 'pro' ? '#3fa2ff' : '#d6b4ff';
  ctx.fillStyle = color;
  roundRect(ctx, x, y, 260, 68, 34);
  ctx.fill();
  drawPosterText(ctx, text || '待公布', x + 34, y + 45, 34, '#ffffff', '950');
}

function drawPosterKicker(ctx, text, x, y) {
  drawPosterText(ctx, text, x, y, 30, '#9edcff', '900');
}

function drawPosterFooter(ctx, width, height) {
  ctx.globalAlpha = 0.72;
  drawPosterText(ctx, 'CONSENSUS · AI Debate Arena', 72, height - 70, 26, '#b8d9ff', '800');
  ctx.textAlign = 'right';
  drawPosterText(ctx, new Date().toLocaleDateString('zh-CN'), width - 72, height - 70, 26, '#b8d9ff', '800');
  ctx.textAlign = 'left';
  ctx.globalAlpha = 1;
}

function drawPosterText(ctx, text, x, y, size, color, weight = '700') {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(String(text || ''), x, y);
}

function drawWrappedPosterText(ctx, text, x, y, width, size, color, maxLines = 2, lineHeight = size + 8) {
  ctx.fillStyle = color;
  ctx.font = `800 ${size}px "Microsoft YaHei", "PingFang SC", Arial, sans-serif`;
  const lines = wrapCanvasText(ctx, cleanPosterText(text), width, maxLines);
  lines.forEach((line, index) => ctx.fillText(line, x, y + index * lineHeight));
  return y + lines.length * lineHeight;
}

function wrapCanvasText(ctx, text, width, maxLines) {
  const chars = String(text || '').split('');
  const lines = [];
  let line = '';
  chars.forEach((char) => {
    const next = `${line}${char}`;
    if (ctx.measureText(next).width > width && line) {
      lines.push(line);
      line = char;
    } else {
      line = next;
    }
  });
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const limited = lines.slice(0, maxLines);
    let last = limited[limited.length - 1];
    while (last.length > 1 && ctx.measureText(`${last}...`).width > width) last = last.slice(0, -1);
    limited[limited.length - 1] = `${last}...`;
    return limited;
  }
  return lines;
}

function roundRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

function getPosterPlayerName(player) {
  return player?.nickname || player?.name || (player?.id ? `${player.id}号` : '暂未产生');
}

function compactPosterText(value, limit) {
  const clean = cleanPosterText(value);
  const sentence = clean.split(/[。！？!?；;]/).map((item) => item.trim()).find((item) => item.length >= 12) || clean;
  return sentence.slice(0, limit);
}

function cleanPosterText(value) {
  return String(value || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
}

function downloadPoster(dataUrl, report, ratio) {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `AI辩论赛战报-${safePosterFileName(report.topic)}-${ratio}.png`;
  link.click();
}

function downloadResultPoster(dataUrl, report) {
  if (!dataUrl) return;
  const link = document.createElement('a');
  link.href = dataUrl;
  link.download = `AI辩论赛赛后海报-${safePosterFileName(report.topic)}.png`;
  link.click();
}

function safePosterFileName(value) {
  return String(value || '未命名辩题').replace(/[\\/:*?"<>|]/g, '').slice(0, 18);
}

function getMvpVoteTargetMap(game) {
  const mvpPhase = (game.phases || []).find((phase) => phase.id === 'mvp');
  const votes = Array.isArray(mvpPhase?.votes) ? mvpPhase.votes : [];
  const result = new Map();
  if (!votes.length) return result;
  const playerMap = new Map((game.players || []).map((player) => [Number(player.id), player]));
  votes.forEach((vote) => {
    const voterId = Number(vote.voterId);
    const targetId = Number(vote.target);
    const target = playerMap.get(targetId);
    result.set(voterId, target?.nickname || target?.name || `${targetId}号`);
  });
  return result;
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

function formatReplayOption(item) {
  const time = item.savedAt ? new Date(item.savedAt).toLocaleString('zh-CN', { hour12: false }) : '';
  const title = item.title || item.id || '历史对局';
  return time ? `${time}｜${title}` : title;
}

function createReplayOptionFromGame(game) {
  return {
    id: game?.id,
    filename: game?.id,
    savedAt: game?.createdAt,
    title: game?.topic?.title || game?.event?.name || game?.id,
    topic: game?.topic,
    players: game?.players || []
  };
}

function getReplaySetup(options = [], replayId = '') {
  if (!replayId) return null;
  const replay = options.find((item) => (item.filename || item.id) === replayId || item.id === replayId);
  const players = Array.isArray(replay?.players) ? replay.players : [];
  const playerIds = uniquePlayerIds(players.map((player) => player.id)).slice(0, 12);
  if (!replay?.topic || playerIds.length < 8) return null;
  return {
    topic: normalizeTopicDraft(replay.topic),
    players,
    playerIds,
    teams: createDebateTeamsFromPlayers(players)
  };
}

function createDebateTeamsFromPlayers(players = []) {
  const sorted = [...players].sort((a, b) => {
    const sideOrder = { pro: 0, con: 1, judge: 2 };
    const sideDiff = (sideOrder[a.side] ?? 9) - (sideOrder[b.side] ?? 9);
    if (sideDiff !== 0) return sideDiff;
    return (Number(a.sideIndex) || 0) - (Number(b.sideIndex) || 0);
  });
  const proIds = uniquePlayerIds(sorted.filter((player) => player.side === 'pro').map((player) => player.id)).slice(0, 4);
  const conIds = uniquePlayerIds(sorted.filter((player) => player.side === 'con').map((player) => player.id)).slice(0, 4);
  const judgeIds = uniquePlayerIds(sorted.filter((player) => player.side === 'judge').map((player) => player.id));
  const proCaptain = sorted.find((player) => player.side === 'pro' && player.debateRole === 'captain');
  const conCaptain = sorted.find((player) => player.side === 'con' && player.debateRole === 'captain');
  return {
    proIds,
    conIds,
    judgeIds,
    proCaptainId: proIds.includes(Number(proCaptain?.id)) ? Number(proCaptain.id) : null,
    conCaptainId: conIds.includes(Number(conCaptain?.id)) ? Number(conCaptain.id) : null
  };
}

function hasDebateCaptains(players = []) {
  return players.some((player) => player.debateRole === 'captain');
}

function normalizeImportedDebateGame(raw, filename = 'imported-debate.json', libraryPlayers = []) {
  if (raw?.type === 'debate' && Array.isArray(raw.players) && (Array.isArray(raw.phases) || Array.isArray(raw.rounds))) {
    const players = raw.players.map((player) => ({
      ...player,
      avatar: getImportedAvatar(player) || player.avatar || ''
    }));
    return {
      ...raw,
      id: raw.id || `imported-debate-${Date.now()}`,
      mode: 'real',
      topic: normalizeTopicDraft(raw.topic),
      players,
      phases: Array.isArray(raw.phases) ? raw.phases : getPhasesFromImportedRounds(raw.rounds),
      createdAt: raw.createdAt || new Date().toISOString()
    };
  }
  if (raw?.type !== 'ai_debate_match' || !Array.isArray(raw.segments)) {
    throw new Error('暂不支持此文件格式，请导入 ai_debate_match 或项目导出的 debate JSON。');
  }

  const topic = {
    title: raw.metadata?.topic || raw.metadata?.title || '导入 AI 辩论赛',
    proPosition: raw.positions?.affirmative || raw.teams?.affirmative?.position || '正方立场',
    conPosition: raw.positions?.negative || raw.teams?.negative?.position || '反方立场'
  };
  const { players, externalToInternalId, nameToInternalId } = createImportedPlayers(raw, libraryPlayers);
  const result = extractImportedResult(raw, externalToInternalId, nameToInternalId);
  const phases = createImportedPhases(raw, externalToInternalId, players, result);
  const game = {
    id: `imported-debate-${Date.now()}`,
    type: 'debate',
    mode: 'real',
    importSource: filename,
    topic,
    players,
    phases,
    rounds: phases.map((phase, index) => ({ number: index + 1, phase: phase.id, title: phase.name, speeches: phase.speeches || [] })),
    winner: result.winner,
    winReason: result.winReason,
    mvp: result.mvpId ? publicImportedPlayer(players.find((player) => Number(player.id) === Number(result.mvpId))) : null,
    createdAt: new Date().toISOString()
  };
  game.shareReport = createImportedShareReport(game);
  return game;
}

function createImportedPlayers(raw, libraryPlayers = []) {
  const entries = [
    ...normalizeImportedTeamMembers(raw.teams?.affirmative?.members, 'pro'),
    ...normalizeImportedTeamMembers(raw.teams?.negative?.members, 'con'),
    ...normalizeImportedTeamMembers(raw.teams?.judges?.members, 'judge')
  ];
  const matcher = createPlayerLibraryMatcher(libraryPlayers);
  const seen = new Set();
  const players = [];
  const externalToInternalId = new Map();
  const nameToInternalId = new Map();
  const addPlayer = (entry) => {
    if (!entry.externalId || seen.has(entry.externalId)) return;
    seen.add(entry.externalId);
    const libraryPlayer = matcher.find(entry);
    const id = libraryPlayer?.id || getNextImportedPlayerId(players, libraryPlayers);
    const player = mergeImportedPlayer(libraryPlayer, entry, id);
    players.push(player);
    externalToInternalId.set(entry.externalId, id);
    nameToInternalId.set(normalizeImportedName(entry.externalId), id);
    nameToInternalId.set(normalizeImportedName(entry.name), id);
    nameToInternalId.set(normalizeImportedName(player.nickname), id);
    nameToInternalId.set(normalizeImportedName(player.name), id);
  };

  entries.forEach(addPlayer);

  Object.entries(raw.speakerMap || {}).forEach(([externalId, speaker]) => {
    if (externalToInternalId.has(externalId) || speaker?.side === 'neutral') return;
    const side = normalizeImportedSide(speaker?.side);
    if (side === 'host') return;
    addPlayer({
      externalId,
      name: speaker?.nickname || speaker?.name || externalId,
      nickname: speaker?.nickname || speaker?.name || externalId,
      avatar: getImportedAvatar(speaker),
      side,
      sideIndex: side === 'judge' ? null : players.filter((item) => item.side === side).length,
      role: speaker?.role || '',
      persona: ''
    });
  });

  raw.segments.flatMap(flattenImportedSegmentItems).forEach((item) => {
    const externalId = String(item.speakerId || item.judgeId || '');
    if (!externalId || externalId === 'host' || externalToInternalId.has(externalId) || players.length >= 12) return;
    const side = item.judgeId || item.scores ? 'judge' : normalizeImportedSide(item.side);
    if (side === 'host') return;
    addPlayer({
      externalId,
      name: item.nickname || item.name || externalId,
      nickname: item.nickname || item.name || externalId,
      avatar: getImportedAvatar(item),
      side,
      sideIndex: side === 'judge' ? null : players.filter((candidate) => candidate.side === side).length,
      role: '',
      persona: ''
    });
  });

  if (players.filter((player) => player.side === 'pro').length !== 4 || players.filter((player) => player.side === 'con').length !== 4) {
    throw new Error('?????????? 4 ???? 4 ??');
  }
  return { players, externalToInternalId, nameToInternalId };
}

function normalizeImportedTeamMembers(members = [], side) {
  if (!Array.isArray(members)) return [];
  return members.map((member, index) => ({
    externalId: String(member.id || `${side}-${index + 1}`),
    name: member.nickname || member.name || member.id || `${side}-${index + 1}`,
    nickname: member.nickname || member.name || member.id || `${side}-${index + 1}`,
    avatar: getImportedAvatar(member),
    role: member.role || '',
    persona: member.persona || '',
    side,
    sideIndex: side === 'judge' ? null : index,
    isCaptain: Boolean(member.isCaptain || member.captain || /captain|队长/i.test(String(member.role || '')))
  }));
}

function createPlayerLibraryMatcher(libraryPlayers = []) {
  const byId = new Map();
  const byName = new Map();
  libraryPlayers.forEach((player) => {
    byId.set(String(player.id), player);
    getPlayerMatchKeys(player).forEach((key) => {
      if (key && !byName.has(key)) byName.set(key, player);
    });
  });
  return {
    find(entry) {
      const idMatch = byId.get(String(entry.externalId || ''));
      if (idMatch) return idMatch;
      for (const key of getPlayerMatchKeys(entry)) {
        const match = byName.get(key);
        if (match) return match;
      }
      return null;
    }
  };
}

function getPlayerMatchKeys(value = {}) {
  return [
    value.nickname,
    value.name,
    value.externalId,
    value.id,
    getKnownPlayerAlias(value.nickname || value.name || value.externalId || value.id)
  ].map(normalizePlayerMatchKey).filter(Boolean);
}

function getKnownPlayerAlias(value) {
  const key = String(value || '').trim().toLowerCase();
  const aliases = {
    doubao: '豆包',
    yuanbao: '元宝',
    wenxin: '文心一言',
    spark: '讯飞星火',
    chatglm: '智谱清言',
    zhipu: '智谱清言',
    qianwen: '千问',
    deepseek: 'DeepSeek',
    chatgpt: 'ChatGPT',
    kimi: 'Kimi',
    grok: 'Grok',
    gemini: 'Gemini',
    claude: 'Claude'
  };
  return aliases[key] || '';
}

function normalizePlayerMatchKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·._-]+/g, '');
}

function mergeImportedPlayer(libraryPlayer, entry, id) {
  const sideLabel = entry.side === 'pro' ? '正方' : entry.side === 'con' ? '反方' : '评委席';
  const debateRole = entry.side === 'judge' ? 'judge' : entry.isCaptain ? 'captain' : 'debater';

  return {
    ...(libraryPlayer || {}),
    id,
    externalId: entry.externalId,
    name: libraryPlayer?.name || libraryPlayer?.nickname || entry.name,
    nickname: libraryPlayer?.nickname || libraryPlayer?.name || entry.nickname || entry.name,
    avatar: libraryPlayer?.avatar || entry.avatar || '',
    provider: libraryPlayer?.provider || 'imported',
    model: libraryPlayer?.model || 'imported-match',
    sex: libraryPlayer?.sex || '未知',
    personality: libraryPlayer?.personality || entry.persona || '',
    side: entry.side,
    sideIndex: entry.side === 'judge' ? null : entry.sideIndex,
    sideLabel,
    debateRole,
    debateRoleLabel: debateRole === 'judge' ? '评委' : debateRole === 'captain' ? '队长' : '选手',
    role: entry.side,
    roleLabel: entry.role || '',
    alive: true,
    excluded: false
  };
}

function getNextImportedPlayerId(players, libraryPlayers) {
  const used = new Set([
    ...players.map((player) => Number(player.id)),
    ...libraryPlayers.map((player) => Number(player.id)).filter(Number.isFinite)
  ]);
  let next = 1001;
  while (used.has(next)) next += 1;
  return next;
}

function createImportedPhases(raw, externalToInternalId, players, result) {
  const phases = [];
  raw.segments.forEach((segment) => {
    const phaseId = mapImportedPhaseId(segment.type || segment.id);
    if (!phaseId) return;
    const speeches = flattenImportedSegmentItems(segment)
      .map((item, index) => createImportedSpeech(item, phaseId, externalToInternalId, players, index))
      .filter(Boolean);
    if (!speeches.length && phaseId !== 'mvp') return;
    phases.push({
      id: phaseId,
      name: mapImportedPhaseName(phaseId, segment.title),
      summary: segment.title || mapImportedPhaseName(phaseId),
      speeches,
      votes: []
    });
  });

  const judgePhase = phases.find((phase) => phase.id === 'judges');
  const mvpVotes = extractImportedMvpVotes(raw, externalToInternalId, result.mvpId);
  if (mvpVotes.length) {
    const mvpPhase = {
      id: 'mvp',
      name: '最佳辩手评选',
      summary: '导入对局最佳辩手评选结果。',
      speeches: [],
      votes: mvpVotes
    };
    const insertAt = judgePhase ? phases.indexOf(judgePhase) + 1 : phases.length;
    phases.splice(insertAt, 0, mvpPhase);
  }
  return phases;
}

function flattenImportedSegmentItems(segment) {
  const direct = Array.isArray(segment.items) ? segment.items : [];
  const nested = Array.isArray(segment.rounds)
    ? segment.rounds.flatMap((round) => Array.isArray(round.items) ? round.items : [])
    : [];
  return [...direct, ...nested];
}

function createImportedSpeech(item, phaseId, externalToInternalId, players, index) {
  const speakerId = String(item.speakerId || item.judgeId || 'host');
  const playerId = externalToInternalId.get(speakerId) || speakerId;
  const player = players.find((candidate) => Number(candidate.id) === Number(playerId));
  const side = player?.side || normalizeImportedSide(item.side) || 'host';
  const text = String(item.text || '').trim();
  if (!text) return null;
  return {
    id: item.id || `${phaseId}-${index + 1}`,
    phaseId,
    kind: phaseId === 'judges' ? 'judge-review' : side === 'host' ? 'host' : phaseId,
    playerId,
    side,
    debateRole: player?.debateRole || (side === 'host' ? 'host' : 'debater'),
    speakerLabel: player ? getDebatePlayerLabel(players, player.id) : '主持人',
    text,
    targetId: null
  };
}

function extractImportedResult(raw, externalToInternalId, nameToInternalId) {
  const resultItem = raw.segments.flatMap(flattenImportedSegmentItems).find((item) => item.result)?.result || {};
  const winner = resultItem.winner === 'affirmative' ? 'pro' : resultItem.winner === 'negative' ? 'con' : resultItem.winner === 'draw' ? 'draw' : null;
  const mvpId = externalToInternalId.get(String(resultItem.bestDebater || '')) || nameToInternalId.get(normalizeImportedName(resultItem.bestDebater));
  const winReason = resultItem.winnerName || (winner === 'pro' ? '正方获得更高综合评分。' : winner === 'con' ? '反方获得更高综合评分。' : '');
  return { winner, mvpId, winReason };
}

function extractImportedMvpVotes(raw, externalToInternalId, fallbackMvpId) {
  const judgeItems = raw.segments
    .filter((segment) => mapImportedPhaseId(segment.type || segment.id) === 'judges')
    .flatMap(flattenImportedSegmentItems);
  const votes = judgeItems.map((item) => {
    const voterId = externalToInternalId.get(String(item.speakerId || item.judgeId || ''));
    const target = externalToInternalId.get(String(item.bestDebater || '')) || fallbackMvpId;
    if (!voterId || !target) return null;
    return { voterId, target, reason: String(item.text || '').slice(0, 80) };
  }).filter(Boolean);
  return votes.length ? votes : fallbackMvpId ? [{ voterId: 'host', target: fallbackMvpId, reason: '导入对局结果指定。' }] : [];
}

function extractImportedShareComments(phases) {
  const judgePhase = phases.find((phase) => phase.id === 'judges');
  return (judgePhase?.speeches || []).map((speech) => ({
    judgeId: speech.playerId,
    judgeName: speech.speakerLabel || '评委',
    text: String(speech.text || '').slice(0, 120)
  })).slice(0, 3);
}

function createImportedShareReport(game) {
  return {
    topic: game.topic.title,
    proPosition: game.topic.proPosition,
    conPosition: game.topic.conPosition,
    proLineup: game.players.filter((player) => player.side === 'pro'),
    conLineup: game.players.filter((player) => player.side === 'con'),
    judges: game.players.filter((player) => player.side === 'judge'),
    winner: game.winner,
    winnerLabel: game.winner === 'pro' ? '正方胜出' : game.winner === 'con' ? '反方胜出' : game.winner === 'draw' ? '双方平局' : '待公布',
    winReason: game.winReason,
    mvp: game.mvp,
    highlights: extractClientHighlights(game.phases, game.players),
    judgeComments: extractImportedShareComments(game.phases),
    generatedAt: game.createdAt
  };
}

function publicImportedPlayer(player) {
  return player ? { id: player.id, nickname: player.nickname, name: player.name, avatar: getPlayerAvatar(player), avatarUrl: getPlayerAvatar(player), side: player.side, sideLabel: player.sideLabel } : null;
}

function getImportedAvatar(value = {}) {
  const avatar = String(
    value.avatar ||
    value.avatarUrl ||
    value.avatarURL ||
    value.avatar_url ||
    value.image ||
    value.imageUrl ||
    value.icon ||
    ''
  ).trim();
  if (!avatar) return '';
  if (/^(https?:|data:|blob:|\/)/i.test(avatar)) return avatar;
  if (avatar.includes('/')) return avatar;
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(avatar)) return `/avatars/${avatar}`;
  return avatar;
}

function getPhasesFromImportedRounds(rounds = []) {
  if (!Array.isArray(rounds)) return [];
  return rounds.map((round, index) => ({
    id: round.phase || round.id || `round-${index + 1}`,
    name: round.title || round.name || `第 ${index + 1} 环节`,
    summary: round.summary || '',
    speeches: Array.isArray(round.speeches) ? round.speeches : [],
    votes: Array.isArray(round.votes) ? round.votes : []
  }));
}

function mapImportedPhaseId(value) {
  const type = String(value || '').toLowerCase();
  if (type.includes('opening_statement')) return 'opening';
  if (type === 'opening') return 'strategy';
  if (type.includes('crossfire')) return 'crossfire';
  if (type.includes('free')) return 'free';
  if (type.includes('closing')) return 'closing';
  if (type.includes('judge')) return 'judges';
  if (type.includes('result')) return 'postgame';
  return sanitizeImportedPhaseId(type);
}

function mapImportedPhaseName(phaseId, fallback = '') {
  const names = {
    strategy: '开场介绍',
    opening: '立论陈词',
    crossfire: '正反攻辩',
    free: '自由辩论',
    closing: '总结陈词',
    judges: '评委点评',
    mvp: '最佳辩手评选',
    postgame: '赛果公布'
  };
  return fallback || names[phaseId] || phaseId;
}

function normalizeImportedSide(value) {
  const side = String(value || '').toLowerCase();
  if (side === 'affirmative' || side === 'pro') return 'pro';
  if (side === 'negative' || side === 'con') return 'con';
  if (side === 'judge') return 'judge';
  return 'host';
}

function normalizeImportedName(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeImportedPhaseId(value) {
  const text = String(value || '').trim().toLowerCase();
  const safe = text
    .replace(/[^a-z0-9\u4e00-\u9fa5_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || `custom-phase-${Date.now()}`;
}

function createDefaultDebateTeams(playerIds = []) {
  return {
    proIds: [],
    conIds: [],
    judgeIds: [],
    proCaptainId: null,
    conCaptainId: null
  };
}

function normalizeDebateTeamDraft(value, playerIds = []) {
  const selectedIds = uniquePlayerIds(playerIds).slice(0, 12);
  if (!value) return createDefaultDebateTeams(selectedIds);
  const selectedSet = new Set(selectedIds);
  const proIds = normalizeDebateSlots(value?.proIds, 4, selectedSet);
  const proSet = new Set(proIds.filter(Boolean));
  const conIds = normalizeDebateSlots(value?.conIds, 4, selectedSet, proSet);
  const assigned = new Set([...proIds, ...conIds].filter(Boolean));
  const judgeCapacity = Math.max(0, selectedIds.length - 8);
  const judgeIds = normalizeDebateSlots(value?.judgeIds, judgeCapacity, selectedSet, assigned);
  const hasExplicitProCaptain = Object.prototype.hasOwnProperty.call(value || {}, 'proCaptainId');
  const hasExplicitConCaptain = Object.prototype.hasOwnProperty.call(value || {}, 'conCaptainId');
  const proCaptainId = hasExplicitProCaptain && value?.proCaptainId == null
    ? null
    : proIds.includes(Number(value?.proCaptainId))
      ? Number(value.proCaptainId)
      : hasExplicitProCaptain ? null : proIds[0] || null;
  const conCaptainId = hasExplicitConCaptain && value?.conCaptainId == null
    ? null
    : conIds.includes(Number(value?.conCaptainId))
      ? Number(value.conCaptainId)
      : hasExplicitConCaptain ? null : conIds[0] || null;
  return {
    proIds,
    conIds,
    judgeIds,
    proCaptainId,
    conCaptainId
  };
}

function normalizeDebateSlots(ids = [], size = 0, selectedSet = new Set(), usedSet = new Set()) {
  const used = new Set(usedSet);
  return Array.from({ length: size }).map((_, index) => {
    const id = Number(ids[index]);
    if (!id || !selectedSet.has(id) || used.has(id)) return null;
    used.add(id);
    return id;
  });
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
