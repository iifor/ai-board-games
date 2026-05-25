const SPEECH_ACK_TIMEOUT_MS = 120000;

const GAME_TYPES = {
  DEBATE: 'debate',
  WEREWOLF: 'werewolf',
} as const;

type GameType = (typeof GAME_TYPES)[keyof typeof GAME_TYPES];

export { SPEECH_ACK_TIMEOUT_MS, GAME_TYPES };
export type { GameType };
