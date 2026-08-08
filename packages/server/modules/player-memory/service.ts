import * as repo from './repository';
import {
  SUMMARY_CHAR_LIMIT,
  OBSERVATION_CHAR_LIMIT,
  RELATIONSHIP_PROMPT_CHAR_LIMIT,
  MEMORY_INJECTION_THRESHOLD,
  SESSION_RECENT_MESSAGE_LIMIT,
  SESSION_SUMMARY_CHAR_LIMIT,
  SUPPORTED_MEMORY_GAME_TYPES,
} from './constants';
import type {
  ChatMessage,
  MemoryData,
  MemoryStats,
  PlayerGameMemory,
  PaginatedMemories,
  SessionSnapshot,
} from './types';
import { callModelChat } from '../llm';
import { getAiConfig } from '../../config';

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

// ============================================================
// 跨局玩家画像（长期记忆）
// ============================================================

function getPlayerGameMemories(gameType: string, ownerPlayerId: number, participantIds: number[]): PlayerGameMemory[] {
  return repo.findMemories(gameType, ownerPlayerId, participantIds.filter((id) => id !== ownerPlayerId))
    .map((row) => ({
      gameType: row.game_type,
      ownerPlayerId: row.owner_player_id,
      subjectPlayerId: row.subject_player_id,
      gamesPlayed: row.games_played,
      summary: row.recent_summary,
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
  return formatRelationshipMemoryList(memories, participants);
}

function formatRelationshipMemoryList(
  memories: PlayerGameMemory[],
  participants: Participant[],
): string {
  const byId = new Map(participants.map((player) => [resolvePlayerId(player), player]));
  const header = [
    '【过往交手印象】',
    '以下内容来自历史公开表现，仅供参考，不代表本局身份、阵营或立场。',
  ];
  const lines: string[] = [];
  let used = header.join('\n').length + 1;
  const rankedMemories = [...memories]
    .filter((m) => (
      m.gamesPlayed >= MEMORY_INJECTION_THRESHOLD
      && (m.familiarityScore == null || m.familiarityScore > MEMORY_INJECTION_THRESHOLD)
      && (m.summary || m.recentSummary)
    ))
    .sort((left, right) =>
      right.gamesPlayed - left.gamesPlayed
      || right.updatedAt.localeCompare(left.updatedAt)
      || left.subjectPlayerId - right.subjectPlayerId
    );
  for (const memory of rankedMemories) {
    const subject = byId.get(memory.subjectPlayerId);
    if (!subject) continue;
    const name = subject?.nickname || subject?.name || `玩家${memory.subjectPlayerId}`;
    const line = `- ${name}（${memory.gamesPlayed}局）：${memory.summary || memory.recentSummary}`.slice(0, 100);
    if (used + line.length > RELATIONSHIP_PROMPT_CHAR_LIMIT) break;
    lines.push(line);
    used += line.length;
  }
  if (!lines.length) return '';
  return [...header, ...lines].join('\n');
}

async function recordCompletedGameMemories(game: CompletedGame): Promise<void> {
  const gameType = String(game.gameType || game.type || '');
  if (!isSupportedGameType(gameType)) return;
  const participants = (game.players || []).filter((player) => resolvePlayerId(player));
  if (participants.length < 2) return;

  // ① LLM 分析本局所有玩家的表现
  const observations = await analyzeGameObservations(gameType, game, participants);

  // ② 对每对玩家，合并旧摘要 + 新观察
  for (const owner of participants) {
    const ownerId = resolvePlayerId(owner)!;
    for (const subject of participants) {
      const subjectId = resolvePlayerId(subject)!;
      if (ownerId === subjectId) continue;

      const previous = repo.findMemory(gameType, ownerId, subjectId);
      const prevData = parseJson<MemoryData>(previous?.traits_json, {});
      if (prevData.lastGameId === game.id) continue;

      const newObservation = observations.get(subjectId) || '';
      const existingSummary = previous?.recent_summary || '';
      const merged = existingSummary
        ? await mergeMemorySummary(gameType, existingSummary, newObservation)
        : newObservation;

      const gamesPlayed = Number(previous?.games_played || 0) + 1;
      repo.upsertMemory({
        gameType,
        ownerPlayerId: ownerId,
        subjectPlayerId: subjectId,
        gamesPlayed,
        familiarityScore: 0,
        traitsJson: JSON.stringify({ lastGameId: game.id, gamesPlayed } satisfies MemoryData),
        recentSummary: merged.slice(0, SUMMARY_CHAR_LIMIT),
      });
    }
  }
}

async function analyzeGameObservations(
  gameType: string,
  game: CompletedGame,
  participants: Participant[],
): Promise<Map<number, string>> {
  const result = new Map<number, string>();
  const config = await getLlmConfig();
  if (!config) return result;

  const gameContext = buildGameContext(gameType, game, participants);
  const prompt = gameType === 'werewolf'
    ? buildWerewolfAnalysisPrompt(gameContext)
    : buildDebateAnalysisPrompt(gameContext);

  try {
    const response = await callModelChat({
      ...config,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 2000,
    });
    parseObservationResponse(response, participants, result);
  } catch {
    // LLM 调用失败时静默跳过，不影响对局保存
  }
  return result;
}

async function mergeMemorySummary(
  gameType: string,
  existing: string,
  newObservation: string,
): Promise<string> {
  const config = await getLlmConfig();
  if (!config) return newObservation || existing;

  const prompt = `你是一个记忆整理助手。请将以下"历史印象"和"最新观察"合并为一段简洁的玩家画像摘要。
要求：
- 保留历史印象中仍然重要的特征
- 融入新观察中的关键信息
- 去除重复内容
- 语言自然、简洁，像简短的人物评价
- 总字数不超过${SUMMARY_CHAR_LIMIT}字
- 只输出合并后的摘要，不要输出其他内容

游戏类型：${gameType === 'werewolf' ? '狼人杀' : '辩论赛'}

【历史印象】
${existing || '（无）'}

【最新观察】
${newObservation || '（无）'}

【合并后的印象】：`;

  try {
    const response = await callModelChat({
      ...config,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.5,
      maxTokens: 800,
    });
    return response.trim().slice(0, SUMMARY_CHAR_LIMIT);
  } catch {
    return newObservation || existing;
  }
}

// ============================================================
// LLM Prompt 构建
// ============================================================

function buildGameContext(gameType: string, game: CompletedGame, participants: Participant[]): string {
  const lines: string[] = [];
  lines.push(`对局ID: ${game.id}`);
  lines.push(`结果: ${game.winner || '未知'}`);
  lines.push('');
  for (const player of participants) {
    const id = resolvePlayerId(player);
    const name = player.nickname || player.name || `玩家${id}`;
    const parts = [`[${id}] ${name}`];
    if (player.role) parts.push(`角色: ${player.role}`);
    if (player.faction) parts.push(`阵营: ${player.faction}`);
    if (player.side) parts.push(`立场: ${player.side}`);
    lines.push(parts.join('，'));
  }
  if (Array.isArray(game.rounds) && game.rounds.length) {
    lines.push('');
    lines.push('=== 对局过程 ===');
    lines.push(serializeRounds(game.rounds, 3000));
  }
  return lines.join('\n');
}

function buildWerewolfAnalysisPrompt(gameContext: string): string {
  return `分析以下狼人杀对局中每位玩家的表现。从玩法风格、个性特点、行为模式角度描述。
只记录客观观察，不做评价。每人1-2句话，简洁具体。
只输出JSON格式，不要输出其他内容。

输出格式：
{"玩家ID": "观察文本", ...}

${gameContext}

请输出JSON：`;
}

function buildDebateAnalysisPrompt(gameContext: string): string {
  return `分析以下辩论赛对局中每位玩家的表现。从辩论风格、论证特点、个性特征角度描述。
只记录客观观察，不做评价。每人1-2句话，简洁具体。
只输出JSON格式，不要输出其他内容。

输出格式：
{"玩家ID": "观察文本", ...}

${gameContext}

请输出JSON：`;
}

function parseObservationResponse(
  response: string,
  participants: Participant[],
  result: Map<number, string>,
): void {
  try {
    const json = JSON.parse(response.trim().replace(/^```json\s*/, '').replace(/\s*```$/, ''));
    if (typeof json !== 'object' || !json) return;
    for (const player of participants) {
      const id = resolvePlayerId(player);
      if (!id) continue;
      const raw = json[String(id)] || json[String(player.id)];
      if (typeof raw === 'string' && raw.trim()) {
        result.set(id, raw.trim().slice(0, OBSERVATION_CHAR_LIMIT));
      }
    }
  } catch {
    // 解析失败静默跳过
  }
}

// ============================================================
// 局内会话持久化
// ============================================================

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

// ============================================================
// 查询/管理
// ============================================================

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

function listPlayerMemories(
  gameType?: string,
  page = 1,
  pageSize = 20,
): PaginatedMemories {
  const total = repo.countPlayerMemories(gameType);
  const rows = repo.findAllPlayerMemories(gameType, page, pageSize);
  const items = rows.map((row) => ({
    id: row.id,
    gameType: row.game_type,
    ownerPlayerId: row.owner_player_id,
    ownerNickname: row.owner_nickname,
    ownerName: row.owner_name,
    subjectPlayerId: row.subject_player_id,
    subjectNickname: row.subject_nickname,
    subjectName: row.subject_name,
    gamesPlayed: row.games_played,
    summary: row.recent_summary,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
  return { items, total, page, pageSize };
}

function clearPlayerMemories(gameType: 'werewolf' | 'debate' | 'all'): { gameType: string; deletedCount: number } {
  return {
    gameType,
    deletedCount: repo.runInTransaction(() => repo.clearMemories(gameType === 'all' ? undefined : gameType)),
  };
}

// ============================================================
// 工具函数
// ============================================================

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

function serializeRounds(rounds: unknown[], maxChars: number): string {
  const parts: string[] = [];
  let total = 0;
  const visit = (value: unknown, depth: number): void => {
    if (total >= maxChars) return;
    if (Array.isArray(value)) {
      for (const item of value) {
        if (total >= maxChars) break;
        visit(item, depth);
      }
      return;
    }
    if (!value || typeof value !== 'object') return;
    const item = value as Record<string, unknown>;
    if (item.playerId && typeof item.text === 'string') {
      const line = `[${item.playerId}] ${item.type || '发言'}：${item.text.slice(0, 200)}`;
      parts.push(line);
      total += line.length;
      return;
    }
    if (item.type && (item.type === 'vote' || item.type === 'action')) {
      const line = `[${item.playerId || '?'}] ${item.type}：${JSON.stringify(item.payload || item.target || '').slice(0, 100)}`;
      parts.push(line);
      total += line.length;
      return;
    }
    for (const v of Object.values(item)) {
      if (total >= maxChars) break;
      visit(v, depth + 1);
    }
  };
  visit(rounds, 0);
  return parts.join('\n').slice(0, maxChars);
}

async function getLlmConfig(): Promise<{ apiKey: string; model: string; baseUrl?: string; apiFormat?: string } | null> {
  try {
    const config = await getAiConfig();
    const host = config.host;
    if (!host?.apiKey || !host?.model) return null;
    return {
      apiKey: host.apiKey,
      model: host.model,
      baseUrl: host.baseUrl,
      apiFormat: host.apiFormat,
    };
  } catch {
    return null;
  }
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
  listPlayerMemories,
  clearPlayerMemories,
  compactMessages,
};
