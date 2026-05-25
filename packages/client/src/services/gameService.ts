import type { Player, GameEvent } from '../types';

export async function fetchAiPlayers(): Promise<Player[]> {
  const data = await fetchAiHealth();
  return data.players || [];
}

export async function fetchAiHealth(): Promise<Record<string, any>> {
  const response = await fetch('/api/toc/health');
  if (!response.ok) throw new Error('无法获取 AI 玩家配置');
  return parseApiData(response);
}

export async function fetchPlayerSelections(): Promise<Record<string, number[]>> {
  const response = await fetch('/api/toc/player-selections');
  if (!response.ok) throw new Error('无法获取玩家选择配置');
  const data = await parseApiData(response);
  return data.selections || {};
}

export async function fetchRecentGames(gameType: string, limit: number = 10): Promise<Record<string, unknown>[]> {
  const response = await fetch(`/api/toc/games/recent?gameType=${encodeURIComponent(gameType)}&limit=${encodeURIComponent(limit)}`);
  if (!response.ok) throw new Error('无法获取历史对局');
  const data = await parseApiData(response);
  return Array.isArray(data.games)
    ? data.games.filter((game: Record<string, unknown>) => game.gameType === gameType)
    : [];
}

export async function fetchWerewolfModes(): Promise<Record<string, unknown>> {
  const response = await fetch('/api/toc/werewolf-modes');
  if (!response.ok) throw new Error('无法获取狼人杀模式');
  return parseApiData(response);
}

export async function fetchGameDetail(id: string): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/toc/games/${encodeURIComponent(id)}`);
  if (!response.ok) throw new Error('无法获取对局详情');
  return parseApiData(response);
}

export async function savePlayerSelection(gameType: string, playerIds: number[]): Promise<Record<string, unknown>> {
  const response = await fetch(`/api/toc/player-selections/${gameType}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ playerIds })
  });
  if (!response.ok) {
    const data = await response.json().catch(() => ({}));
    throw new Error(data.error || data.message || '保存玩家选择失败');
  }
  return parseApiData(response);
}

async function parseApiData(response: Response): Promise<any> {
  const payload = await response.json();
  return payload?.code === 0 && Object.prototype.hasOwnProperty.call(payload, 'data')
    ? payload.data
    : payload;
}

export interface OpenGameSocketOptions {
  gameType?: string;
  playerIds?: number[];
  hostId?: number | string;
  topic?: Record<string, unknown> | null;
  debateTeams?: Record<string, unknown> | null;
  werewolfMode?: string;
  clientViewMode?: string;
  replayView?: boolean;
  replayGameId?: string;
  onEvent: (event: GameEvent, socket: WebSocket) => void;
  onError: (error: Error) => void;
  onClose?: () => void;
}

export function openGameSocket({
  gameType = 'debate',
  playerIds,
  hostId,
  topic,
  debateTeams,
  werewolfMode,
  clientViewMode,
  replayView,
  replayGameId,
  onEvent,
  onError,
  onClose
}: OpenGameSocketOptions): WebSocket {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const socket = new WebSocket(`${protocol}//${window.location.host}/api/toc/ws/game`);

  socket.onopen = () => {
    socket.send(JSON.stringify({ type: 'start', mode: 'real', gameType, playerIds, hostId, topic, debateTeams, werewolfMode, clientViewMode, replayView, replayGameId }));
  };

  socket.onmessage = (message) => {
    onEvent(JSON.parse(message.data), socket);
  };

  socket.onerror = () => {
    onError(new Error('WebSocket 连接失败，请检查后端服务。'));
  };

  socket.onclose = () => {
    onClose?.();
  };

  return socket;
}
