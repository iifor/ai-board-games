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
  const elderDeathDay = getWolfElderBrotherDeathDay(runtime);
  const wolves = sortBySeat(runtime.agents.filter((agent) =>
    agent.alive &&
    agent.faction === 'wolves' &&
    (!isRole(agent, 'wolf_younger_brother') || (elderDeathDay != null && Number(round.day) >= elderDeathDay + 2))
  ));
  const existingLeader = Number(night.wolfLeaderId || 0);
  const leader = wolves.find((wolf) => Number(wolf.id) === existingLeader) || selectWolfLeader(wolves);
  const order = leader ? rotateFromSeat(wolves, leader.id, 'clockwise') : wolves;
  night.wolfIds = wolves.map((wolf) => wolf.id);
  night.wolfLeaderId = leader?.id || null;
  night.wolfSpeechOrder = order.map((wolf) => wolf.id);
  night.wolfSharedInfo = buildWolfSharedInfo(wolves, leader?.id || null, runtime.agents);
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

function buildWolfSharedInfo(wolves: Agent[], leaderId: number | null, allAgents?: Agent[]): string {
  const sortedAll = sortBySeat(allAgents || wolves);
  const seatOf = (id: number | null): string => {
    if (id == null) return '?';
    const idx = sortedAll.findIndex((a) => Number(a.id) === Number(id));
    return idx >= 0 ? String(idx + 1) : String(id);
  };
  const wolfLabels = wolves.map((wolf) => `${seatOf(wolf.id)}号${wolf.roleLabel || wolf.role || '狼人'}`).join('、');
  const leader = leaderId ? `${seatOf(leaderId)}号` : '无';
  return `狼队成员：${wolfLabels || '无'}。本夜队长：${leader}。请先互通身份，再依次发言并统一刀口。`;
}

function getWolfElderBrotherDeathDay(runtime: Runtime): number | null {
  const elder = runtime.agents.find((agent) => isRole(agent, 'wolf_elder_brother'));
  const deathDay = Number(elder?.deathDay || 0);
  if (deathDay > 0) return deathDay;
  const younger = runtime.agents.find((agent) => isRole(agent, 'wolf_younger_brother'));
  const stored = Number(younger?.wolfElderBrotherDeathDay || 0);
  return stored > 0 ? stored : null;
}

function isRole(agent: Agent | null | undefined, roleId: string): boolean {
  return String(agent?.role || agent?.roleConfig?.id || '').toLowerCase() === roleId;
}

export {
  ensureWolfTeamContext,
  selectWolfLeader,
  wolfLeaderPriority,
  buildWolfSharedInfo
};

export type { WolfTeamContext };
