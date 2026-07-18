import type { UndercoverPublicState } from '../../../shared/types/undercover';
import type { UndercoverState } from './types';

interface UndercoverPresentationEvent {
  type: string;
  channel: 'public';
  payload: { message: string };
  presentation: {
    speakableText: string;
    displayText: string;
    displayMode: 'status';
    uiHint: string;
    suppressSpeech: boolean;
  };
  game: UndercoverPublicState;
}

function toUndercoverPublicState(state: UndercoverState): UndercoverPublicState {
  const publicState: UndercoverPublicState = {
    id: state.id,
    gameType: 'undercover',
    mode: 'standard-6',
    status: state.status,
    round: state.round,
    players: state.players.map((player) => ({
      id: player.id,
      nickname: player.nickname,
      avatar: player.avatar,
      alive: player.alive,
      eliminatedRound: player.eliminatedRound,
    })),
    speeches: state.speeches.map((speech) => ({ ...speech })),
  };
  if (state.winner) publicState.winner = state.winner;
  if (state.winReason) publicState.winReason = state.winReason;
  if (state.status === 'completed') {
    publicState.reveal = {
      civilianWord: state.wordPair.civilian,
      undercoverWord: state.wordPair.undercover,
      undercoverPlayerId: state.undercoverPlayerId,
    };
  }
  return publicState;
}

function createUndercoverPresentationEvent(
  type: string,
  state: UndercoverState,
  { message = '' }: { message?: string } = {},
): UndercoverPresentationEvent {
  return {
    type,
    channel: 'public',
    payload: { message },
    presentation: {
      speakableText: message,
      displayText: message,
      displayMode: 'status',
      uiHint: type,
      suppressSpeech: !message,
    },
    game: toUndercoverPublicState(state),
  };
}

export { createUndercoverPresentationEvent, toUndercoverPublicState };
export type { UndercoverPresentationEvent };
