import type { TraceNodeDto } from '@battle/shared';
import type { LogEntryDto } from '../../../../services/matches';
import { phaseLabel } from '../../../traces/labels';

export interface PhaseVisit {
  phaseId: string;
  title: string;
  round: number;
  visit?: number;
  nodeId?: number;
  seq?: number;
}

/** 接口按采集顺序返回。相邻、同轮且同名的两次进入也必须分别保留。 */
export function recordedVisits(nodes: readonly TraceNodeDto[]): PhaseVisit[] {
  return nodes.flatMap(n => n.kind === 'phase' && n.phaseId ? [{
    phaseId:n.phaseId, title:n.label === n.phaseId ? phaseLabel(n.phaseId) : n.label,
    round:n.round, visit:n.visit, nodeId:n.id,
  }] : []);
}

export function announcedVisits(log: readonly LogEntryDto[]): PhaseVisit[] {
  return log.flatMap(e => e.kind === 'phase_started' && e.phaseId ? [{
    phaseId:e.phaseId, title:e.title, round:e.round, seq:e.seq,
  }] : []);
}
