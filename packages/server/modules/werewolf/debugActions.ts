interface DebugAgent {
  id: number;
  alive?: boolean;
  faction?: string;
  role?: string;
  usedPoison?: boolean;
  lastGuardTarget?: number | null;
  [key: string]: unknown;
}

interface DebugRound {
  day: number;
  night?: {
    wolfTarget?: number | null;
    [key: string]: unknown;
  };
  sheriffElection?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface DebugRuntime {
  agents: DebugAgent[];
  [key: string]: unknown;
}

function isWerewolfDebugMode(runtime: { state?: Record<string, unknown>; config?: Record<string, unknown> } | null | undefined): boolean {
  return Boolean(runtime?.state?.debugMode || runtime?.config?.debugMode);
}

function runDebugWerewolfAction(runtime: DebugRuntime, round: DebugRound, actor: DebugAgent, actionType: string): Record<string, unknown> {
  const alive = (runtime.agents || []).filter((agent) => agent.alive !== false);
  if (actionType === 'wolf_kill') {
    return { target: firstTarget(alive, actor, (agent) => agent.faction !== 'wolves'), speech: debugSpeech(actor, runtime.agents), thinking: '' };
  }
  if (actionType === 'wolf_speech') return { speech: debugSpeech(actor, runtime.agents), thinking: '' };
  if (actionType === 'wolf_vote') return { target: firstTarget(alive, actor, (agent) => agent.faction !== 'wolves') };
  if (actionType === 'seer_check') {
    const target = firstTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.id));
    const targetAgent = alive.find((agent) => Number(agent.id) === Number(target));
    return { target, result: targetAgent?.faction === 'wolves' ? '狼人' : '好人' };
  }
  if (actionType === 'guard_protect') {
    return { target: firstTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.lastGuardTarget)) };
  }
  if (actionType === 'witch_save') return { use: false };
  if (actionType === 'witch_poison') return { use: false, target: null };
  if (actionType === 'day_speech') return { text: debugSpeech(actor, runtime.agents), thinking: '' };
  if (actionType === 'day_vote') return { target: firstTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.id)) };
  if (actionType === 'sheriff_signup') return { run: false };
  if (actionType === 'sheriff_speech') return { text: debugSpeech(actor, runtime.agents), thinking: '' };
  if (actionType === 'sheriff_withdraw') return { withdraw: false };
  if (actionType === 'sheriff_vote') return { target: firstSheriffTarget(round, alive, actor) };
  if (actionType === 'sheriff_runoff_speech') return { text: debugSpeech(actor, runtime.agents), thinking: '' };
  if (actionType === 'sheriff_runoff_vote') return { target: firstSheriffTarget(round, alive, actor, 'runoffCandidateIds') };
  if (actionType === 'sheriff_speech_direction') return { direction: 'clockwise', reason: 'debug-direction' };
  return {};
}

function runDebugHunterAction(runtime: DebugRuntime, actor: DebugAgent): Record<string, unknown> {
  const alive = (runtime.agents || []).filter((agent) => agent.alive !== false && Number(agent.id) !== Number(actor.id));
  return { target: alive[0]?.id || null };
}

function runDebugSheriffBadgeAction(runtime: DebugRuntime, actor: DebugAgent): Record<string, unknown> {
  const target = (runtime.agents || []).find((agent) => agent.alive !== false && Number(agent.id) !== Number(actor.id));
  return target
    ? { action: 'transfer', target: target.id, reason: 'debug-transfer' }
    : { action: 'tear', target: null, reason: 'no-valid-target' };
}

function debugSpeech(actor: DebugAgent, agents?: DebugAgent[]): string {
  const sorted = (agents || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
  const seatNumber = sorted.findIndex((a) => Number(a.id) === Number(actor.id)) + 1 || Number(actor.id) || '';
  return `我是${seatNumber}号，${actor.faction === 'wolves' ? '狼人' : '好人'}，调试发言`;
}

function firstTarget(alive: DebugAgent[], actor: DebugAgent, predicate: (agent: DebugAgent) => boolean): number | null {
  const target = alive.find(predicate) || alive.find((agent) => Number(agent.id) !== Number(actor.id)) || alive[0];
  return target?.id || null;
}

function firstSheriffTarget(round: DebugRound, alive: DebugAgent[], actor: DebugAgent, key: 'candidates' | 'runoffCandidateIds' = 'candidates'): number | null {
  const election = round.sheriffElection || {};
  const ids = Array.isArray(election[key]) ? election[key] as number[] : [];
  const target = ids.find((id) => Number(id) !== Number(actor.id)) || ids[0];
  return target || firstTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.id));
}

export {
  isWerewolfDebugMode,
  runDebugWerewolfAction,
  runDebugHunterAction,
  runDebugSheriffBadgeAction,
  debugSpeech
};
