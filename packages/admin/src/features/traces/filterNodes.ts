import type { TraceKind, TraceNodeDto } from '@battle/shared';
import { traceLabel } from './labels';

export function filterNodes(nodes: readonly TraceNodeDto[], search: string, kind?: TraceKind, seat?: number) {
  const query = search.trim().toLowerCase();
  const seq = /^#\d+$/.test(query) ? Number(query.slice(1)) : null;
  const playerRequests = new Set(nodes.filter((n) => n.kind === 'request' && n.seat === seat).flatMap((n) => n.requestIds));
  return nodes.filter((n) => {
    if (kind && n.kind !== kind) return false;
    if (seat !== undefined && n.seat !== seat && !n.requestIds.some((id) => playerRequests.has(id))) return false;
    if (seq !== null) return n.seq === seq;
    return !query || [n.phaseId, n.label, traceLabel(n.label), ...n.requestIds].join(' ').toLowerCase().includes(query);
  });
}
