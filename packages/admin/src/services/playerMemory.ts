import type { ForgetMemoryResult, MemoryReviewCallPage, PlayerMemoryPage } from '@battle/shared';
import { http } from './http';

export function playerMemory(id: number, offset: number, game?: string, subject?: number) {
  const params = new URLSearchParams({ offset: String(offset), limit: '10' });
  if (game) params.set('gameKey', game);
  if (subject) params.set('subjectId', String(subject));
  return http.get<PlayerMemoryPage>('/api/admin/player-memory/players/' + id + '?' + params);
}

export function memoryReviewCalls(id: number, offset: number, limit: number) {
  return http.get<MemoryReviewCallPage>(`/api/admin/player-memory/players/${id}/calls?offset=${offset}&limit=${limit}`);
}

export function forgetPlayerMemory(owner: number, memoryId?: number) {
  const base = '/api/admin/player-memory/players/' + owner;
  return http.del<ForgetMemoryResult>(memoryId === undefined ? base : base + '/memories/' + memoryId);
}
