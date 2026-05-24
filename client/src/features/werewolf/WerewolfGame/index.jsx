import React, { useEffect, useRef, useState } from 'react';
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
import {
  buildEventLogEntry,
  getNightActionPlayerIds,
  getWerewolfModePlayerCount,
  getWerewolfFlowLabel,
  getWerewolfNarration,
  formatWerewolfSeatLabel,
  normalizeWerewolfSelectedIds,
  sanitizeWerewolfSelectedIds,
  sortPlayersById,
  toggleWerewolfPlayerId
} from '../werewolfUtils';
import './index.css';


export function WerewolfGame({ replayGameId = '', onReturnToSelect }) {
  const [game, setGame] = useState(EMPTY_WEREWOLF);
  const [status, setStatus] = useState('idle');
  const [streamMessage, setStreamMessage] = useState('等待开局');
  const [eventLog, setEventLog] = useState([]);
  const [activeSpeech, setActiveSpeech] = useState(null);
  const [activeThinking, setActiveThinking] = useState(null);
  const [nightActionType, setNightActionType] = useState('');
  const [seerCheckTarget, setSeerCheckTarget] = useState(null);
  const [sheriffCandidateIds, setSheriffCandidateIds] = useState([]);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [modeDialogOpen, setModeDialogOpen] = useState(false);
  const [werewolfModes, setWerewolfModes] = useState([]);
  const [werewolfMode, setWerewolfMode] = useState(null);
  const [availablePlayers, setAvailablePlayers] = useState([]);
  const [selectedPlayerIds, setSelectedPlayerIds] = useState([]);
  const [clientViewMode, setClientViewMode] = useState('god');
  const [setupError, setSetupError] = useState('');
  const [selectedHostId, setSelectedHostId] = useState(null);
  const [visibleRolePlayerId, setVisibleRolePlayerId] = useState(null);
  const [showRoles, setShowRoles] = useState(true);
  const speechPlaybackRef = useRef(null);
  const replayStartedRef = useRef('');
  const { speechEnabled, speak, cancel } = useSpeechQueue();

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
    if (!replayGameId || replayStartedRef.current === replayGameId) return;
    replayStartedRef.current = replayGameId;
    startGame(werewolfMode, [], { replayGameId });
  }, [replayGameId]);

  const displayGame = game || EMPTY_WEREWOLF;
  const currentRound = displayGame.rounds?.at(-1) || null;
  const currentSpeakerId = activeSpeech?.playerId || null;
  const nightActionPlayerIds = getNightActionPlayerIds(nightActionType, displayGame.players || []);
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
    playPendingEvent: (event, controls) => speechPlaybackRef.current?.playPendingWerewolfEvent(event, controls) || false,
    getNarration: (event) => event.subtitle?.text || event.narration || getWerewolfNarration(event),
    getSpeechOptions: (event) => {
      const speakerId = event?.speech?.playerId || event?.testimony?.playerId;
      const speechPlayer = speakerId
        ? displayGame.players?.find((player) => Number(player.id) === Number(speakerId))
        : null;
      return speakerId
        ? { playerId: speakerId, voicePackageId: speechPlayer?.voicePackageId, audioUrl: event.audioUrl }
        : { voicePackageId: event.game?.host?.voicePackageId, audioUrl: event.audioUrl };
    },
    getAckDelay: (event) => event.type === 'speech' || event.type === 'wolf-speech' ? 280 : 120,
    onError: (error) => {
      setStatus('error');
      setStreamMessage(error.message || '狼人杀生成失败');
    },
    onAcknowledge: () => setActiveSpeech(null),
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
      if (value && displayGame.players.some((player) => Number(player.id) === Number(value))) return value;
      const index = Math.floor(Math.random() * displayGame.players.length);
      return displayGame.players[index]?.id || null;
    });
  }, [displayGame.id, displayGame.players?.length]);

  function resetToIdle(message) {
    closeSession();
    cancel();
    resetSessionRefs();
    clearSubtitleTimer();
    setGame(EMPTY_WEREWOLF);
    setEventLog([]);
    setActiveSpeech(null);
    setActiveThinking(null);
    setNightActionType('');
    setSeerCheckTarget(null);
    setSheriffCandidateIds([]);
    setSelectedPlayer(null);
    setVisibleRolePlayerId(null);
    setStatus('idle');
    setStreamMessage(message || 'AI 游戏准备');
  }

  function requestStartGame() {
    if (!canStartNextGame) return;
    if (status === 'error') setStatus('idle');
    setSetupError('');
    setSelectedPlayerIds((current) => normalizeWerewolfSelectedIds(current, availablePlayers, werewolfMode));
    setModeDialogOpen(true);
  }

  function startGame(modeConfig = werewolfMode, playerIds = selectedPlayerIds, viewMode = clientViewMode, options = {}) {
    if (viewMode && typeof viewMode === 'object') {
      options = viewMode;
      viewMode = clientViewMode;
    }
    const hostId = options.hostId ?? selectedHostId;
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
    setModeDialogOpen(false);
    setStatus('streaming');
    setStreamMessage('游戏准备中...');
    startSession({
      mode: 'real',
      playerIds: sortedPlayerIds,
      hostId: hostId || undefined,
      werewolfMode: modeConfig,
      clientViewMode: viewMode === 'player' ? 'player' : 'god',
      replayGameId: options.replayGameId || ''
    });
  }

  function applyServerEvent(event) {
    if (event.type === 'workflow-event') {
      if (event.message) setStreamMessage(event.message);
      if (event.game) setGame(event.game);
      archiveServerEvent(event);
      return;
    }
    if (status === 'error') setStatus('streaming');
    updateNightActionType(event);
    updateSheriffCandidateIds(event);
    const flowLabel = getWerewolfFlowLabel(event);
    if (flowLabel || event.message) setStreamMessage(flowLabel || event.message);
    if (event.game) {
      setGame(event.game);
      if (event.game.clientViewMode) setClientViewMode(event.game.clientViewMode);
      if (event.game.audienceSession?.viewerPlayerId) setVisibleRolePlayerId(event.game.audienceSession.viewerPlayerId);
    }
    if (event.players) {
      setGame((value) => ({
        ...(event.game || value || EMPTY_WEREWOLF),
        players: event.players
      }));
    }
    archiveServerEvent(event);

    if (event.type === 'thinking') {
      const thinkingPlayer = event.game?.players?.find((p) => Number(p.id) === Number(event.playerId)) || null;
      setActiveThinking({ player: thinkingPlayer, thinking: event.thinking || '' });
      return;
    }

    if ((event.type === 'speech' || event.type === 'wolf-speech' || event.type === 'sheriff-speech' || event.type === 'sheriff-runoff-speech') && event.speech) {
      setActiveThinking(null);
      const speakerLabel = formatWerewolfSeatLabel(event.speech.playerId, event.game?.players || displayGame.players || []);
      setStreamMessage(event.type === 'wolf-speech' ? `${speakerLabel}狼人夜聊` : `${speakerLabel}正在发言`);
      setActiveSpeech({
        playerId: event.speech.playerId,
        text: event.subtitle?.text || event.speech.text,
        fullText: event.speech.fullText || event.speech.text,
        thinking: event.speech.thinking || '',
        wordBoundaries: event.wordBoundaries || null
      });
      return;
    }

    if ((event.type === 'last-words' || event.type === 'exile-words') && event.testimony) {
      setActiveThinking(null);
      const speakerLabel = formatWerewolfSeatLabel(event.testimony.playerId, event.game?.players || displayGame.players || []);
      setStreamMessage(`${speakerLabel}遗言`);
      setActiveSpeech({
        playerId: event.testimony.playerId,
        text: event.subtitle?.text || event.testimony.text,
        fullText: event.testimony.fullText || event.testimony.text,
        thinking: event.testimony.thinking || '',
        wordBoundaries: event.wordBoundaries || null
      });
      return;
    }

    const subtitleText = event.subtitle?.text || event.narration || getWerewolfNarration(event) || event.message;
    if (subtitleText && event.type !== 'game') {
      setActiveSpeech({ playerId: null, text: subtitleText, wordBoundaries: event.wordBoundaries || null });
    }
    if (event.type === 'workflow-completed' || event.type === 'done') {
      setStatus('ready');
      setActiveSpeech(null);
      setStreamMessage(event.message || '狼人杀已完成。');
    }
  }

  function updateNightActionType(event) {
    if (event.type === 'phase-start' && event.phase === 'night') {
      setNightActionType('');
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
      setSeerCheckTarget(null);
      return;
    }
    if (event.type === 'done' || event.type === 'game') {
      setNightActionType('');
      setSeerCheckTarget(null);
    }
  }

  function updateSheriffCandidateIds(event) {
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

  function archiveServerEvent(event) {
    if (!event || event.type === 'done') return;
    const entry = buildEventLogEntry(event);
    if (entry) setEventLog((items) => [...items, entry].slice(-80));
  }

  function handleAutoPlayChange(value) {
    setAutoPlayEnabled(value);
  }

  function returnToSelect() {
    closeSession();
    cancel();
    clearPendingAckTimer();
    clearSubtitleTimer();
    resetSessionRefs();
    onReturnToSelect();
  }

  return (
    <main className="game-shell werewolf-shell real-mode" style={{ '--bg-werewolf': `url(${bgWerewolf})` }}>
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

      {status === 'idle' || !displayGame.rounds?.length ? (
        <section className="werewolf-idle-stage" aria-label="狼人杀等待开局">
          <div className="werewolf-idle-brand">
            <p>狼人杀<small className="werewolf-version">v2.0</small></p>
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
          onSelect={(mode) => {
            setWerewolfMode(mode);
            setSetupError('');
            setSelectedPlayerIds((value) => normalizeWerewolfSelectedIds(value, availablePlayers, mode));
          }}
          onCancel={() => setModeDialogOpen(false)}
          players={availablePlayers}
          selectedPlayerIds={selectedPlayerIds}
          viewMode={clientViewMode}
          onViewModeChange={setClientViewMode}
          onPlayerToggle={(id) => setSelectedPlayerIds((value) => toggleWerewolfPlayerId(value, id, werewolfMode))}
          hostId={selectedHostId}
          onHostChange={(id) => setSelectedHostId(id ?? null)}
          error={setupError}
          onStart={(mode, playerIds, viewMode, opts) => startGame(mode, playerIds, viewMode, opts)}
        />
      )}

      {selectedPlayer && (
        <WerewolfPlayerDetailModal
          player={selectedPlayer}
          roleVisible={showRoles || Number(selectedPlayer.id) === Number(visibleRolePlayerId)}
          onClose={() => setSelectedPlayer(null)}
        />
      )}

      <ThinkingModal visible={Boolean(activeThinking)} player={activeThinking?.player} thinking={activeThinking?.thinking || ''} />
    </main>
  );
}
