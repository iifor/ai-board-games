import React, { useEffect, useRef, useState } from 'react';
import { fetchAiHealth } from '../../../services/gameService';
import { useSpeechQueue } from '../../../hooks/useSpeechQueue';
import { useGameSocketSession } from '../../../hooks/useGameSocketSession';
import { PlayerDetailModal } from '../../../components/common/PlayerDetailModal';
import { DebateArena } from '../components/DebateArena';
import { DebateControls } from '../components/DebateControls';
import { ThinkingModal } from '../../../components/common/ThinkingModal';
import { DebateTopicDialog } from '../components/DebateTopicDialog';
import { DebateResultModal } from '../components/DebateResultModal';
import bgDebate from '../../../asserts/debate.png';
import { useDebateSpeechPlayback } from '../hooks/useDebateSpeechPlayback';
import {
  normalizeTopicDraft,
  normalizeDebateTeamDraft,
  uniquePlayerIds,
  createDebateTeamsFromPlayers,
  createDefaultDebateTeams,
  getDebateSpeakerLabel,
  getDebatePlayerLabel,
  getDebateIdentityDescription,
  getDebateNarration
} from '../utils';
import { EMPTY_DEBATE, DEFAULT_DEBATE_TOPIC } from '../constants';
import './index.css';
import type { GameState, GameEvent, GameStatus, SpeechState, Player, DebateTopic, DebateTeamDraft } from '../../../types';

interface DebateGameProps {
  replayGameId?: string;
  onReturnToSelect: () => void;
}

export function DebateGame({ replayGameId = '', onReturnToSelect }: DebateGameProps) {
  const [game, setGame] = useState<GameState>(EMPTY_DEBATE);
  const [status, setStatus] = useState<GameStatus>('idle');
  const [streamMessage, setStreamMessage] = useState('真实模式已就绪，点击开始后调用 AI。');
  const [activeSpeech, setActiveSpeech] = useState<{ playerId: string | null; text: string } | null>(null);
  const [subtitleSpeech, setSubtitleSpeech] = useState<SpeechState | null>(null);
  const [activeThinking, setActiveThinking] = useState<{ player: Player | null; thinking: string } | null>(null);
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);
  const [topicDialogOpen, setTopicDialogOpen] = useState(false);
  const [topicDraft, setTopicDraft] = useState<DebateTopic>(DEFAULT_DEBATE_TOPIC);
  const [availablePlayers, setAvailablePlayers] = useState<Player[]>([]);
  const [captainEnabled, setCaptainEnabled] = useState(true);
  const [debateTeamDraft, setDebateTeamDraft] = useState<DebateTeamDraft>(() => createDefaultDebateTeams([]));
  const [selectedHostId, setSelectedHostId] = useState<number | null>(null);
  const [resultModalOpen, setResultModalOpen] = useState(false);
  const speechPlaybackRef = useRef<ReturnType<typeof useDebateSpeechPlayback> | null>(null);
  const { speechEnabled, setSpeechEnabled, speak, unlock, cancel } = useSpeechQueue();

  useEffect(() => {
    if (!replayGameId) return;
    startGame(topicDraft, debateTeamDraft, { replayGameId });
  }, [replayGameId]);

  useEffect(() => {
    if (!topicDialogOpen) return;
    let cancelled = false;
    fetchAiHealth()
      .then((data) => {
        if (cancelled) return;
        setAvailablePlayers(data.players || []);
      })
      .catch(() => {
        if (!cancelled) setAvailablePlayers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [topicDialogOpen]);

  const displayGame = game || EMPTY_DEBATE;
  const phases = displayGame.phases;
  const currentPhase = phases?.length ? phases[phases.length - 1] : null;
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
    getNarration: getDebateNarration,
    getSpeechOptions: () => ({}),
    getAckDelay: () => 3000,
    playPendingEvent: (event, controls) => speechPlaybackRef.current?.playPendingDebateEvent(event, controls) || false,
    onError: (error) => {
      setStatus('error');
      setActiveThinking(null);
      setStreamMessage(error.message || '辩论赛生成失败');
    },
    onAcknowledge: () => {
      setActiveSpeech(null);
      if (status === 'streaming') setActiveThinking({ player: null, thinking: '' });
    },
    onAutoPlayStopped: () => {
      clearSubtitleTimer();
      setSubtitleSpeech(null);
      setActiveSpeech(null);
      setActiveThinking(null);
    },
    onSkipPhase: () => {
      clearSubtitleTimer();
      setActiveSpeech(null);
      setSubtitleSpeech(null);
      setActiveThinking({ player: null, thinking: '' });
      setStreamMessage('正在跳过当前阶段...');
    }
  });
  const speechPlayback = useDebateSpeechPlayback({
    game: displayGame,
    speechEnabled,
    speak,
    acknowledgePending,
    setActiveSpeech,
    setSubtitleSpeech
  });
  speechPlaybackRef.current = speechPlayback;
  const { clearSubtitleTimer, playSubtitleText } = speechPlayback;
  const isRunning = status === 'streaming';
  const hasStarted = status !== 'idle' || Boolean(displayGame.phases?.length);
  const canStartNextGame = !isRunning || !autoPlay;

  function resetToIdle(message: string): void {
    closeSession();
    cancel();
    resetSessionRefs();
    clearSubtitleTimer();
    setResultModalOpen(false);
    setGame(EMPTY_DEBATE);
    setActiveSpeech(null);
    setSubtitleSpeech(null);
    setActiveThinking(null);
    setStatus('idle');
    setStreamMessage(message || '真实模式已就绪，点击开始后调用 AI。');
  }

  function requestStartGame(): void {
    if (!canStartNextGame) return;
    setTopicDialogOpen(true);
  }

  function startGame(topic: DebateTopic = topicDraft, teams: DebateTeamDraft = debateTeamDraft, options: { replayGameId?: string; hostId?: number | null } = {}): void {
    resetToIdle('');
    if (speechEnabled) unlock();
    const hostId = options.hostId ?? selectedHostId;
    const nextTopic = normalizeTopicDraft(topic);
    const playerIdsForTeams = availablePlayers.map((player) => player.id);
    const normalizedTeamsForStart = normalizeDebateTeamDraft(teams, playerIdsForTeams);
    const effectiveCaptainEnabled = captainEnabled && Boolean(normalizedTeamsForStart.proCaptainId && normalizedTeamsForStart.conCaptainId);
    const nextTeams: DebateTeamDraft = {
      ...normalizedTeamsForStart,
      captainEnabled: effectiveCaptainEnabled,
      proCaptainId: effectiveCaptainEnabled ? normalizedTeamsForStart.proCaptainId : null,
      conCaptainId: effectiveCaptainEnabled ? normalizedTeamsForStart.conCaptainId : null
    };
    const assignedPlayerIds = uniquePlayerIds([...(nextTeams.proIds || []), ...(nextTeams.conIds || []), ...(nextTeams.judgeIds || [])]);
    const shouldSendTeams = assignedPlayerIds.length >= 8;
    setTopicDraft(nextTopic);
    setDebateTeamDraft(nextTeams);
    setTopicDialogOpen(false);
    setStatus('streaming');
    setActiveThinking({ player: null, thinking: '' });
    setStreamMessage('游戏准备中...');
    startSession({
      topic: nextTopic as unknown as Record<string, unknown>,
      hostId: hostId || undefined,
      debateTeams: shouldSendTeams ? (nextTeams as unknown as Record<string, unknown>) : null,
      replayGameId: options.replayGameId || ''
    });
  }

  function replayCurrentGame(): void {
    setResultModalOpen(false);
    if (!displayGame.id) return;
    startGame(displayGame.topic, createDebateTeamsFromPlayers(displayGame.players || []), { replayGameId: displayGame.id });
  }

  function openNextGameSettings(): void {
    setResultModalOpen(false);
    requestStartGame();
  }

  function applyServerEvent(event: GameEvent): void {
    if (event.type === 'workflow-event') {
      setActiveThinking(null);
      if (event.message) setStreamMessage(event.message);
      if (event.game) setGame(event.game);
      const phaseObj = typeof event.phase === 'object' ? event.phase : null;
      const phaseSpeeches = phaseObj?.speeches as Record<string, unknown>[] | undefined;
      const lastSpeech = phaseSpeeches?.length ? phaseSpeeches[phaseSpeeches.length - 1] : undefined;
      if (lastSpeech) {
        setActiveSpeech({ playerId: lastSpeech.playerId as string, text: lastSpeech.text as string });
        if (!speechEnabled) playSubtitleText(lastSpeech.text as string, lastSpeech.playerId as string, event.ackId, event);
      }
      return;
    }
    if (event.type === 'thinking') {
      const thinkingPlayer = event.game?.players?.find((p) => Number(p.id) === Number(event.playerId)) || null;
      setActiveThinking({ player: thinkingPlayer, thinking: event.thinking || '' });
      return;
    }
    setActiveThinking(null);
    if (event.message) setStreamMessage(event.message);
    if (event.game) setGame(event.game);
    if (event.players) setGame((value) => ({ ...(value || EMPTY_DEBATE), players: event.players }));
    if (event.type === 'speech' && event.speech) {
      const label = event.speech.side === 'host' ? '主持人' : getDebateSpeakerLabel(event.game?.players || displayGame.players || [], event.speech.playerId);
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
    if (event.type === 'workflow-completed') {
      setStatus('ready');
      setActiveThinking(null);
      setStreamMessage(event.message || '辩论赛已完成。');
      if (event.game?.winner || event.game?.mvp) setResultModalOpen(true);
    }
  }

  function handleAutoPlayChange(value: boolean): void {
    setAutoPlayEnabled(value);
  }

  function returnToSelect(): void {
    closeSession();
    cancel();
    clearPendingAckTimer();
    resetSessionRefs();
    onReturnToSelect();
  }

  return (
    <main className="game-shell debate-shell real-mode" style={{ '--bg-debate': `url(${bgDebate})` } as React.CSSProperties}>
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
        onPlayerSelect={setSelectedPlayer}
        isIdle={status === 'idle' || !displayGame.phases?.length}
      />

      <ThinkingModal visible={Boolean(activeThinking)} player={activeThinking?.player} thinking={activeThinking?.thinking || ''} />
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
          subtitle={getDebatePlayerLabel(displayGame.players || [], selectedPlayer.id)}
          fields={[
            { label: '性格', value: selectedPlayer.personality || '暂无' },
            { label: '本局身份', value: getDebatePlayerLabel(displayGame.players || [], selectedPlayer.id) },
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
          onTeamsChange={setDebateTeamDraft}
          captainEnabled={captainEnabled}
          onCaptainEnabledChange={setCaptainEnabled}
          speechEnabled={speechEnabled}
          onSpeechEnabledChange={(value) => {
            setSpeechEnabled(value);
            if (value) unlock();
          }}
          hostId={selectedHostId}
          onHostChange={(id) => setSelectedHostId(id ?? null)}
          onCancel={() => setTopicDialogOpen(false)}
          onStart={(topic, teams, opts) => startGame(topic, teams, opts)}
        />
      )}
    </main>
  );
}
