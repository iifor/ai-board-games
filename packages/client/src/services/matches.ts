import type { CreateMatchRequest, MatchSummaryDto } from '@battle/shared';
import { http } from './http';

export const createMatch = (request: CreateMatchRequest) => http.post<MatchSummaryDto>('/api/toc/matches', request);
export const fetchMatch = (id: string) => http.get<MatchSummaryDto>(`/api/toc/matches/${encodeURIComponent(id)}`);
export const fetchHistory = () => http.get<MatchSummaryDto[]>('/api/toc/matches?limit=50');

export function matchStreamUrl(id: string, location: Pick<Location, 'protocol' | 'host'> = window.location): string {
  const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${scheme}://${location.host}/api/toc/ws/matches/${encodeURIComponent(id)}`;
}
