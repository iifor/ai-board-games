const GAME_TYPES = {
  DEBATE: 'debate',
  WEREWOLF: 'werewolf'
};

const GAME_EVENTS = {
  PLAYERS: 'players',
  PHASE_START: 'phase-start',
  PHASE_END: 'phase-end',
  SPEECH: 'speech',
  GAME: 'game',
  DONE: 'done',
  ERROR: 'error',
  HOST: 'host',
  ACK: 'ack',
  CONTROL: 'control',
  START: 'start'
};

const WEREWOLF_EVENTS = {
  WOLF_WAKE: 'wolf-wake',
  WOLF_LEADER: 'wolf-leader',
  WOLF_SPEECH: 'wolf-speech',
  WOLF_VOTE: 'wolf-vote',
  SEER_WAKE: 'seer-wake',
  SEER_CHECK: 'seer-check',
  GUARD_WAKE: 'guard-wake',
  GUARD_ACTION: 'guard-action',
  WITCH_ANTIDOTE: 'witch-antidote',
  WITCH_POISON: 'witch-poison',
  WITCH_ACTION: 'witch-action',
  NIGHT_RESULT: 'night-result',
  DAY_START: 'day-start',
  SHERIFF_START: 'sheriff-start',
  SHERIFF_SPEECH: 'sheriff-speech',
  SHERIFF_CANDIDATES: 'sheriff-candidates',
  SHERIFF_VOTE: 'sheriff-vote',
  SHERIFF_RUNOFF_SPEECH: 'sheriff-runoff-speech',
  SHERIFF_RUNOFF_VOTE: 'sheriff-runoff-vote',
  SHERIFF_RESULT: 'sheriff-result',
  SPEECH_ORDER: 'speech-order',
  VOTE_RESULT: 'vote-result',
  LAST_WORDS: 'last-words',
  EXILE_WORDS: 'exile-words',
  HUNTER_SHOT: 'hunter-shot',
  SHERIFF_BADGE_TRANSFER: 'sheriff-badge-transfer',
  SHERIFF_BADGE_TEAR: 'sheriff-badge-tear'
};

module.exports = { GAME_TYPES, GAME_EVENTS, WEREWOLF_EVENTS };
