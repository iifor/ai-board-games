import { useEffect, useState } from 'react';
import { useGameSocketSession } from '../../../hooks/useGameSocketSession';
import { useSpeechQueue } from '../../../hooks/useSpeechQueue';
import type { GameEvent, QueueItem, SpeechState } from '../../../types';
import type {
  UndercoverHost,
  UndercoverPublicState,
  UndercoverStartOptions,
  UndercoverViewState,
  UndercoverVoteResult,
} from '../types';

export const EMPTY_UNDERCOVER_VIEW_STATE: UndercoverViewState = {
  game: null,
  host: null,
  activeSpeech: null,
  error: '',
  message: '已选择 6 位 AI 玩家，点击开始游戏。'
};

interface UseUndercoverGameParams {
  playerIds: number[];
  replayGameId?: string;
}

export function buildUndercoverStartOptions(playerIds: number[], replayGameId: string): UndercoverStartOptions {
  if (replayGameId) return { replayGameId };
  const normalizedIds = playerIds.map(Number);
  if (
    normalizedIds.length !== 6
    || new Set(normalizedIds).size !== 6
    || normalizedIds.some((id) => !Number.isInteger(id) || id <= 0)
  ) {
    throw new Error('谁是卧底需固定选择 6 位 AI 玩家');
  }
  return { playerIds: normalizedIds };
}

export function getUndercoverNarration(event: GameEvent): string {
  return String(
    event.subtitle?.text
    || event.presentation?.speakableText
    || event.speech?.text
    || event.message
    || '',
  );
}

export function reduceUndercoverViewState(state: UndercoverViewState, event: GameEvent): UndercoverViewState {
  if (event.type === 'error') {
    const message = String(event.message || '游戏发生错误');
    return { ...state, activeSpeech: null, error: message, message };
  }
  if (event.game?.gameType !== 'undercover') {
    return event.message ? { ...state, message: event.message } : state;
  }
  const game = projectUndercoverPublicState(event.game as unknown as UndercoverPublicState);
  const voteResult = normalizeAggregateVoteResult(event, game)
    || (state.game?.round === game.round ? state.game.voteResult : undefined);
  if (voteResult) game.voteResult = { ...voteResult, votes: {} };
  return {
    game,
    host: projectUndercoverHost(event.game.host) || state.host,
    activeSpeech: getUndercoverActiveSpeech(event),
    error: '',
    message: String(event.message || state.message)
  };
}

export function useUndercoverGame({ playerIds, replayGameId = '' }: UseUndercoverGameParams) {
  const [view, setView] = useState<UndercoverViewState>(EMPTY_UNDERCOVER_VIEW_STATE);
  const [started, setStarted] = useState(false);
  const { speechEnabled, setSpeechEnabled, speak, unlock, cancel } = useSpeechQueue();
  const session = useGameSocketSession({
    gameType: 'undercover',
    speechEnabled,
    speak,
    cancel,
    applyServerEvent: (event) => setView((current) => reduceUndercoverViewState(current, event)),
    getNarration: getUndercoverNarration,
    getSpeechOptions: getSpeechOptions,
    playPendingEvent: () => false,
    onError: (error) => {
      const message = String(error.message || '游戏发生错误');
      setStarted(false);
      setView((current) => ({ ...current, error: message, message }));
    },
    onAcknowledge: () => {
      setView((current) => ({ ...current, activeSpeech: null }));
    },
    onAutoPlayStopped: () => {
      setView((current) => ({ ...current, activeSpeech: null }));
    },
    onSkipPhase: (message) => {
      setView((current) => ({
        ...current,
        activeSpeech: null,
        message: message || '正在跳过当前阶段...'
      }));
    }
  });

  useEffect(() => {
    if (replayGameId) startGame();
  }, [replayGameId]);

  function startGame(): void {
    try {
      const options = buildUndercoverStartOptions(playerIds, replayGameId);
      setView({ ...EMPTY_UNDERCOVER_VIEW_STATE, message: replayGameId ? '正在加载历史对局...' : '游戏准备中...' });
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
    skipCurrentReplayPhase: session.skipCurrentReplayPhase
  };
}

function getSpeechOptions(event: GameEvent): Partial<QueueItem> {
  return {
    audioUrl: event.audioUrl,
    audioMimeType: event.audioMimeType,
    wordBoundaries: event.wordBoundaries || null
  };
}

function projectUndercoverHost(value: unknown): UndercoverHost | null {
  if (!value || typeof value !== 'object') return null;
  const host = value as Record<string, unknown>;
  return {
    id: host.id as string | number | undefined,
    name: String(host.name || ''),
    nickname: String(host.nickname || host.name || '主持人'),
    avatar: String(host.avatar || ''),
    avatarUrl: String(host.avatarUrl || host.avatar || ''),
  };
}

function getUndercoverActiveSpeech(event: GameEvent): SpeechState | null {
  const text = String(event.subtitle?.text || '').trim();
  const speakerRole = String(event.subtitle?.speakerRole || '').trim();
  if (!text || !speakerRole) return null;
  return {
    id: `${event.ackId || event.type}-undercover`,
    playerId: event.speech?.playerId || null,
    text,
    speakerLabel: event.subtitle?.speakerLabel || '',
    speakerRole,
    wordBoundaries: event.wordBoundaries || null,
    currentTimeMs: null,
  };
}

function projectUndercoverPublicState(game: UndercoverPublicState): UndercoverPublicState {
  const projected: UndercoverPublicState = {
    id: game.id,
    gameType: 'undercover',
    mode: 'standard-6',
    status: game.status,
    round: game.round,
    players: (game.players || []).map(({ id, nickname, avatar, alive, eliminatedRound }) => ({
      id,
      nickname,
      ...(avatar ? { avatar } : {}),
      alive,
      ...(eliminatedRound ? { eliminatedRound } : {})
    })),
    speeches: (game.speeches || []).map(({ round, playerId, text }) => ({ round, playerId, text }))
  };
  if (game.voteResult) {
    projected.voteResult = {
      round: game.voteResult.round,
      runoff: game.voteResult.runoff,
      votes: {},
      tally: { ...game.voteResult.tally },
      tiedCandidateIds: [...game.voteResult.tiedCandidateIds],
      ...(game.voteResult.eliminatedPlayerId ? { eliminatedPlayerId: game.voteResult.eliminatedPlayerId } : {})
    };
  }
  if (game.winner) projected.winner = game.winner;
  if (game.winReason) projected.winReason = game.winReason;
  if (game.status === 'completed' && game.reveal) projected.reveal = { ...game.reveal };
  return projected;
}

function normalizeAggregateVoteResult(event: GameEvent, game: UndercoverPublicState): UndercoverVoteResult | null {
  if (event.type !== 'undercover-vote-result' || !event.payload) return null;
  const round = Number(event.payload.round);
  const eliminatedPlayerId = Number(event.payload.eliminatedPlayerId);
  const tally = Object.fromEntries(
    Object.entries(event.payload.tally || {})
      .map(([playerId, votes]) => [playerId, Number(votes)] as const)
      .filter(([, votes]) => Number.isFinite(votes) && votes >= 0)
  );
  const tiedCandidateIds = Array.isArray(event.payload.tiedCandidateIds)
    ? event.payload.tiedCandidateIds.map(Number).filter((id) => Number.isInteger(id) && id > 0)
    : [];
  return {
    round: Number.isInteger(round) && round > 0 ? round : game.round,
    runoff: event.payload.runoff === true,
    votes: {},
    tally,
    tiedCandidateIds,
    ...(Number.isInteger(eliminatedPlayerId) && eliminatedPlayerId > 0 ? { eliminatedPlayerId } : {})
  };
}
