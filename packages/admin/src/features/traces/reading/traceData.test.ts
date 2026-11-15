import type { MatchTraceDto } from '@battle/shared';
import { expect, it } from 'vitest';
import { dataFacts, readSnapshot } from './traceData';

const match: MatchTraceDto['match'] = { id: 'm', gameKey: 'werewolf', variantKey: null, scripted: true,
  createdAt: '', status: 'paused', error: null, seats: [{ seat: 2, playerId: null, name: '二号玩家' }], roleNames: { witch: '女巫' } };

it('使用节点当时的角色和生死，用名册补全结算快照中的玩家名', () => {
  const data = { seats: [{ seat: 2, role: 'witch', team: 'good', alive: false },
    { seat: 1, role: 'new_role', profile: { name: '一号玩家' } }], state: {
    board: { name: '预女猎白', rules: '规则文本' }, sheriff: null, potions: { poison: false, antidote: true },
    night: { wolfTarget: 2, saved: false, guarded: null },
  } };
  expect(readSnapshot(data, match)).toMatchObject({ boardName: '预女猎白', rules: '规则文本',
    seats: [{ seat: 1, role: 'new_role', alive: null, name: '一号玩家' }, { seat: 2, name: '二号玩家', role: '女巫', alive: false }],
    status: [['警长','暂无警长'], ['女巫解药','可用'], ['女巫毒药','已用完']], night: [['狼刀目标','2 号']] });
});

it('未采集的数据不被推断为已用药或已有警长，也支持辩题和非快照节点', () => {
  expect(readSnapshot({ state: { potions: { antidote: false } } }, match)).toMatchObject({
    status: [['女巫解药','已用完'],['女巫毒药','未记录']], hasNight: false });
  expect(readSnapshot({ state: { topic: { title: '辩题', pro: '支持', con: '反对' } } }, { ...match, gameKey: 'debate' }))
    .toMatchObject({ topic: '辩题', pro: '支持', con: '反对', status: [] });
  expect(readSnapshot(null, match)).toBe(null);
  expect(readSnapshot({ seats: [{ seat: 1, role: 'villager' }], state: { potions: { antidote: true, poison: true } } }, match)?.status).toEqual([]);
  expect(dataFacts({ configuredNext: 'night_reset', applied: { targets: [2,3] } }))
    .toEqual([['下一阶段','夜间状态重置'], ['采纳的行动','目标座位：2、3']]);
});
