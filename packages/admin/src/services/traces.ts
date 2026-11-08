import type { MatchTraceDto, TraceMatchDto, TraceNodeDetailDto } from '@battle/shared';
import { http } from './http';
import { notifyTraceRemoved } from './traceInvalidation';

const traces = '/api/admin/traces';
export async function deleteTrace(id: string) {
  await http.del<null>(`${traces}/${encodeURIComponent(id)}`);
  notifyTraceRemoved(id);
}
export const listTraces = (offset: number, limit: number) => http.get<TraceMatchDto[]>(`${traces}?offset=${offset}&limit=${limit}`);
export const fetchTrace = (id: string) => http.get<MatchTraceDto>(`${traces}/${encodeURIComponent(id)}`);
export const fetchTraceNode = (id: string, node: number) => http.get<TraceNodeDetailDto>(`${traces}/${encodeURIComponent(id)}/nodes/${node}`);
