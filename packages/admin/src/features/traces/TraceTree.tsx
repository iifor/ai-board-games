import type { MatchTraceDto, TraceNodeDto } from '@battle/shared';
import { Tree } from 'antd';
import type { DataNode } from 'antd/es/tree';
import { useMemo } from 'react';
import { KIND_LABELS, traceLabel } from './labels';

interface Branch extends DataNode { children: Branch[]; nodeId?: number }

function branch(key: string, title: string, nodeId?: number): Branch {
  return { key, title, children: [], ...(nodeId !== undefined ? { nodeId } : { selectable: false }) };
}

/** 一次阶段访问对应一个分组；并行计票留在阶段下，逐票关联在节点详情中展开。 */
function buildTree(nodes: readonly TraceNodeDto[], calls: MatchTraceDto['calls']) {
  const roots: Branch[] = [];
  const rounds = new Map<number, Branch>();
  const phases = new Map<string, Branch>();
  const requests = new Map<string, Branch>();
  for (const n of nodes) {
    let round = rounds.get(n.round);
    if (!round) {
      round = branch('round-' + n.round, '第 ' + n.round + ' 轮');
      rounds.set(n.round, round);
      roots.push(round);
    }
    const phaseKey = JSON.stringify([n.round, n.phaseId, n.visit]);
    let group = phases.get(phaseKey);
    if (!group) {
      const visit = n.visit > 0 ? '第 ' + n.visit + ' 次进入' : '进入前';
      group = branch(phaseKey, n.phaseId ? n.phaseId + ' · ' + visit : '对局');
      phases.set(phaseKey, group);
      round.children.push(group);
    }
    if (n.kind === 'phase') {
      group.title = n.label + ' · ' + n.phaseId + '（' + n.visit + '）';
      group.nodeId = n.id;
      group.selectable = true;
      continue;
    }
    const label = traceLabel(n.label);
    const caption = [KIND_LABELS[n.kind], n.seat === null ? '' : n.seat + ' 号', label === KIND_LABELS[n.kind] ? '' : label,
      n.seq === null ? '' : '#' + n.seq, n.requestIds.length > 1 ? n.requestIds.length + ' 个行动' : ''].filter(Boolean).join(' · ');
    const item = branch('node-' + n.id, caption, n.id);
    const direct = n.requestIds.length === 1 && n.requestIds[0] ? requests.get(n.requestIds[0]) : undefined;
    (direct ?? group).children.push(item);
    if (n.kind === 'request' && n.requestIds[0]) requests.set(n.requestIds[0], item);
  }
  // 模型传输尝试发生在决策之前。保持重试与备用模型的实际调用顺序。
  for (let i = calls.length - 1; i >= 0; i--) {
    const call = calls[i]!;
    const parent = requests.get(call.requestId);
    if (parent) parent.children.unshift(branch('call-' + call.id,
      call.modelName + ' · ' + (call.error ? '失败' : '成功') + ' · ' + call.latencyMs + ' ms', parent.nodeId));
  }
  return roots;
}

export function TraceTree({ nodes, calls, onOpen }: {
  nodes: readonly TraceNodeDto[]; calls: MatchTraceDto['calls']; onOpen: (id: number) => void;
}) {
  const tree = useMemo(() => buildTree(nodes, calls), [nodes, calls]);
  return <Tree<Branch> treeData={tree} showLine height={530} defaultExpandedKeys={tree.slice(0, 1).map((n) => n.key)}
    onSelect={(_, info) => { if (info.node.nodeId !== undefined) onOpen(info.node.nodeId); }} />;
}
