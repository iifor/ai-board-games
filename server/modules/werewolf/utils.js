const { countTargets } = require('./winCheck');

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sortBySeat(items) {
  return [...items].sort((a, b) => Number(a.id) - Number(b.id));
}

function rotateFromSeat(items, startId, direction = 'clockwise') {
  const index = items.findIndex((item) => Number(item.id) === Number(startId));
  const ordered = index >= 0 ? [...items.slice(index), ...items.slice(0, index)] : [...items];
  return direction === 'counterclockwise' ? [ordered[0], ...ordered.slice(1).reverse()] : ordered;
}

function getNextAliveId(alive, afterId, direction = 'clockwise') {
  const sorted = sortBySeat(alive);
  const rotated = rotateFromSeat(sorted, afterId, direction);
  return rotated[1]?.id || sorted[0]?.id;
}

function getClockStartId(alive) {
  const hour = new Date().getHours() % 12 || 12;
  const seatIds = alive.map((agent) => agent.id).sort((a, b) => a - b);
  return seatIds.find((id) => id >= hour) || seatIds[0];
}

function getSheriffSpeechOrder(alive, sheriffId, direction = 'clockwise') {
  const speakers = sortBySeat(alive).filter((agent) => Number(agent.id) !== Number(sheriffId));
  const sheriff = alive.find((agent) => Number(agent.id) === Number(sheriffId));
  const startId = getNextAliveId(alive, sheriffId, direction);
  const order = rotateFromSeat(speakers, startId, direction);
  return sheriff ? [...order, sheriff] : order;
}

function getSheriffNightDeathSpeechOrder(alive, sheriffId, deathId, direction) {
  const speakers = alive.filter((agent) => Number(agent.id) !== Number(sheriffId));
  const startId = getNextAliveId(speakers, deathId, direction);
  return [...rotateFromSeat(speakers, startId, direction), alive.find((agent) => Number(agent.id) === Number(sheriffId))].filter(Boolean);
}

function getTopCandidateIds(tally) {
  const entries = Object.entries(tally || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return [];
  const top = entries[0][1];
  return entries.filter(([, count]) => count === top).map(([id]) => Number(id));
}

async function* prefetchOrderedSpeechTexts(agents, loadText, lookahead = 2) {
  const pending = new Map();
  const preload = (index) => {
    if (index >= agents.length || pending.has(index)) return;
    const agent = agents[index];
    pending.set(index, Promise.resolve()
      .then(() => loadText(agent))
      .then((text) => ({ agent, text }))
      .catch((error) => ({ agent, error })));
  };
  for (let index = 0; index < Math.min(lookahead, agents.length); index += 1) preload(index);
  for (let index = 0; index < agents.length; index += 1) {
    const prepared = await pending.get(index);
    pending.delete(index);
    if (prepared.error) throw prepared.error;
    preload(index + lookahead);
    yield prepared;
  }
}

function buildWolfStrategySummary(wolfChoices, wolfTarget, agents) {
  const choices = Object.entries(wolfChoices || {});
  if (!choices.length || !wolfTarget) return '';
  const target = agents.find((agent) => Number(agent.id) === Number(wolfTarget));
  const targetLabel = target ? `${target.id}号${getRoleLabel(target)}` : `${wolfTarget}号`;
  const focused = choices.every(([, targetId]) => Number(targetId) === Number(wolfTarget));
  return focused ? `狼队统一刀口 ${targetLabel}。` : `狼队刀口分散，最终集中到 ${targetLabel}。`;
}

function getVoteMessage(round) {
  if (round.idiotReveal) return `发言结束，开始放逐投票。请所有玩家投票。${round.idiotReveal.id}号翻牌为白痴，免除本次放逐并失去投票权。`;
  if (!round.exile) return '发言结束，开始放逐投票。请所有玩家投票。本轮无人被放逐。';
  return `发言结束，开始放逐投票。请所有玩家投票。${round.exile.id}号玩家被放逐出局。`;
}

function buildSheriffVoteMessage(round, runoff) {
  if (!runoff) return '退水结束，开始投票。';
  const tally = runoff ? round.sheriffElection?.runoffTally : round.sheriffElection?.tally;
  const topIds = getTopCandidateIds(tally);
  if (!topIds.length) return runoff ? '警长复投无人形成有效票型。' : '警长竞选无人形成有效票型。';
  if (topIds.length > 1) return `${runoff ? '警长复投' : '警长竞选投票'}平票：${topIds.map((id) => `${id}号`).join('、')}。`;
  return `${runoff ? '警长复投' : '警长竞选投票'}最高票为${topIds[0]}号。`;
}

function buildSpeechOrderMessage(round) {
  if (round.daySpeech?.source === 'sheriff') {
    return `警长决定${round.daySpeech.direction === 'counterclockwise' ? '逆时针' : '顺时针'}发言，从${round.daySpeech.startPlayerId}号开始。`;
  }
  if (round.daySpeech?.source === 'night-death') {
    return `现在${round.daySpeech.startPlayerId}号开始发言。`;
  }
  return `从${round.daySpeech?.startPlayerId || ''}号开始发言。`;
}

function buildSheriffBadgeMessage(transfer) {
  if (transfer.action === 'transfer') return `${transfer.from}号警长出局，将警徽移交给${transfer.to}号。`;
  return `${transfer.from}号警长出局，选择撕掉警徽。`;
}

function buildPublicLog(rounds, agents) {
  return rounds.map((round) => [
    `第${round.day}天：${round.publicSummary || ''}`,
    round.sheriffId ? `警长：${round.sheriffId}号` : '',
    round.exile ? `放逐：${round.exile.id}号` : '',
    round.idiotReveal ? `白痴翻牌：${round.idiotReveal.id}号` : '',
    round.hunterShot ? `猎人开枪：${round.hunterShot.from}号带走${round.hunterShot.target}号` : ''
  ].filter(Boolean).join('；')).join('\n') || `存活玩家：${agents.filter((agent) => agent.alive).map((agent) => `${agent.id}号`).join('、')}`;
}

const ROLE_NAME_FALLBACK = {
  werewolf: '狼人', seer: '预言家', witch: '女巫', hunter: '猎人',
  idiot: '白痴', guard: '守卫', villager: '村民'
};

function getRoleConfig(modeConfig, roleId) {
  return modeConfig.roleMap?.[roleId] || {
    id: roleId,
    name: ROLE_NAME_FALLBACK[roleId] || roleId,
    faction: roleId === 'werewolf' ? 'wolves' : 'good',
    roleType: roleId === 'werewolf' ? 'wolf' : roleId === 'villager' ? 'villager' : 'god',
    rule: {}
  };
}

function getRoleLabel(agent) {
  return agent?.roleConfig?.name || agent?.roleLabel || agent?.role || '未知身份';
}

function getRoleActions(roleConfig) {
  return Array.isArray(roleConfig?.rule?.actions) ? roleConfig.rule.actions.map((item) => item.action).filter(Boolean) : [];
}

function hasRoleAction(roleConfig, action) {
  return getRoleActions(roleConfig).includes(action);
}

function fallbackSpeech(agent, day) {
  if (agent.faction === 'wolves') return `第${day}天我先看发言状态，别急着把票集中到单点。昨晚死亡更像是在制造焦点，我怀疑有人顺势带节奏。`;
  if (hasRoleAction(agent.roleConfig, 'inspectFaction')) return `我会优先看谁在回避站边。今天别只听情绪，要把昨晚死亡和投票意图连起来。`;
  if (hasRoleAction(agent.roleConfig, 'save') || hasRoleAction(agent.roleConfig, 'poison')) return `药的信息现在不适合摊开说，但我会盯紧谁在用身份压力逼别人表态。`;
  if (hasRoleAction(agent.roleConfig, 'guard')) return `昨晚结果说明狼队有明确目标。今天要听逻辑闭环，别被单句爆点带偏。`;
  if (hasRoleAction(agent.roleConfig, 'shootOnDeath')) return `我会把票压在最像狼的人身上。如果有人强行抗推弱发言位，我会重点怀疑。`;
  if (hasRoleAction(agent.roleConfig, 'surviveExileOnce')) return `我先听完整轮逻辑，别急着把弱发言位打死。今天更要看谁在偷换死亡信息。`;
  return `我没有太多信息，只能看发言和票型。现在最可疑的是那些急着定性、却不给理由的人。`;
}

function fallbackLastWords(agent) {
  return `${agent.id}号遗言：别只看我出局这件事，回头复盘谁最早把票推到我身上。`;
}

function fallbackVote(agent, agents) {
  const alive = agents.filter((item) => item.alive && item.id !== agent.id);
  const wolf = alive.find((item) => item.faction === 'wolves');
  if (agent.faction !== 'wolves' && wolf) return wolf.id;
  const good = alive.find((item) => item.faction !== 'wolves');
  return (agent.faction === 'wolves' && good ? good : alive[0])?.id;
}

module.exports = {
  shuffle, sortBySeat, rotateFromSeat, getNextAliveId, getClockStartId,
  getSheriffSpeechOrder, getSheriffNightDeathSpeechOrder, getTopCandidateIds,
  prefetchOrderedSpeechTexts, buildWolfStrategySummary, getVoteMessage,
  buildSheriffVoteMessage, buildSpeechOrderMessage, buildSheriffBadgeMessage,
  buildPublicLog, getRoleConfig, getRoleLabel, getRoleActions, hasRoleAction,
  fallbackSpeech, fallbackLastWords, fallbackVote
};
