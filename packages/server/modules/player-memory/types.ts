interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

interface SessionSnapshot {
  gameType: string;
  matchId: string;
  playerId: number;
  basePromptHash: string;
  messages: ChatMessage[];
  updatedAt?: string;
}

interface MemoryTraits {
  speechCount?: number;
  speechChars?: number;
  voteCount?: number;
  wins?: number;
  wolfGames?: number;
  goodGames?: number;
  debateGames?: number;
  debateWins?: number;
  lastGameId?: string;
}

interface PlayerGameMemory {
  gameType: string;
  ownerPlayerId: number;
  subjectPlayerId: number;
  gamesPlayed: number;
  familiarityScore: number;
  traits: MemoryTraits;
  recentSummary: string;
  updatedAt: string;
}

interface MemoryStatsItem {
  gameType: 'werewolf' | 'debate';
  count: number;
  lastUpdatedAt: string | null;
}

interface MemoryStats {
  total: number;
  lastUpdatedAt: string | null;
  games: MemoryStatsItem[];
}

interface PlayerMemoryRecord {
  id: number;
  gameType: string;
  ownerPlayerId: number;
  ownerNickname: string;
  ownerName: string;
  subjectPlayerId: number;
  subjectNickname: string;
  subjectName: string;
  gamesPlayed: number;
  familiarityScore: number;
  traits: MemoryTraits;
  recentSummary: string;
  createdAt: string;
  updatedAt: string;
}

interface PaginatedMemories {
  items: PlayerMemoryRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export type {
  ChatMessage,
  SessionSnapshot,
  MemoryTraits,
  PlayerGameMemory,
  MemoryStats,
  MemoryStatsItem,
  PlayerMemoryRecord,
  PaginatedMemories,
};
