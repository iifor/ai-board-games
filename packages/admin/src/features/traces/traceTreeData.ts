import type { MatchTraceDto, TraceNodeDto } from '@battle/shared';
import { KIND_LABELS, phaseLabel, traceLabel } from './labels';

export interface TraceBranch {
  key: string;
  title: string;
  type: 'round' | 'phase' | 'event' | 'call';
  children: TraceBranch[];
  nodeId?: number;
  callId?: number;
  hint: string;
  requests: number;
  records: number;
  calls: number;
  longest: number | null;
  issues: Set<string>;
}

function branch(key: string, title: string, type: TraceBranch['type'], hint = ''): TraceBranch {
  return { key, title, type, hint, children: [], requests: 0, records: 0, calls: 0, longest: null, issues: new Set() };
}

type Calls = MatchTraceDto['calls'];

function decisionIssue(node: TraceNodeDto) {
  if (node.kind === 'failure') return '失败';
  if (node.kind === 'decision' && (node.label === '兜底' || node.label === '校验拒绝')) return node.label;
  if (node.kind === 'log' && node.label === 'fallback') return '兜底';
  return null;
}

export function issueNodeIds(nodes: readonly TraceNodeDto[], calls: Calls) {
  const failedRequests = new Set(calls.filter(c => c.error !== null).map(c => c.requestId));
  return new Set(nodes.filter(n => decisionIssue(n) ||
    (n.kind === 'request' && n.requestIds.some(id => failedRequests.has(id)))).map(n => n.id));
}

function summarize(row: TraceBranch) {
  for (const child of row.children) {
    summarize(child);
    row.records += child.records;
    row.requests += child.requests;
    row.calls += child.calls;
    if (child.longest !== null) {
      row.longest = row.longest === null ? child.longest : Math.max(row.longest, child.longest);
    }
    for (const issue of child.issues) row.issues.add(issue);
  }
}

export function buildTraceTree(nodes: readonly TraceNodeDto[], calls: Calls) {
  const rounds = new Map<number, TraceBranch>();
  const phases = new Map<string, TraceBranch>();
  const requests = new Map<string, TraceBranch>();
  const titles = new Map(nodes.filter(n => n.kind === 'phase' && n.label && n.label !== n.phaseId)
    .map(n => [n.phaseId, traceLabel(n.label)]));
  for (const n of nodes) {
    let round = rounds.get(n.round);
    if (!round) {
      round = branch('round-' + n.round, '第 ' + n.round + ' 轮', 'round');
      rounds.set(n.round, round);
    }
    const key = JSON.stringify([n.round, n.phaseId, n.visit]);
    let phase = phases.get(key);
    if (!phase) {
      const visit = n.visit === 0 ? '进入前' : n.visit > 1 ? '第 ' + n.visit + ' 次进入' : '';
      phase = branch(key, titles.get(n.phaseId) ?? phaseLabel(n.phaseId), 'phase', visit);
      phases.set(key, phase);
      round.children.push(phase);
    }
    if (n.kind === 'phase') {
      if (n.label && n.label !== n.phaseId) phase.title = traceLabel(n.label);
      phase.nodeId = n.id;
      phase.records++;
      continue;
    }
    const label = traceLabel(n.label);
    const hint = [n.seat !== null && n.seat + ' 号', n.seq !== null && '#' + n.seq,
      n.requestIds.length > 1 && n.requestIds.length + ' 个关联行动'].filter(Boolean).join(' · ');
    const item = branch('node-' + n.id, label === KIND_LABELS[n.kind] ? label : KIND_LABELS[n.kind] + ' · ' + label, 'event', hint);
    item.nodeId = n.id;
    item.records = 1;
    const issue = decisionIssue(n);
    if (issue) item.issues.add(issue);
    const requestId = n.requestIds.length === 1 ? n.requestIds[0] : undefined;
    if (n.kind === 'request') {
      item.requests = 1;
      phase.children.push(item);
      if (requestId) requests.set(requestId, item);
    } else {
      // 并行计票和结算可关联多个请求，仅直接关联单个请求时作为其子节点。
      ((requestId && requests.get(requestId)) || phase).children.push(item);
    }
  }
  // 接口按调用 ID 排序，同一请求的调用尝试排在决策之前。
  const attempts = new Map<TraceBranch, TraceBranch[]>();
  for (const call of calls) {
    const parent = requests.get(call.requestId);
    if (!parent || parent.nodeId === undefined) continue;
    const children = attempts.get(parent) ?? [];
    const item = branch('call-' + call.id, call.modelName, 'call', '第 ' + (children.length + 1) + ' 次调用');
    item.nodeId = parent.nodeId;
    item.callId = call.id;
    item.calls = 1;
    item.longest = call.latencyMs;
    if (call.error !== null) item.issues.add('调用失败');
    children.push(item);
    attempts.set(parent, children);
  }
  for (const [parent, children] of attempts) parent.children = children.concat(parent.children);
  const roots = [...rounds.values()];
  roots.forEach(summarize);
  return roots;
}

/** 保留命中节点、直接请求的调用明细和抵达命中位置所需的父级。汇总始终来自完整阶段。 */
export function matchingBranches(rows: TraceBranch[], ids: ReadonlySet<number>, expanded: string[]): TraceBranch[] {
  return rows.flatMap(row => {
    const children = matchingBranches(row.children, ids, expanded);
    if (children.length) expanded.push(row.key);
    if (!children.length && (row.nodeId === undefined || !ids.has(row.nodeId))) return [];
    return [{ ...row, children }];
  });
}
