import type { AdminRequestOptions } from '../types/api';
import { AdminApiError } from '../types/api';

const TOKEN_KEY = 'admin_jwt_token';
const PASSWORD_CHANGE_REQUIRED_KEY = 'admin_password_change_required';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string, mustChangePassword = false): void {
  localStorage.setItem(TOKEN_KEY, token);
  if (mustChangePassword) {
    localStorage.setItem(PASSWORD_CHANGE_REQUIRED_KEY, '1');
  } else {
    localStorage.removeItem(PASSWORD_CHANGE_REQUIRED_KEY);
  }
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(PASSWORD_CHANGE_REQUIRED_KEY);
}

export function requiresPasswordChange(): boolean {
  return localStorage.getItem(PASSWORD_CHANGE_REQUIRED_KEY) === '1';
}

export async function adminRequest<T = unknown>(
  path: string,
  options: AdminRequestOptions = {}
): Promise<T> {
  const token = getToken();
  const authHeaders: Record<string, string> = token
    ? { Authorization: `Bearer ${token}` }
    : {};
  const response = await fetch(`/api/admin${path}`, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...authHeaders,
      ...(options.headers ?? {})
    },
    body: options.body
  });
  if (response.status === 401) {
    clearToken();
    window.location.hash = '#/login';
    throw new AdminApiError('登录已过期，请重新登录');
  }
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
  if (response.status === 403 && data?.code === 'PASSWORD_CHANGE_REQUIRED') {
    localStorage.setItem(PASSWORD_CHANGE_REQUIRED_KEY, '1');
    window.location.hash = '#/change-password';
    throw new AdminApiError('请先修改初始密码');
  }
  if (!response.ok) {
    throw new AdminApiError(
      (data?.message as string) || '后台请求失败',
      data?.template,
      data
    );
  }
  return (data?.code === 0 && Object.prototype.hasOwnProperty.call(data, 'data')
    ? data.data
    : data) as T;
}

export interface PasswordChangeResult {
  token: string;
  mustChangePassword: false;
  user: {
    id: number;
    username: string;
    displayName: string;
  };
}

export function changePassword(password: string) {
  return adminRequest<PasswordChangeResult>('/auth/change-password', {
    method: 'POST',
    body: JSON.stringify({ password }),
  });
}

export function getWorkflowDebug(matchId: string) {
  return adminRequest<Record<string, unknown>>(`/workflow/matches/${encodeURIComponent(matchId)}/debug`);
}

export function tickWorkflowMatch(matchId: string) {
  return adminRequest<Record<string, unknown>>(`/workflow/matches/${encodeURIComponent(matchId)}/tick`, { method: 'POST' });
}

export type UndercoverDebugAction = 'continue' | 'skip' | 'continuous';

export function controlUndercoverDebugMatch(
  matchId: string,
  interruptId: string,
  action: UndercoverDebugAction,
) {
  return adminRequest<Record<string, unknown>>(`/workflow/matches/${encodeURIComponent(matchId)}/debug-control`, {
    method: 'POST',
    body: JSON.stringify({ interruptId, action }),
  });
}

export function retryWorkflowAiTask(taskId: string) {
  return adminRequest<Record<string, unknown>>(`/workflow/ai-tasks/${encodeURIComponent(taskId)}/retry`, { method: 'POST' });
}

export function cancelWorkflowAiTask(taskId: string, reason = 'debug cancel') {
  return adminRequest<Record<string, unknown>>(`/workflow/ai-tasks/${encodeURIComponent(taskId)}/cancel`, {
    method: 'POST',
    body: JSON.stringify({ reason })
  });
}

export function createWorkflowInterrupt(matchId: string, payload: Record<string, unknown>) {
  return adminRequest<Record<string, unknown>>(`/workflow/matches/${encodeURIComponent(matchId)}/interrupts`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export function resolveWorkflowInterrupt(interruptId: string, payload: Record<string, unknown>) {
  return adminRequest<Record<string, unknown>>(`/workflow/interrupts/${encodeURIComponent(interruptId)}/resolve`, {
    method: 'POST',
    body: JSON.stringify(payload)
  });
}

export interface PlayerMemoryStats {
  total: number;
  lastUpdatedAt: string | null;
  games: Array<{
    gameType: 'werewolf' | 'debate';
    count: number;
    lastUpdatedAt: string | null;
  }>;
}

export function getPlayerMemoryStats() {
  return adminRequest<PlayerMemoryStats>('/player-memories/stats');
}

export function clearPlayerMemories(gameType: 'werewolf' | 'debate' | 'all') {
  return adminRequest<{ gameType: string; deletedCount: number }>('/player-memories/clear', {
    method: 'POST',
    body: JSON.stringify({ gameType }),
  });
}

export interface PlayerMemoryRecord {
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

export interface PaginatedMemories {
  items: PlayerMemoryRecord[];
  total: number;
  page: number;
  pageSize: number;
}

export function getPlayerMemories(params?: {
  gameType?: string;
  page?: number;
  pageSize?: number;
}) {
  const searchParams = new URLSearchParams();
  if (params?.gameType) searchParams.set('gameType', params.gameType);
  if (params?.page) searchParams.set('page', String(params.page));
  if (params?.pageSize) searchParams.set('pageSize', String(params.pageSize));
  const query = searchParams.toString();
  return adminRequest<PaginatedMemories>(
    `/player-memories${query ? `?${query}` : ''}`,
  );
}
