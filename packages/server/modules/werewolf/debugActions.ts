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
    return { target: randomTarget(alive, actor, (agent) => agent.faction !== 'wolves'), speech: debugSpeech(actor, runtime.agents), thinking: '' };
  }
  if (actionType === 'wolf_speech') return { speech: debugSpeech(actor, runtime.agents), thinking: '' };
  if (actionType === 'wolf_vote') return { target: randomTarget(alive, actor, (agent) => agent.faction !== 'wolves') };
  if (actionType === 'seer_check') {
    const target = randomTarget(alive, actor);
    const targetAgent = alive.find((agent) => Number(agent.id) === Number(target));
    return { target, result: targetAgent?.faction === 'wolves' ? '狼人' : '好人' };
  }
  if (actionType === 'guard_protect') {
    return { target: randomTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.lastGuardTarget)) };
  }
  if (actionType === 'witch_save') {
    const wolfTarget = round.night?.wolfTarget;
    if (wolfTarget != null && alive.some((agent) => Number(agent.id) === Number(wolfTarget))) {
      return { use: Math.random() < 0.8, reason: 'debug-auto-save' };
    }
    return { use: false };
  }
  if (actionType === 'witch_poison') {
    if (Math.random() >= 0.8) return { use: false, target: null };
    const candidates = alive.filter((agent) => Number(agent.id) !== Number(actor.id));
    if (!candidates.length) return { use: false, target: null };
    const target = candidates[Math.floor(Math.random() * candidates.length)];
    return { use: true, target: target.id ?? null, targetSeat: target.id ?? null, reason: 'debug-random' };
  }
  if (actionType === 'day_speech') return { text: debugSpeech(actor, runtime.agents), thinking: '' };
  if (actionType === 'day_vote') return { target: randomTarget(alive, actor) };
  if (actionType === 'mvp_vote') return { target: randomTarget(runtime.agents, actor) };
  if (actionType === 'postgame_speech') {
    if (Math.random() < 0.2) return { speak: false, text: '', thinking: '' };
    return { speak: true, text: `${debugSpeech(actor, runtime.agents)}，这局大家都辛苦了。`, thinking: '' };
  }
  if (actionType === 'sheriff_signup') return { run: Math.random() < 0.5 };
  if (actionType === 'sheriff_speech') return { text: debugSpeech(actor, runtime.agents), thinking: '' };
  if (actionType === 'sheriff_withdraw') return { withdraw: false };
  if (actionType === 'sheriff_vote') return { target: randomSheriffTarget(round, alive, actor) };
  if (actionType === 'sheriff_runoff_speech') return { text: debugSpeech(actor, runtime.agents), thinking: '' };
  if (actionType === 'sheriff_runoff_vote') return { target: randomSheriffTarget(round, alive, actor, 'runoffCandidateIds') };
  if (actionType === 'sheriff_speech_direction') {
    const dir = Math.random() < 0.5 ? 'clockwise' : 'counterclockwise';
    return { direction: dir, reason: 'debug-random' };
  }
  return {};
}

function runDebugHunterAction(runtime: DebugRuntime, actor: DebugAgent): Record<string, unknown> {
  const alive = (runtime.agents || []).filter((agent) => agent.alive !== false && Number(agent.id) !== Number(actor.id));
  if (!alive.length) return { target: null };
  const target = alive[Math.floor(Math.random() * alive.length)];
  return { target: target?.id ?? null };
}

function runDebugSheriffBadgeAction(runtime: DebugRuntime, actor: DebugAgent): Record<string, unknown> {
  const candidates = (runtime.agents || []).filter((agent) => agent.alive !== false && Number(agent.id) !== Number(actor.id));
  if (!candidates.length) return { action: 'tear', target: null, reason: 'no-valid-target' };
  const target = candidates[Math.floor(Math.random() * candidates.length)];
  // 50% 概率移交，50% 概率撕毁
  return Math.random() < 0.5
    ? { action: 'transfer', target: target.id, reason: 'debug-transfer' }
    : { action: 'tear', target: null, reason: 'debug-tear' };
}

function debugSpeech(actor: DebugAgent, agents?: DebugAgent[]): string {
  const sorted = (agents || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
  const seatNumber = sorted.findIndex((a) => Number(a.id) === Number(actor.id)) + 1 || Number(actor.id) || '';
  return `${seatNumber}号发言`;
}

/** 从候选列表中随机选取一名目标，排除 actor 自身，可附加 predicate 过滤 */
function randomTarget(
  candidates: DebugAgent[],
  actor: DebugAgent,
  predicate?: (agent: DebugAgent) => boolean,
): number | null {
  const filtered = candidates.filter((agent) => {
    if (Number(agent.id) === Number(actor.id)) return false;
    if (predicate && !predicate(agent)) return false;
    return true;
  });
  if (!filtered.length) {
    // 回退：只排除自身
    const fallback = candidates.filter((agent) => Number(agent.id) !== Number(actor.id));
    if (!fallback.length) return null;
    return fallback[Math.floor(Math.random() * fallback.length)].id ?? null;
  }
  return filtered[Math.floor(Math.random() * filtered.length)].id ?? null;
}

/** 从警长候选人列表中随机选取目标 */
function randomSheriffTarget(
  round: DebugRound,
  alive: DebugAgent[],
  actor: DebugAgent,
  key: 'candidates' | 'runoffCandidateIds' = 'candidates',
): number | null {
  const election = round.sheriffElection || {};
  const ids = Array.isArray(election[key]) ? (election[key] as number[]) : [];
  const validIds = ids.filter((id) => Number(id) !== Number(actor.id));
  if (validIds.length) {
    return validIds[Math.floor(Math.random() * validIds.length)] ?? null;
  }
  // 回退到随机存活非己玩家
  return randomTarget(alive, actor);
}

export {
  isWerewolfDebugMode,
  runDebugWerewolfAction,
  runDebugHunterAction,
  runDebugSheriffBadgeAction,
  debugSpeech
};
