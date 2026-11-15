import type { MatchTraceDto, TraceNodeDto } from '@battle/shared';
import { expect, it } from 'vitest';
import { requestOptions } from './requestOptions';

const node: TraceNodeDto = {
  id: 1, kind: 'phase', label: '自由辩论', phaseId: 'crossfire', visit: 1, round: 2, seat: null,
  seq: null, createdAt: '', requestIds: [], inputRequestId: null,
};
const trace: MatchTraceDto = {
  match: { id: 'demo', gameKey: 'debate', variantKey: null, status: 'completed', scripted: true,
    createdAt: '', error: null, seats: [{ seat: 3, playerId: null, name: '小林' }] },
  nodes: [node,
    { ...node, id: 2, kind: 'request', seat: 3, label: 'speak', requestIds: ['q1'], inputRequestId: 'previous' },
    { ...node, id: 3, kind: 'request', seat: 3, label: 'speak', requestIds: ['q2'], inputRequestId: 'q1' },
    { ...node, id: 4, kind: 'decision', requestIds: ['q1', 'unrelated'] },
    { ...node, id: 5, kind: 'request', seat: 3, label: 'speak', requestIds: ['q2'] }],
  calls: [], models: [],
};

it('按最新请求排序并去重，只对直接请求生成选项，脚本局也可按玩家和阶段检索', () => {
  const options = requestOptions(trace);
  expect(options.map(o => [o.value, o.nodeId])).toEqual([['q2', 3], ['q1', 2]]);
  for (const term of ['3号', '小林', '自由辩论', 'crossfire', '发言', 'q2']) expect(options[0]?.search).toContain(term);
  expect(requestOptions({ ...trace, nodes: [] })).toEqual([]);
});
