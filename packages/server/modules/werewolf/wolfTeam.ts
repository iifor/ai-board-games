import { rotateFromSeat, sortBySeat } from './utils';
import type { Agent, Round, Runtime } from './reducers';

interface WolfTeamContext {
  wolfIds: number[];
  wolfLeaderId: number | null;
  wolfSpeechOrder: number[];
  wolfSharedInfo: string;
}

function ensureWolfTeamContext(runtime: Runtime, round: Round): WolfTeamContext {
  const night = round.night;
  const wolves = sortBySeat(runtime.agents.filter((agent) => agent.alive && agent.faction === 'wolves'));
  const existingLeader = Number(night.wolfLeaderId || 0);
  const leader = wolves.find((wolf) => Number(wolf.id) === existingLeader) || selectWolfLeader(wolves);
  const order = leader ? rotateFromSeat(wolves, leader.id, 'clockwise') : wolves;
  night.wolfIds = wolves.map((wolf) => wolf.id);
  night.wolfLeaderId = leader?.id || null;
  night.wolfSpeechOrder = order.map((wolf) => wolf.id);
  night.wolfSharedInfo = buildWolfSharedInfo(wolves, leader?.id || null);
  return {
    wolfIds: night.wolfIds,
    wolfLeaderId: night.wolfLeaderId,
    wolfSpeechOrder: night.wolfSpeechOrder,
    wolfSharedInfo: night.wolfSharedInfo
  };
}

function selectWolfLeader(wolves: Agent[]): Agent | null {
  if (!wolves.length) return null;
  const ranked = [...wolves].sort((a, b) => wolfLeaderPriority(b) - wolfLeaderPriority(a));
  const topPriority = wolfLeaderPriority(ranked[0]);
  const top = ranked.filter((wolf) => wolfLeaderPriority(wolf) === topPriority);
  return top[Math.floor(Math.random() * top.length)] || top[0] || null;
}

function wolfLeaderPriority(agent: Agent): number {
  const rule = (agent.roleConfig?.rule || {}) as Record<string, unknown>;
  const explicit = Number(rule.wolfLeaderPriority ?? rule.leaderPriority ?? agent.wolfLeaderPriority ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  const roleId = String(agent.roleConfig?.id || agent.role || '').toLowerCase();
  const roleName = String(agent.roleConfig?.name || agent.roleLabel || agent.role || '').toLowerCase();
  const roleText = `${roleId} ${roleName}`.toLowerCase();
  if (roleText.includes('white') || roleText.includes('king') || roleText.includes('白狼王')) return 100;
  return 0;
}

function buildWolfSharedInfo(wolves: Agent[], leaderId: number | null): string {
  const wolfLabels = wolves.map((wolf) => `${wolf.id}号${wolf.roleLabel || wolf.role || '狼人'}`).join('、');
  const leader = leaderId ? `${leaderId}号` : '无';
  return `狼人请睁眼。狼队成员：${wolfLabels || '无'}。本夜狼队领袖：${leader}。请先互通身份信息，再依次发言并统一刀口。`;
}

export {
  ensureWolfTeamContext,
  selectWolfLeader,
  wolfLeaderPriority,
  buildWolfSharedInfo
};

export type { WolfTeamContext };
