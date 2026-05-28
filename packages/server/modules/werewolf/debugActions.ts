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
    return { target: firstTarget(alive, actor, (agent) => agent.faction !== 'wolves'), speech: debugSpeech(actor), thinking: '' };
  }
  if (actionType === 'wolf_speech') return { speech: debugSpeech(actor), thinking: '' };
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
  if (actionType === 'day_speech') return { text: debugSpeech(actor), thinking: '' };
  if (actionType === 'day_vote') return { target: firstTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.id)) };
  if (actionType === 'sheriff_signup') return { run: false };
  if (actionType === 'sheriff_speech') return { text: debugSpeech(actor), thinking: '' };
  if (actionType === 'sheriff_withdraw') return { withdraw: false };
  if (actionType === 'sheriff_vote') return { target: firstSheriffTarget(round, alive, actor) };
  if (actionType === 'sheriff_runoff_speech') return { text: debugSpeech(actor), thinking: '' };
  if (actionType === 'sheriff_runoff_vote') return { target: firstSheriffTarget(round, alive, actor, 'runoffCandidateIds') };
  return {};
}

function runDebugHunterAction(runtime: DebugRuntime, actor: DebugAgent): Record<string, unknown> {
  const alive = (runtime.agents || []).filter((agent) => agent.alive !== false && Number(agent.id) !== Number(actor.id));
  return { target: alive[0]?.id || null };
}

function debugSpeech(actor: DebugAgent): string {
  return `我是${actor.id}号，${actor.faction === 'wolves' ? '狼人' : '好人'}，调试发言`;
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
  debugSpeech
};

