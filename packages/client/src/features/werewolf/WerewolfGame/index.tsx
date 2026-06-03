import { useEffect, useRef, useState } from 'react';
import { fetchAiPlayers, fetchWerewolfModes } from '../../../services/gameService';
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
import { resolveAudienceCue, type AudienceCueResolution } from '../utils/audienceCue';
import {
  buildEventLogEntry,
  getNightActionPlayerIds,
  getWerewolfModePlayerCount,
  getWerewolfFlowLabel,
  getWerewolfNarration,
  getWerewolfDisplayText,
  formatWerewolfSeatLabel,
  normalizeWerewolfSelectedIds,
  sanitizeWerewolfSelectedIds,
  sortPlayersById,
  toggleWerewolfPlayerId,
  mergeWerewolfEventIntoGame
} from '../utils';
import type { GameState, GameEvent, GameStatus, Player, WerewolfMode, EventLogEntry, SpeechState } from '../../../types';
import './index.css';

interface WerewolfGameProps {
  replayGameId?: string;
  onReturnToSelect: () => void;
}

interface ActiveThinking {
  player: Player | null;
  thinking: string;
}

export function WerewolfGame({ replayGameId = '', onReturnToSelect }: WerewolfGameProps) {
  const [game, setGame] = useState<GameState>(EMPTY_WEREWOLF);
  const [status, setStatus] = useState<GameStatus>('idle');
  const [streamMessage, setStreamMessage] = useState('等待开局');
  const [, setEventLog] = useState<EventLogEntry[]>([]);
  const [activeSpeech, setActiveSpeech] = useState<SpeechState | null>(null);
  const [activeThinking, setActiveThinking] = useState<ActiveThinking | null>(null);
  const [activeAudienceCue, setActiveAudienceCue] = useState<AudienceCueResolution | null>(null);
  const [nightActionType, setNightActionType] = useState('');
  const [nightActionActorIds, setNightActionActorIds] = useState<number[]>([]);
  const [seerCheckTarget, setSeerCheckTarget] = useState<string | null>(null);
  const [sheriffCandidateIds, setSheriffCandidateIds] = useState<number[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [werewolfModes, setWerewolfModes] = useState<WerewolfMode[]>([]);
  const [werewolfMode, setWerewolfMode] = useState<WerewolfMode | null>(null);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState<number[]>([]);
  const [clientViewMode, setClientViewMode] = useState('god');
  const [debugMode, setDebugMode] = useState(false);
  const [setupError, setSetupError] = useState('');
  const [selectedHostId, setSelectedHostId] = useState<number | null>(null);
  const [visibleRolePlayerId, setVisibleRolePlayerId] = useState<string | number | null>(null);
  const [showRoles, setShowRoles] = useState(true);
  const speechPlaybackRef = useRef<ReturnType<typeof useWerewolfSpeechPlayback> | null>(null);
  const replayStartedRef = useRef('');
  const handledAudienceCueKindsRef = useRef<Set<string>>(new Set());
  const { speechEnabled, speak, cancel, unlock } = useSpeechQueue();

  useEffect(() => {
    fetchWerewolfModes()
      .then((modes: unknown) => {
        const enabledModes = Array.isArray(modes) ? modes as WerewolfMode[] : [];
        setWerewolfModes(enabledModes);
        setWerewolfMode((current) => current && enabledModes.some((mode) => mode.id === current.id) ? current : enabledModes[0] || null);
      })
      .catch((error: Error) => {
        setWerewolfModes([]);
        setWerewolfMode(null);
        setStreamMessage(error.message);
      });
  }, []);

  useEffect(() => {
    if (!modeDialogOpen) return;
    let cancelled = false;
    fetchAiPlayers()
      .then((players: unknown) => {
        if (cancelled) return;
        const sorted = sortPlayersById((players || []) as Player[]);
        setAvailablePlayers(sorted);
        setSelectedPlayerIds((current) => normalizeWerewolfSelectedIds(current, sorted, werewolfMode));
      })
      .catch((error: Error) => {
        if (cancelled) return;
        setAvailablePlayers([]);
        setSetupError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, [modeDialogOpen, werewolfMode?.id]);

  useEffect(() => {
    if (!replayGameId || replayStartedRef.current === replayGameId) return;
    replayStartedRef.current = replayGameId;
    startGame(werewolfMode, [], { replayGameId } as unknown as string);
  }, [replayGameId]);

  const displayGame = game || EMPTY_WEREWOLF;
  const currentRound = displayGame.rounds?.[displayGame.rounds.length - 1] || null;
  const currentSpeakerId = activeSpeech?.playerId || null;
  const nightActionPlayerIds = nightActionActorIds.length ? nightActionActorIds : getNightActionPlayerIds(nightActionType, (displayGame.players || []) as Player[]);
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
    gameType: 'werewolf',
    speechEnabled,
    speak,
    cancel,
    applyServerEvent,
    playPendingEvent: (event: GameEvent, controls: { setAckTimer: (delay: number) => void; clearPendingAckTimer: () => void }) => speechPlaybackRef.current?.playPendingWerewolfEvent(event, controls) || false,
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
    acknowledgePending,
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
    setActiveSpeech(null);
    setActiveThinking(null);
    setActiveAudienceCue(null);
    setNightActionType('');
    setNightActionActorIds([]);
    setSeerCheckTarget(null);
    setSheriffCandidateIds([]);
    setSelectedPlayer(null);
    setVisibleRolePlayerId(null);
    setStatus('idle');
    setStreamMessage(message || 'AI 游戏准备');
  }

  function requestStartGame(): void {
    if (!canStartNextGame) return;
    if (status === 'error') setStatus('idle');
    setSetupError('');
    setSelectedPlayerIds((current) => normalizeWerewolfSelectedIds(current, availablePlayers, werewolfMode));
    setModeDialogOpen(true);
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
    handleAudienceCue(event);
    if (event.type === 'workflow-event') {
      const displayEvent = resolveWorkflowDisplayEvent(event);
      const displayText = getWerewolfDisplayText(event);
      const flowLabel = getWerewolfFlowLabel(displayEvent);
      if (displayText || flowLabel) setStreamMessage(displayText || flowLabel || '');
      applyGameEventState(event);
      updateWorkflowNightAction(displayEvent);
      updateWorkflowSpeech(event);
      archiveServerEvent(event);
      return;
    }
    if (status === 'error') setStatus('streaming');
    updateNightActionType(event);
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
      setStreamMessage(event.type === 'wolf-speech' ? `${speakerLabel}狼队战术部署` : event.type === 'self-destruct' ? `${speakerLabel}狼人自爆` : `${speakerLabel}正在发言`);
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

  function updateNightActionType(event: GameEvent): void {
    if (event.type === 'phase-start' && event.phase === 'night') {
      setNightActionType('');
      setNightActionActorIds([]);
      setSeerCheckTarget(null);
      return;
    }
    if (event.type === 'seer-check') {
      setNightActionType(event.type);
      setSeerCheckTarget(event.seerCheck?.target || null);
      return;
    }
    if (event.type === 'witch-action') {
      setNightActionType((current) => current.includes('poison') ? 'witch-poison-action' : 'witch-antidote-action');
      setSeerCheckTarget(null);
      return;
    }
    if (['wolf-wake', 'wolf-leader', 'seer-wake', 'guard-wake', 'witch-antidote', 'witch-poison'].includes(event.type)) {
      setNightActionType(event.type);
      setNightActionActorIds([]);
      setSeerCheckTarget(null);
      return;
    }
    if (event.type === 'done' || event.type === 'game') {
      setNightActionType('');
      setNightActionActorIds([]);
      setSeerCheckTarget(null);
    }
  }

  function updateWorkflowNightAction(event: GameEvent): void {
    const actionWindow = event.actionWindow as { actionType?: string; actorIds?: Array<number | string> } | undefined;
    // 优先读顶层 actionType（EventBus 路径），回退到 legacy event.payload 路径
    const actionType = String(event.actionType || actionWindow?.actionType || '');
    const actorIds = (event.nightActionActorIds as number[] || actionWindow?.actorIds || []).map(Number).filter(Boolean);

    // 处理阶段事件
    const workflowEvent = String(event.workflowEvent || '');
    if (workflowEvent.startsWith('werewolf_phase_')) {
      mapActionTypeToNightAction(actionType, actorIds);
      return;
    }

    if (actionType === 'wolf_speech' || actionType === 'wolf_vote' || actionType === 'wolf_kill') {
      setNightActionType('wolf-wake');
      setNightActionActorIds(actorIds);
      setSeerCheckTarget(null);
      return;
    }
    if (actionType) {
      mapActionTypeToNightAction(actionType, actorIds);
    } else if (actionWindow) {
      setNightActionActorIds(actorIds);
    }
  }

  function mapActionTypeToNightAction(actionType: string, actorIds: number[]): void {
    if (actionType === 'wolf_speech' || actionType === 'wolf_vote' || actionType === 'wolf_kill') {
      setNightActionType('wolf-wake');
      setNightActionActorIds(actorIds);
      setSeerCheckTarget(null);
    } else if (actionType === 'seer_check') {
      setNightActionType('seer-wake');
      setNightActionActorIds(actorIds);
      setSeerCheckTarget(null);
    } else if (actionType === 'guard_protect') {
      setNightActionType('guard-wake');
      setNightActionActorIds(actorIds);
      setSeerCheckTarget(null);
    } else if (actionType === 'witch_save') {
      setNightActionType('witch-antidote');
      setNightActionActorIds(actorIds);
      setSeerCheckTarget(null);
    } else if (actionType === 'witch_poison') {
      setNightActionType('witch-poison');
      setNightActionActorIds(actorIds);
      setSeerCheckTarget(null);
    }
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
    if (['wolf-wake', 'wolf-leader', 'seer-wake', 'guard-wake', 'witch-antidote', 'witch-poison'].includes(workflowEvent)) {
      return workflowEvent;
    }
    return '';
  }

  function mapNightActionType(actionType: string): string {
    if (actionType === 'wolf_speech' || actionType === 'wolf_vote' || actionType === 'wolf_kill') return 'wolf-wake';
    if (actionType === 'seer_check') return 'seer-wake';
    if (actionType === 'guard_protect') return 'guard-wake';
    if (actionType === 'witch_save') return 'witch-antidote';
    if (actionType === 'witch_poison') return 'witch-poison';
    return '';
  }

  function updateWorkflowSpeech(event: GameEvent): void {
    if (!event.speech) return;
    // 优先读顶层 actionType（EventBus 路径），回退到 legacy event.payload 路径
    const actionType = String(event.actionType || '');
    const isWolfSpeech = actionType === 'wolf_speech' || actionType === 'wolf_kill';
    const isDaySpeech = actionType === 'day_speech';
    if (!isWolfSpeech && !isDaySpeech) return;

    setActiveThinking(null);
    const speakerLabel = formatWerewolfSeatLabel(event.speech.playerId, (event.game?.players || displayGame.players || []) as Player[]);
    if (isWolfSpeech) {
      setStreamMessage(`${speakerLabel} 狼队战术部署`);
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

  return (
    <main className="game-shell werewolf-shell real-mode" style={{ '--bg-werewolf': `url(${bgWerewolf})` } as React.CSSProperties}>
      <WerewolfControls
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

      {status === 'idle' ? (
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
      ) : (
        <WerewolfArena
          game={displayGame}
          mode={werewolfMode}
          currentRound={currentRound}
          currentSpeakerId={currentSpeakerId}
          nightActionPlayerIds={nightActionPlayerIds}
          nightActionType={nightActionType}
          seerCheckTarget={seerCheckTarget}
          sheriffCandidateIds={sheriffCandidateIds}
          activeSpeech={activeSpeech}
          showRoles={showRoles}
          visibleRolePlayerId={visibleRolePlayerId}
          streamMessage={streamMessage}
          onShowRolesChange={setShowRoles}
          onPlayerSelect={setSelectedPlayer}
        />
      )}

      {status === 'error' && streamMessage && !modeDialogOpen && <p className="werewolf-error">{streamMessage}</p>}

      {modeDialogOpen && (
        <WerewolfModeDialog
          modes={werewolfModes}
          selectedMode={werewolfMode}
          onSelect={(mode: WerewolfMode) => {
            setWerewolfMode(mode);
            setSetupError('');
            setSelectedPlayerIds((value) => normalizeWerewolfSelectedIds(value, availablePlayers, mode));
          }}
          onCancel={() => setModeDialogOpen(false)}
          players={availablePlayers}
          selectedPlayerIds={selectedPlayerIds}
          viewMode={clientViewMode}
          onViewModeChange={setClientViewMode}
          debugMode={debugMode}
          onDebugModeChange={setDebugMode}
          onPlayerToggle={(id: number | string) => setSelectedPlayerIds((value) => toggleWerewolfPlayerId(value, id, werewolfMode))}
          hostId={selectedHostId}
          onHostChange={(id: number | null) => setSelectedHostId(id ?? null)}
          error={setupError}
          onStart={(mode: WerewolfMode, playerIds: number[], viewMode: string, opts: { hostId?: number | null; debugMode?: boolean }) => startGame(mode, playerIds, viewMode, opts)}
        />
      )}

      {selectedPlayer && (
        <WerewolfPlayerDetailModal
          player={selectedPlayer}
          roleVisible={showRoles || Number(selectedPlayer.id) === Number(visibleRolePlayerId)}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <ThinkingModal visible={Boolean(activeThinking || activeAudienceCue)} player={activeThinking?.player || null} thinking={activeThinking?.thinking || activeAudienceCue?.text || ''} />
    </main>
  );
}
