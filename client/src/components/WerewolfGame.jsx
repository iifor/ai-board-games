import React, { useEffect, useState } from 'react';
import { fetchAiPlayers, fetchWerewolfModes } from '../api/gameApi';
import { useSpeechQueue } from '../hooks/useSpeechQueue';
import { useGameSocketSession } from '../hooks/useGameSocketSession';
import { WerewolfArena, WerewolfControls, WerewolfPlayerDetailModal, WerewolfModeDialog } from '../features/werewolf/components/WerewolfGameSections';
import {
  buildEventLogEntry,
  getWerewolfModePlayerCount,
  getWerewolfNarration,
  normalizeWerewolfHostId,
  normalizeWerewolfSelectedIds,
  sanitizeWerewolfSelectedIds,
  sortPlayersById,
  toggleWerewolfPlayerId
} from '../features/werewolf/werewolfUtils';
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
    if (!replayGameId || (!werewolfMode && !replayGameId)) return;
    startGame(werewolfMode, [], selectedHostId, { replayGameId });
  }, [replayGameId, werewolfMode?.id]);

  const displayGame = game || EMPTY_WEREWOLF;
  const currentRound = displayGame.rounds?.at(-1) || null;
  const currentSpeakerId = activeSpeech?.playerId || null;
  const {
    autoPlay,
    isReplayMode,
    startSession,
    closeSession,
    resetSessionRefs,
    setAutoPlayEnabled,
    skipCurrentReplayPhase
  } = useGameSocketSession({
    gameType: 'werewolf',
    speechEnabled,
    speak,
    cancel,
    applyServerEvent,
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
    getAckDelay: (event) => event.type === 'speech' ? 280 : 120,
    onError: (error) => {
      setStatus('error');
      setStreamMessage(error.message || '狼人杀生成失败');
    },
    onAcknowledge: () => setActiveSpeech(null),
    onSkipPhase: () => {
      setActiveSpeech(null);
      setStreamMessage('正在跳过当前阶段...');
    }
  });
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
    closeSession();
    cancel();
    resetSessionRefs();
    setGame(EMPTY_WEREWOLF);
    setMessageLog([]);
    setEventLog([]);
    setActiveSpeech(null);
    setSelectedPlayer(null);
    setVisibleRolePlayerId(null);
    setStatus('idle');
    setSelectedHostId('default');
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
    setStreamMessage('游戏准备中...');
    startSession({
      mode: 'real',
      playerIds: sortedPlayerIds,
      hostId: normalizeWerewolfHostId(hostId),
      werewolfMode: modeConfig,
      replayGameId: options.replayGameId || ''
    });
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

  function handleAutoPlayChange(value) {
    setAutoPlayEnabled(value);
  }

  function returnToSelect() {
    closeSession();
    cancel();
    resetSessionRefs();
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
        <WerewolfPlayerDetailModal
          player={selectedPlayer}
          roleVisible={showRoles || Number(selectedPlayer.id) === Number(visibleRolePlayerId)}
          onClose={() => setSelectedPlayer(null)}
        />
      )}
    </main>
  );
}
