import type { MatchTraceDto } from '@battle/shared';
import { phaseLabel, traceLabel } from '../../traces/labels';

export interface RequestOption {
  readonly value: string;
  readonly nodeId: number;
  readonly label: string;
  readonly search: string;
}

export function requestOptions(trace: MatchTraceDto): RequestOption[] {
  const players = new Map(trace.match.seats.map(player => [player.seat, player.name]));
  const phases = new Map<string, string>();
  const requests = new Map<string, RequestOption>();
  for (const node of trace.nodes) {
    if (node.kind === 'phase' && node.phaseId) {
      phases.set(node.phaseId, node.label === node.phaseId ? phaseLabel(node.phaseId) : node.label);
    }
    if (node.kind !== 'request') continue;
    const phase = phases.get(node.phaseId ?? '') ?? phaseLabel(node.phaseId);
    const seat = node.seat === null ? '' : `${node.seat}号 ${players.get(node.seat) ?? ''}`.trim();
    const label = [`第 ${node.round} 轮`, phase, seat, traceLabel(node.label)].filter(Boolean).join(' · ');
    for (const id of node.requestIds) {
      if (!requests.has(id)) requests.set(id, { value: id, nodeId: node.id, label, search: [label, id, node.phaseId, node.label].join(' ') });
    }
  }
  return [...requests.values()].reverse();
}
