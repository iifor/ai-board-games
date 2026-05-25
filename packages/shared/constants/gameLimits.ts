// 所有字数限制均为弱约束（提示建议），实际发言不做截断处理。
// All character limits are soft constraints (prompt suggestions); actual speech is never truncated.

const WEREWOLF = {
  MAX_DAYS: 5,
  SPEECH_ACK_TIMEOUT_MS: 120000,
  MAX_AGENT_FALLBACK_RETRIES: 2,

  // 发言字数弱约束（仅用于 AI 提示词，不截断实际输出）
  DAY_SPEECH_CHAR_LIMIT: 200,
  WOLF_NIGHT_SPEECH_CHAR_LIMIT: 150,
  SHERIFF_SPEECH_CHAR_LIMIT: 250,
  LAST_WORDS_CHAR_LIMIT: 150,
  HOST_ANNOUNCE_CHAR_LIMIT: 50,

  MIN_PLAYERS: 12
} as const;

const DEBATE = {
  SPEECH_ACK_TIMEOUT_MS: 120000,
  MIN_PLAYERS: 8,
  MAX_PLAYERS: 12,
  PRO_COUNT: 4,
  CON_COUNT: 4,
  MAX_JUDGES: 4,

  // 发言字数弱约束（仅用于 AI 提示词，不截断实际输出）
  HOST_ANNOUNCE_CHAR_LIMIT: 50,

  // 各环节字数弱约束（可在运行时覆盖）
  PHASE_LIMITS: {
    strategy: 300,
    opening: 350,
    crossfire: 200,
    crossfire_question: 60,
    crossfire_answer: 200,
    free: 150,
    closing: 350,
    judges: 300,
    mvp: 100,
    postgame: 180
  }
} as const;

export { WEREWOLF, DEBATE };
