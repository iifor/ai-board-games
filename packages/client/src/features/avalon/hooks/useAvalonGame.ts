import { useEffect, useState } from 'react';
import type { AvalonPublicState } from '@ai-presenter/shared/types/avalon';
import { useGameSocketSession } from '../../../hooks/useGameSocketSession';
import { useSpeechQueue } from '../../../hooks/useSpeechQueue';
import type { GameEvent, QueueItem, SpeechState } from '../../../types';
import type { AvalonHost, AvalonStartOptions, AvalonViewState } from '../types';

const EMPTY_AVALON_VIEW_STATE: AvalonViewState = {
  game: null,
  host: null,
  activeSpeech: null,
  message: '已选择 5 位 AI 玩家，点击开始游戏。',
  error: '',
};

interface UseAvalonGameParams {
  playerIds: number[];
  replayGameId?: string;
  debugMode?: boolean;
}

function buildAvalonStartOptions(playerIds: number[], replayGameId: string, debugMode = false): AvalonStartOptions {
  if (replayGameId) return { replayGameId };
  const ids = playerIds.map(Number);
  if (
    ids.length !== 5
    || new Set(ids).size !== 5
    || ids.some((id) => !Number.isInteger(id) || id <= 0)
  ) throw new Error('阿瓦隆需固定选择 5 位 AI 玩家');
  return { playerIds: ids, ...(debugMode ? { debugMode: true } : {}) };
}

function reduceAvalonViewState(state: AvalonViewState, event: GameEvent): AvalonViewState {
  if (event.type === 'error') {
    const message = String(event.message || '游戏发生错误');
    return { ...state, activeSpeech: null, message, error: message };
  }
  const host = projectHost(event.game?.host) || state.host;
  if (event.game?.gameType !== 'avalon') {
    return { ...state, host, ...(event.message ? { message: event.message } : {}) };
  }
  const game = projectAvalonPublicState(event.game as unknown as AvalonPublicState);
  return {
    game,
    host,
    activeSpeech: getActiveSpeech(event),
    message: String(event.message || state.message),
    error: '',
  };
}

function useAvalonGame({ playerIds, replayGameId = '', debugMode = false }: UseAvalonGameParams) {
  const [view, setView] = useState<AvalonViewState>(EMPTY_AVALON_VIEW_STATE);
  const [started, setStarted] = useState(false);
  const { speechEnabled, setSpeechEnabled, speak, unlock, cancel } = useSpeechQueue();
  const session = useGameSocketSession({
    gameType: 'avalon',
    speechEnabled,
    speak,
    cancel,
    applyServerEvent: (event) => setView((current) => reduceAvalonViewState(current, event)),
    getNarration: (event) => String(event.presentation?.speakableText || event.message || ''),
    getSpeechOptions: (event): Partial<QueueItem> => ({
      audioUrl: event.audioUrl,
      audioMimeType: event.audioMimeType,
      wordBoundaries: event.wordBoundaries || null,
    }),
    getAckDelay: () => 140,
    playPendingEvent: () => false,
    onError: (error) => {
      const message = String(error.message || '游戏发生错误');
      setStarted(false);
      setView((current) => ({ ...current, activeSpeech: null, message, error: message }));
    },
    onAcknowledge: () => setView((current) => ({ ...current, activeSpeech: null })),
    onAutoPlayStopped: () => setView((current) => ({ ...current, activeSpeech: null })),
    onSkipPhase: (message) => setView((current) => ({
      ...current,
      activeSpeech: null,
      message: message || '正在跳过当前阶段...',
    })),
  });

  useEffect(() => {
    if (replayGameId) startGame();
  }, [replayGameId]);

  function startGame(): void {
    try {
      const options = buildAvalonStartOptions(playerIds, replayGameId, debugMode);
      setView({ ...EMPTY_AVALON_VIEW_STATE, message: replayGameId ? '正在加载历史对局...' : '游戏准备中...' });
      setStarted(true);
      if (speechEnabled) unlock();
      session.startSession(options);
    } catch (error) {
      const message = (error as Error).message;
      setView((current) => ({ ...current, error: message, message }));
    }
  }

  function stopGame(): void {
    session.closeSession();
    session.clearPendingAckTimer();
    session.resetSessionRefs();
    cancel();
    setStarted(false);
    setView((current) => ({ ...current, activeSpeech: null }));
  }

  return {
    ...view,
    autoPlay: session.autoPlay,
    replayMode: session.isReplayMode,
    started,
    speechEnabled,
    setSpeechEnabled,
    startGame,
    stopGame,
    setAutoPlayEnabled: session.setAutoPlayEnabled,
    skipCurrentReplayPhase: session.skipCurrentReplayPhase,
  };
}

function projectAvalonPublicState(game: AvalonPublicState): AvalonPublicState {
  return {
    id: game.id,
    gameType: 'avalon',
    mode: 'standard-5',
    status: game.status,
    missionNumber: game.missionNumber,
    proposalAttempt: game.proposalAttempt,
    leaderId: game.leaderId,
    players: (game.players || []).map(({ id, nickname, avatar }) => ({ id, nickname, ...(avatar ? { avatar } : {}) })),
    missions: (game.missions || []).map((mission) => ({
      ...mission,
      teamIds: [...mission.teamIds],
    })),
    currentTeamIds: [...(game.currentTeamIds || [])],
    goodScore: game.goodScore,
    evilScore: game.evilScore,
    ...(game.winner ? { winner: game.winner } : {}),
    ...(game.winReason ? { winReason: game.winReason } : {}),
    ...(game.assassinationTargetId ? { assassinationTargetId: game.assassinationTargetId } : {}),
    ...(game.status === 'completed' && game.reveal ? { reveal: game.reveal.map((item) => ({ ...item })) } : {}),
  };
}

function projectHost(value: unknown): AvalonHost | null {
  if (!value || typeof value !== 'object') return null;
  const host = value as Record<string, unknown>;
  return {
    id: host.id as string | number | undefined,
    nickname: String(host.nickname || host.name || '主持人'),
    avatar: String(host.avatar || ''),
    avatarUrl: String(host.avatarUrl || host.avatar || ''),
  };
}

function getActiveSpeech(event: GameEvent): SpeechState | null {
  const text = String(event.presentation?.speakableText || '').trim();
  if (!text) return null;
  return {
    id: `${event.ackId || event.type}-avalon`,
    playerId: null,
    text,
    speakerLabel: '主持人',
    speakerRole: 'host',
    wordBoundaries: event.wordBoundaries || null,
    currentTimeMs: null,
  };
}

export {
  EMPTY_AVALON_VIEW_STATE,
  buildAvalonStartOptions,
  projectAvalonPublicState,
  reduceAvalonViewState,
  useAvalonGame,
};
