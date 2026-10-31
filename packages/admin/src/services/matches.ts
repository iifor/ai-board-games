import type {
  AiCallDto,
  CreateDebugMatchRequest,
  DebugCommandRequest,
  GameCatalogItem,
  MatchDetailDto,
  MatchStatus,
  MatchSummaryDto,
  PhaseGraphDto,
  StageEventMeta,
  StagePayload,
} from '@battle/shared';
import { http } from './http';

/** 后台看到的完整日志条目（含私密与 host 频道） */
export type LogEntryDto = StagePayload & StageEventMeta;

export interface MatchFilter {
  readonly status?: MatchStatus;
  readonly debug?: boolean;
}

export function listMatches(filter: MatchFilter = {}): Promise<MatchSummaryDto[]> {
  const query = new URLSearchParams({ limit: '100' });
  if (filter.status) query.set('status', filter.status);
  if (filter.debug !== undefined) query.set('debug', String(filter.debug));
  return http.get<MatchSummaryDto[]>(`/api/admin/matches?${query.toString()}`);
}

const base = (id: string) => `/api/admin/matches/${encodeURIComponent(id)}`;

export const fetchMatchDetail = (id: string) => http.get<MatchDetailDto>(base(id));
export const fetchMatchLog = (id: string) => http.get<LogEntryDto[]>(`${base(id)}/log`);
export const fetchAiCalls = (id: string) => http.get<AiCallDto[]>(`${base(id)}/ai-calls`);
export const sendDebugCommand = (id: string, command: DebugCommandRequest['command']) => http.post<MatchDetailDto>(`${base(id)}/debug`, { command });
export const deleteMatch = (id: string) => http.del<null>(base(id));
export const createDebugMatch = (request: CreateDebugMatchRequest) => http.post<MatchSummaryDto>('/api/admin/matches', request);
export const fetchCatalog = () => http.get<GameCatalogItem[]>('/api/toc/games');
export const fetchPhaseGraph = (gameKey: string) => http.get<PhaseGraphDto>(`/api/admin/games/${encodeURIComponent(gameKey)}/phases`);
