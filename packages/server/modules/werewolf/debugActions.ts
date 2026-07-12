interface DebugAgent {
  id: number;
  alive?: boolean;
  faction?: string;
  role?: string;
  roleLabel?: string;
  roleConfig?: { id?: string; name?: string; [key: string]: unknown };
  usedPoison?: boolean;
  lastGuardTarget?: number | null;
  [key: string]: unknown;
}

interface DebugRound {
  day: number;
  night?: {
    wolfTarget?: number | null;
    escapeHunterTarget?: number | null;
    [key: string]: unknown;
  };
  sheriffElection?: Record<string, unknown> | null;
  [key: string]: unknown;
}

interface DebugRuntime {
  agents: DebugAgent[];
  modeConfig?: { thiefOfferedRoleIds?: unknown };
  [key: string]: unknown;
}

const DEBUG_OPTIONAL_SPECIAL_SKILL_CHANCE = 0.6;
const DEBUG_WHITE_WOLF_KING_DAY_SELF_DESTRUCT_CHANCE = 0.15;
const DEBUG_WHITE_WOLF_KING_SELF_DESTRUCT_CHANCE = 0.5;

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
  if (actionType === 'escape_hunter_speech') return { text: debugSpeech(actor, runtime.agents), thinking: '' };
  if (actionType === 'escape_hunter_vote') {
    return {
      target: randomTarget(alive, actor, (agent) => agent.faction !== 'hunters' && agent.role !== 'escape_hunter'),
      reason: 'debug-escape-hunter-vote',
    };
  }
  if (actionType === 'seer_check') {
    const target = randomTarget(alive, actor);
    const targetAgent = alive.find((agent) => Number(agent.id) === Number(target));
    return { target, result: targetAgent?.faction === 'wolves' || targetAgent?.role === 'escape_hunter' ? '狼人' : '好人' };
  }
  if (actionType === 'guard_protect') {
    const target = randomTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.lastGuardTarget));
    return { target, reason: target ? `debug-守${target}号` : 'debug-空守' };
  }
  if (actionType === 'witch_save') {
    const wolfTarget = round.night?.escapeHunterTarget ?? round.night?.wolfTarget;
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
  if (actionType === 'hybrid_choose_master') return { target: randomTarget(alive, actor) };
  if (actionType === 'elder_silence') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.lastSilencedTarget)), reason: 'debug-random' };
  }
  if (actionType === 'knight_duel') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor), reason: 'debug-random' };
  }
  if (actionType === 'butterfly_hug') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor), reason: 'debug-random' };
  }
  if (actionType === 'stalker_assassinate') {
    if (!shouldUseDebugOptionalSpecialSkill()) return { use: false, target: null, targetSeat: null, reason: 'debug-skip' };
    const target = randomTarget(alive, actor);
    return { use: Boolean(target), target, targetSeat: target, reason: target ? 'debug-random' : null };
  }
  if (actionType === 'wolf_beauty_charm') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor), reason: 'debug-random' };
  }
  if (actionType === 'demon_inspect') return { target: randomTarget(alive.filter((agent) => agent.faction !== 'wolves'), actor), reason: 'debug-random' };
  if (actionType === 'nightmare_fear') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.lastNightmareTarget)), reason: 'debug-random' };
  }
  if (actionType === 'penguin_freeze') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.lastPenguinTarget)), reason: 'debug-random' };
  }
  if (actionType === 'fox_inspect') {
    if (actor.foxInspectLost || !shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor, () => true), reason: 'debug-random' };
  }
  if (actionType === 'dreamer_dream') {
    return { target: randomTarget(alive, actor), reason: 'debug-random' };
  }
  if (actionType === 'magician_swap') {
    const used = new Set(((actor.magicianSwappedIds || []) as number[]).map((id) => Number(id)));
    const candidates = alive.filter((agent) => !used.has(Number(agent.id)));
    const first = randomTarget(candidates, actor);
    const second = randomTarget(candidates.filter((agent) => Number(agent.id) !== Number(first)), actor);
    return { target: first, secondTarget: second, reason: first && second ? 'debug-random' : 'debug-skip' };
  }
  if (actionType === 'fortune_teller_mark') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor), reason: 'debug-random' };
  }
  if (actionType === 'big_bad_wolf_kill') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor, (agent) => agent.faction !== 'wolves'), reason: 'debug-random' };
  }
  if (actionType === 'wolf_seed_infect') {
    const wolfTarget = round.night?.wolfTarget ?? null;
    return { use: Boolean(wolfTarget), target: wolfTarget, targetSeat: wolfTarget, reason: wolfTarget ? 'debug-random' : 'debug-skip' };
  }
  if (actionType === 'heavenly_eye_check') return { target: randomTarget(alive, actor), reason: 'debug-random' };
  if (actionType === 'requester_pray') return { target: randomTarget(alive, actor), reason: 'debug-random' };
  if (actionType === 'requester_kill') {
    return { target: randomTarget(alive, actor), reason: 'debug-requester' };
  }
  if (actionType === 'thief_choose') {
    const offered = Array.isArray(runtime.modeConfig?.thiefOfferedRoleIds)
      ? (runtime.modeConfig.thiefOfferedRoleIds as string[])
      : ['villager', 'werewolf'];
    const wolfRole = offered.find((roleId) => String(roleId).includes('wolf') || roleId === 'werewolf');
    return { roleId: wolfRole || offered[0] || 'villager', offeredRoleIds: offered, reason: 'debug-thief' };
  }
  if (actionType === 'cupid_link') {
    const first = randomTarget(alive, actor);
    const second = randomTarget(alive.filter((agent) => Number(agent.id) !== Number(first)), actor);
    return { target: first, secondTarget: second, reason: 'debug-cupid' };
  }
  if (actionType === 'succubus_link') {
    return { target: randomTarget(alive, actor, (agent) => agent.faction !== 'wolves'), reason: 'debug-succubus' };
  }
  if (actionType === 'ghost_bride_link') {
    const partner = randomTarget(alive, actor);
    const witness = randomTarget(alive.filter((agent) => Number(agent.id) !== Number(partner)), actor);
    return { target: partner, witnessId: witness, secondTarget: witness, reason: 'debug-ghost-bride' };
  }
  if (actionType === 'ghost_bride_chat') {
    return { text: debugSpeech(actor, runtime.agents), thinking: '' };
  }
  if (actionType === 'ghost_bride_kill') {
    return { target: randomTarget(alive, actor, (agent) => agent.faction !== 'third_party'), reason: 'debug-ghost-bride-kill' };
  }
  if (actionType === 'demon_hunter_hunt') {
    if (Number(round.day) < 2 || !shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor), reason: 'debug-demon-hunter' };
  }
  if (actionType === 'spirit_wolf_learn') {
    return { target: randomTarget(alive, actor, (agent) => agent.faction !== 'wolves'), reason: 'debug-spirit-learn' };
  }
  if (actionType === 'spirit_wolf_inspect') {
    if (Number(round.day) < 2 || !shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor, (agent) => agent.faction !== 'wolves'), reason: 'debug-spirit-inspect' };
  }
  if (actionType === 'spirit_wolf_guard') {
    if (Number(round.day) < 2 || !shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.lastSpiritWolfGuardTarget)), reason: 'debug-spirit-guard' };
  }
  if (actionType === 'spirit_wolf_antidote') {
    const target = Number(round.night?.witchPoisonTarget || 0);
    return { use: Boolean(target && target !== Number(actor.id)), target: target || null, targetSeat: target || null, reason: target ? 'debug-spirit-antidote' : 'debug-skip' };
  }
  if (actionType === 'wolf_witch_curse') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor, (agent) => agent.faction === 'good'), reason: 'debug-wolf-witch' };
  }
  if (actionType === 'illusionist_illusion') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor), reason: 'debug-illusionist' };
  }
  if (actionType === 'crow_curse') {
    if (!shouldUseDebugOptionalSpecialSkill()) return skippedDebugTarget();
    return { target: randomTarget(alive, actor, (agent) => Number(agent.id) !== Number(actor.lastCrowTarget)), reason: 'debug-random' };
  }
  if (actionType === 'black_merchant_gift') {
    const gifts = ['inspectFaction', 'poison', 'shootOnDeath'];
    return {
      target: randomTarget(alive, actor),
      gift: gifts[Math.floor(Math.random() * gifts.length)],
      reason: 'debug-random',
    };
  }
  if (actionType === 'lucky_seer_check') return { target: randomTarget(alive, actor), reason: 'debug-gifted-check' };
  if (actionType === 'lucky_witch_poison') {
    const target = randomTarget(alive, actor);
    return { use: Boolean(target), target, targetSeat: target, reason: 'debug-gifted-poison' };
  }
  if (actionType === 'younger_brother_kill') {
    return { target: randomTarget(alive, actor, (agent) => agent.faction !== 'wolves'), reason: 'debug-younger-brother' };
  }
  if (actionType === 'bear_tamer_roar') {
    const adjacentWolfIds = adjacentPlayers(alive, actor.id).filter((agent) => agent.faction === 'wolves').map((agent) => Number(agent.id));
    return { roaring: adjacentWolfIds.length > 0, adjacentWolfIds };
  }
  if (actionType === 'day_speech') {
    const result: Record<string, unknown> = { text: debugSpeech(actor, runtime.agents), thinking: '' };
    // 白狼王自爆检查：15% 概率触发自爆
    if (actor.faction === 'wolves' && isSelfDestructWolf(actor) && Math.random() < DEBUG_WHITE_WOLF_KING_DAY_SELF_DESTRUCT_CHANCE) {
      const validTargets = alive.filter((agent) => Number(agent.id) !== Number(actor.id));
      if (validTargets.length) {
        const target = validTargets[Math.floor(Math.random() * validTargets.length)];
        result.selfDestruct = true;
        if (isWhiteWolfKing(actor)) result.target = target.id ?? null;
        result.selfDestructText = `${getSeatNumber(actor.id, runtime.agents)}号${isWhiteWolfKing(actor) ? '白狼王' : '魔狼'}自爆。`;
      }
    }
    return result;
  }
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

/** 白狼王自爆调试行动：随机决定是否自爆，白狼王可带走一名非狼玩家 */
function runDebugSelfDestructAction(runtime: DebugRuntime, actor: DebugAgent): Record<string, unknown> {
  if (actor.faction !== 'wolves' || actor.alive === false || !isSelfDestructWolf(actor)) return { use: false, text: '', target: null };
  const canTakeTarget = isWhiteWolfKing(actor);
  const alive = (runtime.agents || []).filter((agent) => agent.alive !== false && Number(agent.id) !== Number(actor.id));
  const validTargets = canTakeTarget ? alive.filter((agent) => agent.faction !== 'wolves') : [];
  const use = Math.random() < DEBUG_WHITE_WOLF_KING_SELF_DESTRUCT_CHANCE;
  if (!use) return { use: false, text: '', target: null };
  const target = validTargets.length ? validTargets[Math.floor(Math.random() * validTargets.length)] : null;
  const roleLabel = canTakeTarget ? '白狼王' : '魔狼';
  return {
    use: true,
    text: `${getSeatNumber(actor.id, runtime.agents)}号${roleLabel}自爆。`,
    target: target?.id ?? null,
  };
}

function debugSpeech(actor: DebugAgent, agents?: DebugAgent[]): string {
  const sorted = (agents || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
  const seatNumber = sorted.findIndex((a) => Number(a.id) === Number(actor.id)) + 1 || Number(actor.id) || '';
  return `${seatNumber}号发言`;
}

function shouldUseDebugOptionalSpecialSkill(): boolean {
  return Math.random() < DEBUG_OPTIONAL_SPECIAL_SKILL_CHANCE;
}

function skippedDebugTarget(): Record<string, unknown> {
  return { target: null, reason: 'debug-skip' };
}

/** 判断是否为白狼王 */
function isWhiteWolfKing(actor: DebugAgent): boolean {
  const roleId = String(actor.role || actor.roleConfig?.id || '').toLowerCase();
  const roleName = String(actor.roleLabel || actor.roleConfig?.name || '').toLowerCase();
  return roleId === 'white_wolf_king' || roleName.includes('白狼王') || roleName.includes('white wolf king');
}

function isSelfDestructWolf(actor: DebugAgent): boolean {
  const roleId = String(actor.role || actor.roleConfig?.id || '').toLowerCase();
  return isWhiteWolfKing(actor) || roleId === 'magic_wolf';
}

/** 获取座位号（按 id 排序后的序号） */
function getSeatNumber(id: number, agents?: DebugAgent[]): number {
  const sorted = (agents || []).slice().sort((a, b) => Number(a.id) - Number(b.id));
  const idx = sorted.findIndex((a) => Number(a.id) === Number(id));
  return idx >= 0 ? idx + 1 : Number(id);
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

function adjacentPlayers(agents: DebugAgent[], actorId: number): DebugAgent[] {
  const sorted = agents.slice().sort((a, b) => Number(a.id) - Number(b.id));
  const index = sorted.findIndex((agent) => Number(agent.id) === Number(actorId));
  if (index < 0 || sorted.length < 2) return [];
  const left = sorted[(index - 1 + sorted.length) % sorted.length];
  const right = sorted[(index + 1) % sorted.length];
  return [left, right].filter((agent, itemIndex, items) => agent && items.findIndex((item) => Number(item.id) === Number(agent.id)) === itemIndex);
}

export {
  isWerewolfDebugMode,
  runDebugWerewolfAction,
  runDebugHunterAction,
  runDebugSheriffBadgeAction,
  runDebugSelfDestructAction,
  debugSpeech
};
