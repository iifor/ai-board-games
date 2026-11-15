import type { MatchTraceDto, TraceNodeDto } from '@battle/shared';
import { describe, expect, it } from 'vitest';
import { buildTraceTree, issueNodeIds, matchingBranches } from './traceTreeData';
import { filterNodes } from './filterNodes';

function node(id: number, kind: TraceNodeDto['kind'], label: string, requestIds: string[] = []): TraceNodeDto {
  return { id, kind, label, requestIds, round: 1, phaseId: 'witch_poison', visit: 1, seq: null, seat: null, inputRequestId: null, createdAt: '' };
}
const nodes = [
  node(1, 'phase', 'witch_poison'), node(2, 'request', 'act', ['a']), node(3, 'decision', '校验拒绝', ['a']),
  node(4, 'request', 'act', ['b']), node(5, 'decision', '采纳', ['b']),
  { ...node(6, 'settlement', '规则结算', ['a', 'b']), seq: 17 },
  { ...node(7, 'phase', 'witch_poison'), visit: 2 },
];
const calls: MatchTraceDto['calls'] = [
  { id: 10, requestId: 'a', modelName: 'A', seat: 2, latencyMs: 820, createdAt: '', error: 'timeout' },
  { id: 11, requestId: 'a', modelName: 'B', seat: 2, latencyMs: 120, createdAt: '', error: null },
];

describe('调用树', () => {
  it('按访问分组，保留并行结算与尝试顺序，只汇总实测延迟', () => {
    const [first, second] = buildTraceTree(nodes, calls)[0]!.children;
    expect(first).toMatchObject({ title: '使用毒药', hint: '', records: 6, calls: 2, requests: 2, longest: 820 });
    expect(first!.children.map(n => n.nodeId)).toEqual([2, 4, 6]);
    expect(first!.children[0]!.children.map(n => n.title)).toEqual(['A', 'B', '决策 · 校验拒绝']);
    expect(first!.issues).toEqual(new Set(['调用失败', '校验拒绝']));
    expect(second).toMatchObject({ hint: '第 2 次进入', longest: null, calls: 0 });
    expect(buildTraceTree(nodes, [])[0]!.longest).toBeNull();
  });

  it('显示真实异常，按事件号筛选时只展开命中的路径', () => {
    expect(issueNodeIds(nodes, calls)).toEqual(new Set([2, 3]));
    const keys: string[] = [];
    const tree = matchingBranches(buildTraceTree(nodes, calls), new Set([3]), keys);
    const path = tree[0]!.children[0]!;
    expect(path.children).toHaveLength(1);
    expect(path.children[0]!.children.map(n => n.nodeId)).toEqual([3]);
    expect(keys).toContain(path.key);
    const results = filterNodes(nodes, '#17');
    expect(results.map(n => n.id)).toEqual([6]);
    expect(filterNodes(nodes, '使用毒药')).toHaveLength(nodes.length);
  });
});
