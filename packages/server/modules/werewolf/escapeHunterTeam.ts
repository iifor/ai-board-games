import { sortBySeat } from './utils';
import type { Agent, Round, Runtime } from './reducers';

function getLivingEscapeHunters(runtime: Runtime): Agent[] {
  return sortBySeat(runtime.agents.filter((agent) => (
    agent.alive && String(agent.role || agent.roleConfig?.id || '') === 'escape_hunter'
  ))) as Agent[];
}

function ensureEscapeHunterTeamContext(runtime: Runtime, round: Round): Agent[] {
  const hunters = getLivingEscapeHunters(runtime);
  round.night.escapeHunterIds = hunters.map((hunter) => Number(hunter.id));
  round.night.escapeHunterSpeechOrder = hunters.map((hunter) => Number(hunter.id));
  return hunters;
}

function resolveNightAttackTarget(night: { escapeHunterTarget?: number | null; wolfTarget?: number | null }): number | null {
  return Number(night.escapeHunterTarget || night.wolfTarget || 0) || null;
}

export { ensureEscapeHunterTeamContext, getLivingEscapeHunters, resolveNightAttackTarget };
