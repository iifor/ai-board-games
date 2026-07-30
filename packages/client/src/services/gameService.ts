import type { ApiResponse } from '@ai-presenter/shared/types/apiTypes';
import type { DebateTeamDraft, DebateTopic, GameEvent, GameState, Player, WerewolfMode } from '../types';

export interface AiHealth {
  players?: Player[];
  defaultHostId?: number;
  [key: string]: unknown;
}

export interface PlayerSelectionsResponse {
  selections?: Record<string, number[]>;
}

export type RecentGame = GameState & {
  id: string;
  gameType?: string;
  savedAt?: string;
  title?: string;
  filename?: string;
};

export interface RecentGamesResponse {
  games?: RecentGame[];
}

export interface WerewolfModesResponse {
  modes?: WerewolfMode[];
  [key: string]: unknown;
}

export interface SavePlayerSelectionResponse {
  gameType?: string;
  playerIds?: number[];
  updatedAt?: string;
  [key: string]: unknown;
}

type GameSocketStartPayload = {
  type: 'start';
  mode: 'real';
  gameType: string;
  playerIds?: number[];
  hostId?: number | string;
  topic?: Partial<DebateTopic> | null;
  debateTeams?: Partial<DebateTeamDraft> | null;
  werewolfMode?: string;
  clientViewMode?: string;
  debugMode?: boolean;
  replayView?: boolean;
  replayGameId?: string;
};

export async function fetchAiPlayers(): Promise<Player[]> {
  const data = await fetchAiHealth();
  return data.players || [];
}

export async function fetchAiHealth(): Promise<AiHealth> {
  const response = await fetch('/api/toc/health');
  if (!response.ok) throw new Error('无法获取 AI 玩家配置');
  return parseApiData<AiHealth>(response);
}

export async function fetchPlayerSelections(): Promise<Record<string, number[]>> {
  const response = await fetch('/api/toc/player-selections');
  if (!response.ok) throw new Error('无法获取玩家选择配置');
  const data = await parseApiData<PlayerSelectionsResponse>(response);
  return data.selections || {};
}

export async function fetchRecentGames(gameType: string, limit: number = 10): Promise<RecentGame[]> {
  const response = await fetch(`/api/toc/games/recent?gameType=${encodeURIComponent(gameType)}&limit=${encodeURIComponent(limit)}`);
  if (!response.ok) throw new Error('无法获取历史对局');
  const data = await parseApiData<RecentGamesResponse>(response);
  return Array.isArray(data.games)
    ? data.games.filter((game) => game.gameType === gameType)
    : [];
}

export async function fetchWerewolfModes(): Promise<WerewolfModesResponse> {
  const response = await fetch('/api/toc/werewolf-modes');
  if (!response.ok) throw new Error('无法获取狼人杀模式');
  return parseApiData<WerewolfModesResponse>(response);
}

export async function fetchGameDetail(id: string): Promise<GameState> {
  const response = await fetch(`/api/toc/games/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('无法获取对局详情');
  return parseApiData<GameState>(response);
}

export async function savePlayerSelection(gameType: string, playerIds: number[]): Promise<SavePlayerSelectionResponse> {
  const response = await fetch(`/api/toc/player-selections/${gameType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerIds })
  });
  if (!response.ok) {
    const data = await parseErrorPayload(response);
    throw new Error(data.error || data.message || '保存玩家选择失败');
  }
  return parseApiData<SavePlayerSelectionResponse>(response);
}

async function parseApiData<T>(response: Response): Promise<T> {
  const payload = await response.json() as ApiResponse<T> | T;
  if (isApiResponse<T>(payload) && Object.prototype.hasOwnProperty.call(payload, 'data')) {
    return payload.data as T;
  }
  return payload as T;
}

async function parseErrorPayload(response: Response): Promise<{ error?: string; message?: string }> {
  const payload = await response.json().catch(() => ({})) as unknown;
  if (!payload || typeof payload !== 'object') return {};
  const record = payload as Record<string, unknown>;
  return {
    error: typeof record.error === 'string' ? record.error : undefined,
    message: typeof record.message === 'string' ? record.message : undefined
  };
}

function isApiResponse<T>(value: ApiResponse<T> | T): value is ApiResponse<T> {
  return Boolean(value && typeof value === 'object' && 'code' in value && 'message' in value);
}

export interface OpenGameSocketOptions {
  gameType: string;
  playerIds?: number[];
  hostId?: number | string;
  topic?: Partial<DebateTopic> | null;
  debateTeams?: Partial<DebateTeamDraft> | null;
  werewolfMode?: string;
  clientViewMode?: string;
  debugMode?: boolean;
  replayView?: boolean;
  replayGameId?: string;
  onEvent: (event: GameEvent, socket: WebSocket) => void;
  onError: (error: Error) => void;
  onClose?: () => void;
}

export function openGameSocket({
  gameType,
  playerIds,
  hostId,
  topic,
  debateTeams,
  werewolfMode,
  clientViewMode,
  debugMode,
  replayView,
  replayGameId,
  onEvent,
  onError,
  onClose
}: OpenGameSocketOptions): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/toc/ws/game`);

  socket.onopen = () => {
    const payload: GameSocketStartPayload = {
      type: 'start',
      mode: 'real',
      gameType,
      playerIds,
      hostId,
      topic,
      debateTeams,
      werewolfMode,
      clientViewMode,
      debugMode,
      replayView,
      replayGameId: replayGameId || undefined
    };
    socket.send(JSON.stringify(payload));
  };

  socket.onmessage = (message) => {
    onEvent(JSON.parse(message.data) as GameEvent, socket);
  };

  socket.onerror = () => {
    onError(new Error('WebSocket 连接失败，请检查后端服务。'));
  };

  socket.onclose = () => {
    onClose?.();
  };

  return socket;
}
