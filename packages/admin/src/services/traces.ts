import type { MatchTraceDto, TraceNodeDetailDto } from '@battle/shared';
import { http } from './http';
import { notifyTraceRemoved } from './traceInvalidation';
import type { PromptComparisonContext, PromptComparisonInput, PromptComparisonRecord } from '@battle/shared';

const traces = '/api/admin/traces';
const comparisons = (id: string, request: string) => `${traces}/${encodeURIComponent(id)}/requests/${encodeURIComponent(request)}/comparisons`;
export const comparisonContext = (id: string, request: string) => http.get<PromptComparisonContext>(comparisons(id, request));
export const comparePrompts = (id: string, request: string, input: PromptComparisonInput) =>
  http.post<PromptComparisonRecord>(comparisons(id, request), input);
export const applyComparison = (id: string, request: string, comparison: number) =>
  http.post<{ comparisonId: number }>(comparisons(id, request) + '/' + comparison + '/apply', {});
export async function deleteTrace(id: string) {
  await http.del<null>(`${traces}/${encodeURIComponent(id)}`);
  notifyTraceRemoved(id);
}
export const fetchTrace = (id: string) => http.get<MatchTraceDto>(`${traces}/${encodeURIComponent(id)}`);
export const fetchTraceNode = (id: string, node: number) => http.get<TraceNodeDetailDto>(`${traces}/${encodeURIComponent(id)}/nodes/${node}`);
