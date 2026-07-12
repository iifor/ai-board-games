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

/** 存储在 traits_json 中的元数据 */
interface MemoryData {
  lastGameId?: string;
  gamesPlayed?: number;
}

interface PlayerGameMemory {
  gameType: string;
  ownerPlayerId: number;
  subjectPlayerId: number;
  gamesPlayed: number;
  summary?: string;
  recentSummary?: string;
  familiarityScore?: number;
  traits?: Record<string, unknown>;
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
  summary: string;
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
  MemoryData,
  PlayerGameMemory,
  MemoryStats,
  MemoryStatsItem,
  PlayerMemoryRecord,
  PaginatedMemories,
};
