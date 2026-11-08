import type { TraceNodeDto } from '@battle/shared';
import { describe, expect, it } from 'vitest';
import { filterNodes } from './filterNodes';

function node(id: number, fields: Partial<TraceNodeDto>): TraceNodeDto {
  return { id, kind: 'stage', label: 'speech', round: 1, phaseId: 'wolf_chat', visit: 1, seat: null,
    seq: null, requestIds: [], inputRequestId: null, createdAt: '', ...fields };
}

const nodes = [
  node(1, { seq: 4, seat: 2 }),
  node(2, { seq: 40, requestIds: ['vote#4'] }),
  node(3, { kind: 'request', label: 'vote', seat: 3, requestIds: ['vote#4'] }),
];

describe('整局调用链筛选', () => {
  it('以完整事件序号匹配，允许搜索首尾空格', () => {
    expect(filterNodes(nodes, ' #4 ')).toEqual([nodes[0]]);
    expect(filterNodes(nodes, '#400')).toEqual([]);
  });

  it('按玩家筛选时包含直接关联的请求，可以叠加类型和搜索词', () => {
    expect(filterNodes(nodes, 'VOTE#4', 'stage', 3)).toEqual([nodes[1]]);
    expect(filterNodes(nodes, '', undefined, 3)).toEqual(nodes.slice(1));
  });

  it('支持阶段名和界面上的中文标签', () => {
    expect(filterNodes(nodes, 'WOLF_CHAT')).toEqual(nodes);
    expect(filterNodes(nodes, '玩家发言')).toEqual(nodes.slice(0, 2));
  });
});
