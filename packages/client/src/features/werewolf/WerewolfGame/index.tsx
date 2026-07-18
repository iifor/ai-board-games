import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSpeechQueue } from '../../../hooks/useSpeechQueue';
import { useGameSocketSession } from '../../../hooks/useGameSocketSession';
import { WerewolfArena } from '../components/WerewolfArena';
import { WerewolfControls } from '../components/WerewolfControls';
import { ThinkingModal } from '../../../components/common/ThinkingModal';
import { WerewolfPlayerDetailModal } from '../components/WerewolfPlayerDetailModal';
import { WerewolfModeDialog } from '../components/WerewolfModeDialog';
import bgWerewolf from '../../../asserts/werewolf.png';
import { EMPTY_WEREWOLF } from '../constants';
import { useWerewolfSpeechPlayback } from '../hooks/useWerewolfSpeechPlayback';
import { useWerewolfSetup } from '../hooks/useWerewolfSetup';
import { resolveAudienceCue, type AudienceCueResolution } from '../utils/audienceCue';
import { EMPTY_WEREWOLF_PRESENTATION, reduceWerewolfPresentation } from '../utils/presentationProjection';
import { classNames } from '../../../utils/classNames';
import {
  buildEventLogEntry,
  getNightActionPlayerIds,
  getWerewolfModePlayerCount,
  getWerewolfFlowLabel,
  getWerewolfNarration,
  getWerewolfDisplayText,
  formatWerewolfSeatLabel,
  sanitizeWerewolfSelectedIds,
  mergeWerewolfEventIntoGame
} from '../utils';
import type { GameState, GameEvent, GameStatus, Player, WerewolfMode, WerewolfRound, EventLogEntry, SpeechState } from '../../../types';
import './index.css';

interface WerewolfGameProps {
  replayGameId?: string;
  onReturnToSelect: () => void;
  variant?: 'classic' | 'v2';
  renderArena?: (props: WerewolfGameArenaProps) => ReactNode;
}

export interface WerewolfGameArenaProps {
  game: GameState;
  mode: WerewolfMode | null;
  currentRound: WerewolfRound | null;
  currentSpeakerId: string | null;
  nightActionPlayerIds: number[];
  nightActionType: string;
  seerCheckTarget: string | null;
  sheriffCandidateIds: number[];
  hunterShotFromId: number | null;
  activeSpeech: SpeechState | null;
  eventLog: EventLogEntry[];
  showRoles: boolean;
  visibleRolePlayerId: string | number | null;
  streamMessage: string;
  clientViewMode: 'god' | 'player';
  activeEvent: GameEvent | null;
  onShowRolesChange: (value: boolean | ((prev: boolean) => boolean)) => void;
  onPlayerSelect: (player: Player | null) => void;
}

interface ActiveThinking {
  player: Player | null;
  thinking: string;
}

export function WerewolfGame({ replayGameId = '', onReturnToSelect, variant = 'classic', renderArena }: WerewolfGameProps) {
  const [game, setGame] = useState<GameState>(EMPTY_WEREWOLF);
  const [status, setStatus] = useState<GameStatus>('idle');
  const [streamMessage, setStreamMessage] = useState('等待开局');
  const [eventLog, setEventLog] = useState<EventLogEntry[]>([]);
  const [activeEvent, setActiveEvent] = useState<GameEvent | null>(null);
  const [activeSpeech, setActiveSpeech] = useState<SpeechState | null>(null);
  const [activeThinking, setActiveThinking] = useState<ActiveThinking | null>(null);
  const [activeAudienceCue, setActiveAudienceCue] = useState<AudienceCueResolution | null>(null);
  const [presentation, setPresentation] = useState(EMPTY_WEREWOLF_PRESENTATION);
  const [sheriffCandidateIds, setSheriffCandidateIds] = useState<number[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const {
    modeDialogOpen, setModeDialogOpen,
    werewolfModes,
    werewolfMode, setWerewolfMode,
    availablePlayers,
    selectedPlayerIds, setSelectedPlayerIds,
    clientViewMode, setClientViewMode,
    debugMode, setDebugMode,
    setupError, setSetupError,
    selectedHostId, setSelectedHostId,
    loadError,
    openDialog,
    selectMode,
    togglePlayer,
  } = useWerewolfSetup();
  const [visibleRolePlayerId, setVisibleRolePlayerId] = useState<string | number | null>(null);
  const [showRoles, setShowRoles] = useState(true);
  const speechPlaybackRef = useRef<ReturnType<typeof useWerewolfSpeechPlayback> | null>(null);
  const replayStartedRef = useRef('');
  const handledAudienceCueKindsRef = useRef<Set<string>>(new Set());
  const { speechEnabled, speak, cancel, unlock } = useSpeechQueue();

  useEffect(() => {
    if (loadError) setStreamMessage(loadError);
  }, [loadError]);

  useEffect(() => {
    if (!replayGameId || replayStartedRef.current === replayGameId) return;
    replayStartedRef.current = replayGameId;
    startGame(werewolfMode, [], { replayGameId } as unknown as string);
  }, [replayGameId]);

  const displayGame = game || EMPTY_WEREWOLF;
  const currentRound = displayGame.rounds?.[displayGame.rounds.length - 1] || null;
  const currentSpeakerId = activeSpeech?.playerId || null;
  const { nightActionType, nightActionActorIds, seerCheckTarget, hunterShotFromId } = presentation;
  const nightActionPlayerIds = nightActionActorIds.length ? nightActionActorIds : getNightActionPlayerIds(nightActionType, (displayGame.players || []) as Player[]);
  const {
    autoPlay,
    isReplayMode,
    startSession,
    closeSession,
    resetSessionRefs,
    setAutoPlayEnabled,
    skipCurrentReplayPhase,
    clearPendingAckTimer
  } = useGameSocketSession({
    gameType: 'werewolf',
    speechEnabled,
    speak,
    cancel,
    applyServerEvent,
    playPendingEvent: (event, controls) => speechPlaybackRef.current?.playPendingWerewolfEvent(event, controls) || false,
    getNarration: (event: GameEvent) => {
      if (event.presentation?.suppressSpeech) return '';
      return event.presentation?.speakableText || event.subtitle?.text || event.narration || getWerewolfNarration(event);
    },
    getSpeechOptions: (event: GameEvent) => {
      const eventDebugMode = Boolean(event.debugMode || event.game?.debugMode || displayGame.debugMode);
      const speakerId = event?.speech?.playerId || event?.testimony?.playerId;
      const speechPlayer = speakerId
        ? (displayGame.players || []).find((player: Player) => Number(player.id) === Number(speakerId))
        : null;
      const hostVoicePackageId = (event.game as Record<string, unknown> | undefined)?.host
        ? ((event.game as Record<string, unknown>).host as Record<string, unknown>).voicePackageId as number | undefined
        : undefined;
      return speakerId
        ? { playerId: speakerId, voicePackageId: eventDebugMode ? null : speechPlayer?.voicePackageId, audioUrl: eventDebugMode ? undefined : event.audioUrl }
        : { voicePackageId: eventDebugMode ? null : hostVoicePackageId, audioUrl: eventDebugMode ? undefined : event.audioUrl };
    },
    getAckDelay: (event: GameEvent) => event.type === 'speech' || event.type === 'wolf-speech' || event.type === 'self-destruct' ? 280 : 120,
    onError: (error: Error | GameEvent) => {
      setStatus('error');
      setStreamMessage((error as Error).message || (error as GameEvent).message || '狼人杀生成失败');
    },
    onAcknowledge: () => {
      setActiveSpeech(null);
      setActiveAudienceCue(null);
    },
    onAutoPlayStopped: () => {},
    onSkipPhase: () => {
      clearSubtitleTimer();
      setActiveSpeech(null);
      setStreamMessage('正在跳过当前阶段...');
    }
  });
  const speechPlayback = useWerewolfSpeechPlayback({
    game: displayGame,
    speechEnabled,
    speak,
    setActiveSpeech
  });
  speechPlaybackRef.current = speechPlayback;
  const { clearSubtitleTimer } = speechPlayback;
  const isRunning = status === 'streaming';
  const hasStarted = status !== 'idle' || Boolean(displayGame.rounds?.length);
  const canStartNextGame = !isRunning || !autoPlay;

  useEffect(() => {
    if (!displayGame.players?.length) {
      setVisibleRolePlayerId(null);
      return;
    }
    setVisibleRolePlayerId((value) => {
      if (value && displayGame.players!.some((player: Player) => Number(player.id) === Number(value))) return value;
      const index = Math.floor(Math.random() * displayGame.players!.length);
      return displayGame.players![index]?.id || null;
    });
  }, [displayGame.id, displayGame.players?.length]);

  function resetToIdle(message?: string): void {
    closeSession();
    cancel();
    resetSessionRefs();
    handledAudienceCueKindsRef.current.clear();
    clearSubtitleTimer();
    setGame(EMPTY_WEREWOLF);
    setEventLog([]);
    setActiveEvent(null);
    setActiveSpeech(null);
    setActiveThinking(null);
    setActiveAudienceCue(null);
    setPresentation(EMPTY_WEREWOLF_PRESENTATION);
    setSheriffCandidateIds([]);
    setSelectedPlayer(null);
    setVisibleRolePlayerId(null);
    setStatus('idle');
    setStreamMessage(message || 'AI 游戏准备');
  }

  function requestStartGame(): void {
    if (!canStartNextGame) return;
    if (status === 'error') setStatus('idle');
    openDialog();
  }

  function startGame(modeConfig: WerewolfMode | null = werewolfMode, playerIds: number[] = selectedPlayerIds, viewMode?: string | Record<string, unknown>, options: Record<string, unknown> = {}): void {
    unlock(); // 利用用户点击手势解锁浏览器语音合成
    if (viewMode && typeof viewMode === 'object') {
      options = viewMode;
      viewMode = clientViewMode;
    }
    const hostId = (options.hostId as number | null) ?? selectedHostId;
    const nextDebugMode = Boolean(options.debugMode ?? debugMode);
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
    setClientViewMode(viewMode === 'player' ? 'player' : 'god');
    setDebugMode(nextDebugMode);
    setModeDialogOpen(false);
    setStatus('streaming');
    setStreamMessage('游戏准备中...');
    startSession({
      playerIds: sortedPlayerIds,
      hostId: hostId || undefined,
      werewolfMode: modeConfig?.id || '',
      clientViewMode: viewMode === 'player' ? 'player' : 'god',
      debugMode: nextDebugMode,
      replayGameId: (options.replayGameId as string) || ''
    });
  }

  function applyServerEvent(event: GameEvent): void {
    setActiveEvent(event);
    handleAudienceCue(event);
    const displayEvent = event.type === 'workflow-event' ? resolveWorkflowDisplayEvent(event) : event;
    applyPresentationEvent(displayEvent);
    if (event.type === 'workflow-event') {
      const displayText = getWerewolfDisplayText(event);
      const flowLabel = getWerewolfFlowLabel(displayEvent);
      if (displayText || flowLabel) setStreamMessage(displayText || flowLabel || '');
      applyGameEventState(event);
      updateWorkflowSpeech(event);
      archiveServerEvent(event);
      return;
    }
    if (status === 'error') setStatus('streaming');
    updateSheriffCandidateIds(event);
    const flowLabel = getWerewolfFlowLabel(event);
    const displayText = getWerewolfDisplayText(event);
    if (flowLabel || displayText) setStreamMessage(flowLabel || displayText || '');
    applyGameEventState(event);
    if (event.game) {
      if (event.game.clientViewMode) setClientViewMode(event.game.clientViewMode as string);
      if (event.game.debugMode != null) setDebugMode(Boolean(event.game.debugMode));
      if (event.game.audienceSession?.viewerPlayerId) setVisibleRolePlayerId(event.game.audienceSession.viewerPlayerId);
    }
    archiveServerEvent(event);

    if (event.type === 'thinking') {
      setActiveAudienceCue(null);
      const thinkingPlayer = (event.game?.players || []).find((p: Player) => Number(p.id) === Number(event.playerId)) || null;
      setActiveThinking({ player: thinkingPlayer, thinking: (event.thinking as string) || '' });
      return;
    }

    if ((event.type === 'speech' || event.type === 'wolf-speech' || event.type === 'self-destruct' || event.type === 'sheriff-speech' || event.type === 'sheriff-runoff-speech') && event.speech) {
      setActiveThinking(null);
      setActiveAudienceCue(null);
      const speakerLabel = formatWerewolfSeatLabel(event.speech.playerId, (event.game?.players || displayGame.players || []) as Player[]);
      setStreamMessage(
        event.type === 'wolf-speech'
          ? `${speakerLabel}狼队战术部署`
          : event.type === 'self-destruct'
            ? `${speakerLabel}狼人自爆`
            : event.actionType === 'postgame_speech'
              ? `${speakerLabel}发表赛后感言`
              : `${speakerLabel}正在发言`
      );
      setActiveSpeech({
        id: '',
        playerId: event.speech.playerId,
        text: event.subtitle?.text || event.speech.text,
        fullText: event.speech.fullText || event.speech.text,
        thinking: event.speech.thinking || '',
        wordBoundaries: event.wordBoundaries || null,
        currentTimeMs: null
      });
      return;
    }

    if ((event.type === 'last-words' || event.type === 'exile-words') && event.testimony) {
      setActiveThinking(null);
      setActiveAudienceCue(null);
      const speakerLabel = formatWerewolfSeatLabel(event.testimony.playerId, (event.game?.players || displayGame.players || []) as Player[]);
      setStreamMessage(`${speakerLabel}遗言`);
      setActiveSpeech({
        id: '',
        playerId: event.testimony.playerId,
        text: event.subtitle?.text || event.testimony.text,
        fullText: event.testimony.fullText || event.testimony.text,
        thinking: event.testimony.thinking || '',
        wordBoundaries: event.wordBoundaries || null,
        currentTimeMs: null
      });
      return;
    }

    const subtitleText = event.presentation?.suppressSpeech ? '' : event.subtitle?.text || event.narration || getWerewolfNarration(event);
    if (subtitleText && event.type !== 'game') {
      setActiveSpeech({ id: '', playerId: null, text: subtitleText, wordBoundaries: event.wordBoundaries || null, currentTimeMs: null });
    }
    if (event.type === 'workflow-completed' || event.type === 'done') {
      setStatus('ready');
      setActiveSpeech(null);
      setStreamMessage(event.message || '狼人杀已完成。');
    }
  }

  function handleAudienceCue(event: GameEvent): void {
    const cue = resolveAudienceCue(event);
    if (!cue) return;
    if (cue.once && handledAudienceCueKindsRef.current.has(cue.kind)) return;
    if (cue.once) handledAudienceCueKindsRef.current.add(cue.kind);
    if (cue.display === 'modal') {
      setActiveThinking(null);
      setActiveAudienceCue(cue);
    }
  }

  function applyPresentationEvent(event: GameEvent): void {
    setPresentation((state) => reduceWerewolfPresentation(state, event));
    const hunterShotFromId = event.type === 'hunter-shot' || event.actionType === 'hunter_shot'
      ? Number(event.shot?.from) || null
      : null;
    if (!hunterShotFromId) return;
    new Audio('/resources/public/gun.wav').play().catch(() => {});
    setTimeout(() => setPresentation((state) => state.hunterShotFromId === hunterShotFromId
      ? { ...state, hunterShotFromId: null }
      : state), 3000);
  }

  function applyGameEventState(event: GameEvent): void {
    setGame((value) => mergeWerewolfEventIntoGame(value || EMPTY_WEREWOLF, event));
  }

  function resolveWorkflowDisplayEvent(event: GameEvent): GameEvent {
    const workflowEvent = String(event.workflowEvent || '');
    const actionWindow = event.actionWindow as { actionType?: string } | undefined;
    const actionType = String(event.actionType || actionWindow?.actionType || '');
    const displayType = mapWorkflowEventType(workflowEvent) || mapNightActionType(actionType);
    return displayType ? { ...event, type: displayType } : event;
  }

  function mapWorkflowEventType(workflowEvent: string): string {
    if ([
      'wolf-wake',
      'wolf-leader',
      'wolf-vote',
      'escape-hunter-speech',
      'escape-hunter-vote',
      'escape-hunter-hunt',
      'thick-wolf-armor',
      'seer-wake',
      'seer-check',
      'guard-wake',
      'witch-antidote',
      'witch-poison',
      'witch-action',
      'last-words',
      'exile-words',
      'hunter-shot',
      'ghost-bride-link',
      'ghost-bride-chat',
      'ghost-bride-kill',
      'idiot-reveal',
      'vote-result',
    ].includes(workflowEvent)) {
      return workflowEvent;
    }
    return '';
  }

  function mapNightActionType(actionType: string): string {
    if (actionType === 'wolf_speech' || actionType === 'wolf_vote' || actionType === 'wolf_kill') return 'wolf-wake';
    if (actionType === 'escape_hunter_speech') return 'escape-hunter-speech';
    if (actionType === 'escape_hunter_vote') return 'escape-hunter-vote';
    if (actionType === 'seer_check') return 'seer-wake';
    if (actionType === 'guard_protect') return 'guard-wake';
    if (actionType === 'witch_save') return 'witch-antidote';
    if (actionType === 'witch_poison') return 'witch-poison';
    if (actionType === 'ghost_bride_link') return 'ghost-bride-link';
    if (actionType === 'ghost_bride_chat') return 'ghost-bride-chat';
    if (actionType === 'ghost_bride_kill') return 'ghost-bride-kill';
    if (actionType === 'hunter_shot') return 'hunter-shot';
    if (actionType === 'day_vote') return 'day-vote';
    if (actionType === 'day_speech') return 'day-speech';
    return '';
  }

  function updateWorkflowSpeech(event: GameEvent): void {
    if (!event.speech) return;
    // 优先读顶层 actionType（EventBus 路径），回退到 legacy event.payload 路径
    const actionType = String(event.actionType || '');
    const isWolfSpeech = actionType === 'wolf_speech' || actionType === 'wolf_kill';
    const isEscapeHunterSpeech = actionType === 'escape_hunter_speech';
    const isDaySpeech = actionType === 'day_speech' || actionType === 'postgame_speech';
    if (!isWolfSpeech && !isEscapeHunterSpeech && !isDaySpeech) return;

    setActiveThinking(null);
    const speakerLabel = formatWerewolfSeatLabel(event.speech.playerId, (event.game?.players || displayGame.players || []) as Player[]);
    if (isWolfSpeech) {
      setStreamMessage(`${speakerLabel} 狼队战术部署`);
    } else if (isEscapeHunterSpeech) {
      setStreamMessage(`${speakerLabel} 猎人夜间商议`);
    } else if (actionType === 'postgame_speech') {
      setStreamMessage(`${speakerLabel} 发表赛后感言`);
    } else if (isDaySpeech) {
      setStreamMessage(`${speakerLabel} 发言中`);
    }
    setActiveSpeech({
      id: '',
      playerId: event.speech.playerId,
      text: event.subtitle?.text || event.speech.text,
      fullText: event.speech.fullText || event.speech.text,
      thinking: event.speech.thinking || '',
      wordBoundaries: event.wordBoundaries || null,
      currentTimeMs: null
    });
  }

  function updateSheriffCandidateIds(event: GameEvent): void {
    if (event.type === 'sheriff-result' || event.type === 'night-result' || event.type === 'done' || event.type === 'game') {
      setSheriffCandidateIds([]);
      return;
    }
    if (!['sheriff-start', 'sheriff-speech', 'sheriff-candidates', 'sheriff-vote', 'sheriff-runoff-speech', 'sheriff-runoff-vote'].includes(event.type)) return;
    const election = event.round?.sheriffElection;
    const ids = event.sheriffCandidateIds?.length
      ? event.sheriffCandidateIds
      : election?.signedUpIds?.length ? election.signedUpIds : election?.candidates || [];
    setSheriffCandidateIds(ids.map(Number).filter(Boolean));
  }

  function archiveServerEvent(event: GameEvent): void {
    if (!event || event.type === 'done') return;
    const entry = buildEventLogEntry(event);
    if (entry) setEventLog((items) => [...items, entry].slice(-80));
  }

  function handleAutoPlayChange(value: boolean): void {
    setAutoPlayEnabled(value);
  }

  function returnToSelect(): void {
    closeSession();
    cancel();
    clearPendingAckTimer();
    clearSubtitleTimer();
    resetSessionRefs();
    onReturnToSelect();
  }

  const arenaProps: WerewolfGameArenaProps = {
    game: displayGame,
    mode: werewolfMode,
    currentRound,
    currentSpeakerId,
    nightActionPlayerIds,
    nightActionType,
    seerCheckTarget,
    sheriffCandidateIds,
    hunterShotFromId,
    activeSpeech,
    eventLog,
    showRoles,
    visibleRolePlayerId,
    streamMessage,
    clientViewMode: clientViewMode === 'player' ? 'player' : 'god',
    activeEvent,
    onShowRolesChange: setShowRoles,
    onPlayerSelect: setSelectedPlayer
  };

  return (
    <main className={classNames('game-shell werewolf-shell real-mode', variant === 'v2' && 'werewolf-shell--v2', variant === 'v2' && `werewolf-shell--${clientViewMode === 'player' ? 'player' : 'god'}`)} style={{ '--bg-werewolf': `url(${bgWerewolf})` } as React.CSSProperties}>
      <WerewolfControls
        variant={variant}
        autoPlay={autoPlay}
        startDisabled={!canStartNextGame}
        playbackDisabled={status === 'idle' && !displayGame.rounds?.length}
        showSkip={isReplayMode}
        skipDisabled={!isReplayMode || !hasStarted}
        skipActive={isReplayMode && hasStarted}
        onReturn={returnToSelect}
        setAutoPlay={handleAutoPlayChange}
        onStart={requestStartGame}
        onSkipPhase={skipCurrentReplayPhase}
      />

      {status === 'idle' && variant !== 'v2' ? (
        <section className="werewolf-idle-stage" aria-label="狼人杀等待开局">
          <div className="werewolf-idle-brand">
            <p>狼人杀</p>
            <span>{werewolfMode?.name || '标准局'}</span>
          </div>
          <div className="game-idle-loading" aria-live="polite">
            <span aria-hidden="true" />
            <strong>{streamMessage || '等待开局'}</strong>
          </div>
        </section>
      ) : renderArena ? (
        renderArena(arenaProps)
      ) : (
        <WerewolfArena
          game={arenaProps.game}
          mode={arenaProps.mode}
          currentRound={arenaProps.currentRound}
          currentSpeakerId={arenaProps.currentSpeakerId}
          nightActionPlayerIds={arenaProps.nightActionPlayerIds}
          nightActionType={arenaProps.nightActionType}
          seerCheckTarget={arenaProps.seerCheckTarget}
          sheriffCandidateIds={arenaProps.sheriffCandidateIds}
          hunterShotFromId={arenaProps.hunterShotFromId}
          activeSpeech={arenaProps.activeSpeech}
          showRoles={arenaProps.showRoles}
          visibleRolePlayerId={arenaProps.visibleRolePlayerId}
          streamMessage={arenaProps.streamMessage}
          onShowRolesChange={arenaProps.onShowRolesChange}
          onPlayerSelect={arenaProps.onPlayerSelect}
        />
      )}

      {status === 'error' && streamMessage && !modeDialogOpen && <p className="werewolf-error">{streamMessage}</p>}

      {modeDialogOpen && (
        <WerewolfModeDialog
          compact={variant === 'v2'}
          modes={werewolfModes}
          selectedMode={werewolfMode}
          onSelect={selectMode}
          onCancel={() => setModeDialogOpen(false)}
          players={availablePlayers}
          selectedPlayerIds={selectedPlayerIds}
          viewMode={clientViewMode}
          onViewModeChange={setClientViewMode}
          debugMode={debugMode}
          onDebugModeChange={setDebugMode}
          onPlayerToggle={togglePlayer}
          hostId={selectedHostId}
          onHostChange={(id: number | null) => setSelectedHostId(id ?? null)}
          error={setupError}
          onStart={(mode: WerewolfMode, playerIds: number[], viewMode: string, opts: { hostId?: number | null; debugMode?: boolean }) => startGame(mode, playerIds, viewMode, opts)}
        />
      )}

      {selectedPlayer && (
        <WerewolfPlayerDetailModal
          player={selectedPlayer}
          roleVisible={(clientViewMode === 'god' && showRoles) || Number(selectedPlayer.id) === Number(visibleRolePlayerId)}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <ThinkingModal visible={variant !== 'v2' && Boolean(activeThinking || activeAudienceCue)} player={activeThinking?.player || null} thinking={activeThinking?.thinking || activeAudienceCue?.text || ''} />
    </main>
  );
}
