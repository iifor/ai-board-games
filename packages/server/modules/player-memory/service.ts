import * as repo from './repository';
import {
  RELATIONSHIP_ENTRY_CHAR_LIMIT,
  RELATIONSHIP_PROMPT_CHAR_LIMIT,
  SESSION_RECENT_MESSAGE_LIMIT,
  SESSION_SUMMARY_CHAR_LIMIT,
  SUPPORTED_MEMORY_GAME_TYPES,
} from './constants';
import type {
  ChatMessage,
  MemoryStats,
  MemoryTraits,
  PlayerGameMemory,
  SessionSnapshot,
} from './types';

interface Participant {
  id?: number;
  playerId?: number;
  sourcePlayerId?: number;
  nickname?: string;
  name?: string;
  role?: string;
  faction?: string;
  side?: string;
  speeches?: unknown[];
  [key: string]: unknown;
}

interface CompletedGame {
  id: string;
  gameType?: string;
  type?: string;
  winner?: string | null;
  players?: Participant[];
  rounds?: unknown[];
}

function getPlayerGameMemories(gameType: string, ownerPlayerId: number, participantIds: number[]): PlayerGameMemory[] {
  return repo.findMemories(gameType, ownerPlayerId, participantIds.filter((id) => id !== ownerPlayerId))
    .map((row) => ({
      gameType: row.game_type,
      ownerPlayerId: row.owner_player_id,
      subjectPlayerId: row.subject_player_id,
      gamesPlayed: row.games_played,
      familiarityScore: row.familiarity_score,
      traits: parseJson<MemoryTraits>(row.traits_json, {}),
      recentSummary: row.recent_summary,
      updatedAt: row.updated_at,
    }));
}

function formatRelationshipMemoryForPrompt(
  gameType: string,
  ownerPlayerId: number,
  participants: Participant[],
): string {
  const participantIds = participants.map(resolvePlayerId).filter((id): id is number => Boolean(id));
  const memories = getPlayerGameMemories(gameType, ownerPlayerId, participantIds);
  return formatRelationshipMemoryList(memories, participants, gameType);
}

function formatRelationshipMemoryList(
  memories: PlayerGameMemory[],
  participants: Participant[],
  gameType = memories[0]?.gameType || 'werewolf',
): string {
  const byId = new Map(participants.map((player) => [resolvePlayerId(player), player]));
  const header = [
    '【过往交手印象】',
    '以下内容来自历史公开表现，仅供参考，不代表本局身份、阵营或立场。',
  ];
  const lines: string[] = [];
  let used = header.join('\n').length + 1;
  const rankedMemories = [...memories].sort((left, right) =>
    right.gamesPlayed - left.gamesPlayed
    || right.familiarityScore - left.familiarityScore
    || right.updatedAt.localeCompare(left.updatedAt)
    || left.subjectPlayerId - right.subjectPlayerId
  );
  for (const memory of rankedMemories) {
    if (memory.gamesPlayed < 2 || memory.familiarityScore < 2) continue;
    const subject = byId.get(memory.subjectPlayerId);
    if (!subject) continue;
    const name = subject?.nickname || subject?.name || `玩家${memory.subjectPlayerId}`;
    const traits = describeTraits(gameType, memory.traits).slice(0, 1);
    const detail = [traits.join('；'), memory.recentSummary].filter(Boolean).join('；');
    if (!detail) continue;
    const line = `- ${name}：共同参与${memory.gamesPlayed}局。${detail}`.slice(0, RELATIONSHIP_ENTRY_CHAR_LIMIT);
    if (used + line.length > RELATIONSHIP_PROMPT_CHAR_LIMIT) break;
    lines.push(line);
    used += line.length;
  }
  if (!lines.length) return '';
  return [...header, ...lines].join('\n');
}

function recordCompletedGameMemories(game: CompletedGame): void {
  const gameType = String(game.gameType || game.type || '');
  if (!isSupportedGameType(gameType)) return;
  const participants = (game.players || []).filter((player) => resolvePlayerId(player));
  if (participants.length < 2) return;
  const observations = buildObservations(gameType, game, participants);

  for (const owner of participants) {
    const ownerId = resolvePlayerId(owner)!;
    for (const subject of participants) {
      const subjectId = resolvePlayerId(subject)!;
      if (ownerId === subjectId) continue;
      const previous = repo.findMemory(gameType, ownerId, subjectId);
      const previousTraits = parseJson<MemoryTraits>(previous?.traits_json, {});
      if (previousTraits.lastGameId === game.id) continue;
      const observed = observations.get(subjectId) || {};
      const traits = { ...mergeTraits(previousTraits, observed), lastGameId: game.id };
      const gamesPlayed = Number(previous?.games_played || 0) + 1;
      repo.upsertMemory({
        gameType,
        ownerPlayerId: ownerId,
        subjectPlayerId: subjectId,
        gamesPlayed,
        familiarityScore: Math.min(100, Number(previous?.familiarity_score || 0) + 1),
        traitsJson: JSON.stringify(traits),
        recentSummary: buildRecentSummary(gameType, subject, game),
      });
    }
  }
}

function loadPlayerSession(gameType: string, matchId: string, playerId: number, basePromptHash: string): ChatMessage[] | null {
  const row = repo.loadLatestSession(matchId, `${gameType}_session`, String(playerId));
  if (!row) return null;
  const snapshot = parseJson<SessionSnapshot | null>(row.snapshot_json, null);
  if (!snapshot || snapshot.basePromptHash !== basePromptHash || !Array.isArray(snapshot.messages)) return null;
  return snapshot.messages.filter(isChatMessage);
}

function savePlayerSession(
  gameType: string,
  matchId: string,
  playerId: number,
  basePromptHash: string,
  messages: ChatMessage[],
): void {
  const compacted = compactMessages(messages);
  const snapshot: SessionSnapshot = {
    gameType,
    matchId,
    playerId,
    basePromptHash,
    messages: compacted,
    updatedAt: new Date().toISOString(),
  };
  repo.replaceSession(matchId, `${gameType}_session`, String(playerId), JSON.stringify(snapshot));
}

function getMemoryStats(): MemoryStats {
  const rows = repo.getMemoryStats();
  const games = SUPPORTED_MEMORY_GAME_TYPES.map((gameType) => {
    const row = rows.find((item) => item.gameType === gameType);
    return { gameType, count: Number(row?.count || 0), lastUpdatedAt: row?.lastUpdatedAt || null };
  });
  return {
    total: games.reduce((sum, item) => sum + item.count, 0),
    lastUpdatedAt: games.map((item) => item.lastUpdatedAt).filter(Boolean).sort().at(-1) || null,
    games,
  };
}

function clearPlayerMemories(gameType: 'werewolf' | 'debate' | 'all'): { gameType: string; deletedCount: number } {
  return {
    gameType,
    deletedCount: repo.runInTransaction(() => repo.clearMemories(gameType === 'all' ? undefined : gameType)),
  };
}

function compactMessages(messages: ChatMessage[]): ChatMessage[] {
  const system = messages.find((message) => message.role === 'system');
  const previousSummaries = messages
    .filter((message) => message.role === 'system' && message !== system)
    .map((message) => message.content.replace(/^【较早对话摘要】\s*/, ''))
    .filter(Boolean);
  const nonSystem = messages.filter((message) => message.role !== 'system');
  const recent = nonSystem.slice(-SESSION_RECENT_MESSAGE_LIMIT);
  const removed = nonSystem.slice(0, Math.max(0, nonSystem.length - SESSION_RECENT_MESSAGE_LIMIT));
  const newSummary = removed.map((message) =>
    `${message.role === 'assistant' ? '回应' : '任务'}：${message.content.replace(/\s+/g, ' ').slice(0, 90)}`
  );
  const summary = [...previousSummaries, ...newSummary]
    .join('\n')
    .slice(-SESSION_SUMMARY_CHAR_LIMIT);
  return [
    ...(system ? [system] : []),
    ...(summary ? [{ role: 'system' as const, content: `【较早对话摘要】\n${summary}` }] : []),
    ...recent,
  ];
}

function buildObservations(gameType: string, game: CompletedGame, participants: Participant[]): Map<number, MemoryTraits> {
  const result = new Map<number, MemoryTraits>();
  const speechStats = collectSpeechStats(game.rounds || []);
  participants.forEach((player) => {
    const id = resolvePlayerId(player)!;
    const stats = speechStats.get(Number(player.id)) || { count: 0, chars: 0 };
    const won = didPlayerWin(gameType, player, game.winner);
    result.set(id, {
      speechCount: stats.count,
      speechChars: stats.chars,
      wins: won ? 1 : 0,
      wolfGames: gameType === 'werewolf' && player.faction === 'wolves' ? 1 : 0,
      goodGames: gameType === 'werewolf' && player.faction !== 'wolves' ? 1 : 0,
      debateGames: gameType === 'debate' ? 1 : 0,
      debateWins: gameType === 'debate' && won ? 1 : 0,
    });
  });
  return result;
}

function collectSpeechStats(rounds: unknown[]): Map<number, { count: number; chars: number }> {
  const result = new Map<number, { count: number; chars: number }>();
  const visit = (value: unknown): void => {
    if (Array.isArray(value)) {
      value.forEach(visit);
      return;
    }
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    if (item.playerId && typeof item.text === 'string') {
      const id = Number(item.playerId);
      const current = result.get(id) || { count: 0, chars: 0 };
      result.set(id, { count: current.count + 1, chars: current.chars + item.text.length });
    }
    Object.values(item).forEach(visit);
  };
  visit(rounds);
  return result;
}

function mergeTraits(previous: MemoryTraits, observed: MemoryTraits): MemoryTraits {
  const keys: Array<Exclude<keyof MemoryTraits, 'lastGameId'>> = [
    'speechCount',
    'speechChars',
    'voteCount',
    'wins',
    'wolfGames',
    'goodGames',
    'debateGames',
    'debateWins',
  ];
  const next: MemoryTraits = {};
  keys.forEach((key) => {
    next[key] = Number(previous[key] || 0) + Number(observed[key] || 0);
  });
  return next;
}

function describeTraits(gameType: string, traits: MemoryTraits): string[] {
  const games = gameType === 'debate'
    ? Math.max(1, Number(traits.debateGames || 0))
    : Math.max(1, Number(traits.wolfGames || 0) + Number(traits.goodGames || 0));
  const speechCount = Number(traits.speechCount || 0);
  const speechChars = Number(traits.speechChars || 0);
  const lines: string[] = [];
  if (speechCount / games >= 3) lines.push('公开表达较积极');
  else if (speechCount > 0) lines.push('公开表达相对克制');
  if (speechCount && speechChars / speechCount >= 100) lines.push('发言通常较详细');
  if (gameType === 'werewolf' && Number(traits.wolfGames || 0) > 0) lines.push('有狼人身份的公开表现经验');
  if (gameType === 'debate' && Number(traits.debateWins || 0) / games >= 0.5) lines.push('历史辩论胜率较高');
  return lines;
}

function buildRecentSummary(gameType: string, subject: Participant, game: CompletedGame): string {
  const name = subject.nickname || subject.name || `玩家${resolvePlayerId(subject)}`;
  if (gameType === 'werewolf') {
    const role = subject.role || (subject.faction === 'wolves' ? '狼人阵营' : '好人阵营');
    return `最近一局${name}以${role}身份完成比赛。`;
  }
  const side = subject.side === 'pro' ? '正方' : subject.side === 'con' ? '反方' : '评委';
  return `最近一局${name}担任${side}。`;
}

function didPlayerWin(gameType: string, player: Participant, winner: string | null | undefined): boolean {
  if (!winner) return false;
  if (gameType === 'werewolf') return player.faction === winner;
  return player.side === winner;
}

function resolvePlayerId(player: Participant): number | null {
  const value = Number(player.sourcePlayerId || player.playerId || player.id);
  return Number.isFinite(value) && value > 0 ? value : null;
}

function isSupportedGameType(value: string): value is 'werewolf' | 'debate' {
  return (SUPPORTED_MEMORY_GAME_TYPES as readonly string[]).includes(value);
}

function isChatMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== 'object') return false;
  const item = value as ChatMessage;
  return ['system', 'user', 'assistant'].includes(item.role) && typeof item.content === 'string';
}

function parseJson<T>(value: string | undefined, fallback: T): T {
  try {
    return value ? JSON.parse(value) as T : fallback;
  } catch {
    return fallback;
  }
}

export {
  getPlayerGameMemories,
  formatRelationshipMemoryForPrompt,
  formatRelationshipMemoryList,
  recordCompletedGameMemories,
  loadPlayerSession,
  savePlayerSession,
  getMemoryStats,
  clearPlayerMemories,
  compactMessages,
};
