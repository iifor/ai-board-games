import React, { useEffect, useRef, useState } from 'react';
import { fetchAiHealth } from '../../api/gameApi';
import { getPlayerAvatar, normalizeHostId } from '../../utils/player';
import { useSpeechQueue } from '../../hooks/useSpeechQueue';
import { useGameSocketSession } from '../../hooks/useGameSocketSession';
import { PlayerDetailModal } from '../../components/common/PlayerDetailModal';
import { SpeechInsightOverlay } from '../../components/SpeechInsightOverlay';
import { DebateArena } from './components/DebateArena';
import { DebateControls } from './components/DebateControls';
import { DebateTopicDialog } from './components/DebateTopicDialog';
import { DebateResultModal } from './components/DebateResultModal';
import {
  DEBATE_SUBTITLE_CONFIG,
  getSubtitleChunkDelay,
  getSubtitlePlaybackDelay,
  splitDebateSubtitle
} from './debateSubtitle';
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
} from './debateUtils';
import { EMPTY_DEBATE, DEFAULT_DEBATE_TOPIC } from './constants';
import '../../styles/debate-game.css';

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
      const itemQueued = speak(chunk, isLast ? acknowledgePending : undefined, {
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
    return speak(text, acknowledgePending, {
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
