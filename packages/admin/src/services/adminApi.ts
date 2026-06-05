import type { AdminRequestOptions } from '../types/api';
import { AdminApiError } from '../types/api';

export async function adminRequest<T = unknown>(
  path: string,
  options: AdminRequestOptions = {}
): Promise<T> {
  const response = await fetch(`/api/admin${path}`, {
    method: options.method,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers ?? {})
    },
    body: options.body
  });
  const data = await response.json().catch(() => null) as Record<string, unknown> | null;
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

export function getWorkflowDebug(matchId: string) {
  return adminRequest<Record<string, unknown>>(`/workflow/matches/${encodeURIComponent(matchId)}/debug`);
}

export function tickWorkflowMatch(matchId: string) {
  return adminRequest<Record<string, unknown>>(`/workflow/matches/${encodeURIComponent(matchId)}/tick`, { method: 'POST' });
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
