import type { AudienceSeat, AudienceView, MatchSummaryDto } from '@battle/shared';

/** 舞台测试共用的夹具：辩论赛观众视图（1 号正方、2 号反方、3 号评委且已出局）、事件元信息、对局概要 */
export const seat = (no: number, team: string | null, position: number | null = null): AudienceSeat => ({
  seat: no, name: `玩家${no}`, avatar: null, label: `${no}号 玩家${no}`, alive: no !== 3,
  role: team, roleName: team ? `角色${team}` : null, team, position,
});

export const view: AudienceView = {
  gameKey: 'debate', title: 'AI 辩论赛', round: 1, phase: { id: 'opening', title: '立论' }, status: 'running',
  seats: [seat(1, 'pro', 1), seat(2, 'con', 1), seat(3, 'judge')],
  extra: { topic: { title: '测试辩题', pro: '支持', con: '反对' } },
  result: null,
};

export const meta = { seq: 1, round: 1, phaseId: 'opening', channel: 'public' as const, view };

export const summary: MatchSummaryDto = {
  id: 'm_1', gameKey: 'debate', gameTitle: 'AI 辩论赛', variantKey: null, variantName: null, layout: 'versus', status: 'completed', debug: false, scripted: true,
  seats: [{ seat: 1, playerId: 5, name: '玩家1' }, { seat: 2, playerId: null, name: '玩家2' }],
  result: { winner: 'pro', winnerLabel: '正方胜出', summary: '正方胜出（评委 2:1）', mvp: 1, endReason: 'normal' },
  createdAt: '2026-11-01T00:00:00Z', completedAt: null,
};
