const {
  sortBySeat, getSheriffSpeechOrder, getSheriffNightDeathSpeechOrder,
  getNextAliveId, getClockStartId, rotateFromSeat, prefetchOrderedSpeechTexts,
  buildSpeechOrderMessage, buildSheriffBadgeMessage, buildPublicLog,
  fallbackSpeech, fallbackLastWords, fallbackVote, getRoleLabel, hasRoleAction
} = require('./utils');
const { askSpeech } = require('./agents');
const { eliminate, countTargets, topExile, hasLastWords } = require('./winCheck');
const { getVoteMessage } = require('./utils');

async function runDay(ctx, round) {
  round.phase = 'day';

  for (const death of round.night.deaths) {
    if (round.day === 1 && hasLastWords(ctx.agents, ctx.modeConfig)) {
      await collectLastWords(ctx, round, death.id, 'last-words');
    }
    await maybeHunterShot(ctx, round, death.id, 'night');
  }

  const context = buildPublicLog(ctx.rounds, ctx.agents);
  const daySpeechOrder = await decideDaySpeechOrder(ctx, round);
  for await (const { agent, text } of prefetchOrderedSpeechTexts(daySpeechOrder, (item) => (
    askSpeech(item, round.day, context, fallbackSpeech(item, round.day))
  ))) {
    const speech = { playerId: agent.id, text, phase: 'day', day: round.day };
    round.speeches.push(speech);
    await ctx.emit({ type: 'speech', round, speech, game: ctx.serialize() });
  }

  await resolveDayVote(ctx, round);

  if (round.exile) {
    await collectLastWords(ctx, round, round.exile.id, 'exile-words');
    await maybeHunterShot(ctx, round, round.exile.id, 'exile');
  }
}

async function decideDaySpeechOrder(ctx, round) {
  const alive = sortBySeat(ctx.agents.filter((agent) => agent.alive));
  if (!alive.length) return alive;

  const sheriff = alive.find((agent) => Number(agent.id) === Number(round.sheriffId));
  const nightDeathAnchor = Math.max(0, ...(round.night?.deaths || []).map((death) => Number(death.id) || 0));

  if (sheriff) {
    const parsed = await sheriff.playerAgent.askJson([
      '你是警长。请选择本轮白天发言方向。',
      '只返回 JSON：{"direction":"clockwise"} 或 {"direction":"counterclockwise"}。'
    ].join('\n\n'), { maxTokens: 40, fallback: { direction: 'clockwise' } });
    const direction = parsed?.direction === 'counterclockwise' ? 'counterclockwise' : 'clockwise';
    const order = nightDeathAnchor
      ? getSheriffNightDeathSpeechOrder(alive, sheriff.id, nightDeathAnchor, direction)
      : getSheriffSpeechOrder(alive, sheriff.id, direction);
    round.daySpeech = {
      source: 'sheriff', direction,
      anchorPlayerId: nightDeathAnchor || null,
      startPlayerId: order[0]?.id || sheriff.id,
      playerIds: order.map((agent) => agent.id)
    };
    await ctx.emit({ type: 'speech-order', round, message: buildSpeechOrderMessage(round), game: ctx.serialize() });
    return order;
  }

  const startId = nightDeathAnchor ? getNextAliveId(alive, nightDeathAnchor, 'clockwise') : getClockStartId(alive);
  const order = rotateFromSeat(alive, startId, 'clockwise');
  round.daySpeech = {
    source: nightDeathAnchor ? 'night-death' : 'clock',
    direction: 'clockwise',
    anchorPlayerId: nightDeathAnchor || null,
    startPlayerId: order[0]?.id || null,
    playerIds: order.map((agent) => agent.id)
  };
  await ctx.emit({ type: 'speech-order', round, message: buildSpeechOrderMessage(round), game: ctx.serialize() });
  return order;
}

async function resolveDayVote(ctx, round) {
  const votes = {};
  const valid = ctx.agents.filter((agent) => agent.alive).map((agent) => agent.id);
  for (const agent of ctx.agents.filter((item) => item.alive && item.canVote)) {
    const target = await agent.playerAgent.askVoteTarget(
      '白天投票：请选择你认为最像狼人的玩家。',
      valid.filter((id) => id !== agent.id),
      fallbackVote(agent, ctx.agents)
    );
    votes[agent.id] = target;
    agent.votes.push({ day: round.day, target });
  }
  round.votes = votes;
  round.voteTally = countTargets(votes, round.sheriffId, ctx.modeConfig.sheriff.voteWeight);
  const exileId = topExile(round.voteTally);

  if (exileId) {
    const target = ctx.agents.find((agent) => agent.id === exileId);
    if (hasRoleAction(target?.roleConfig, 'surviveExileOnce')) {
      const result = await ctx.skillRegistry.execute('surviveExileOnce', { actor: target, modeConfig: ctx.modeConfig });
      if (result.survives) {
        round.idiotReveal = { id: exileId, reason: '白痴翻牌免除放逐，失去投票权' };
      } else {
        eliminate(ctx.agents, exileId, round.day, '白天放逐');
        round.exile = { id: exileId, reason: '白天放逐' };
        await maybeTransferSheriffBadge(ctx, round, exileId, '白天放逐', 'day');
      }
    } else {
      eliminate(ctx.agents, exileId, round.day, '白天放逐');
      round.exile = { id: exileId, reason: '白天放逐' };
      await maybeTransferSheriffBadge(ctx, round, exileId, '白天放逐', 'day');
    }
  }
  await ctx.emit({ type: 'vote-result', round, message: getVoteMessage(round), game: ctx.serialize() });
}

async function collectLastWords(ctx, round, playerId, eventType) {
  const agent = ctx.agents.find((item) => item.id === playerId);
  if (!agent) return;
  const text = await askSpeech(agent, round.day, buildPublicLog(ctx.rounds, ctx.agents), fallbackLastWords(agent), 80);
  agent.lastWords = text;
  const words = { playerId: agent.id, text, day: round.day };
  round.lastWords.push(words);
  await ctx.emit({ type: eventType, round, testimony: words, game: ctx.serialize() });
}

async function maybeHunterShot(ctx, round, playerId, reason) {
  const hunter = ctx.agents.find((agent) =>
    agent.id === playerId && hasRoleAction(agent.roleConfig, 'shootOnDeath') && !agent.hunterShotUsed
  );
  if (!hunter) return;
  if (ctx.modeConfig.hunter.disabledDeathReasons.includes(hunter.deathReason)) return;
  const result = await ctx.skillRegistry.execute('shootOnDeath', {
    actor: hunter, agents: ctx.agents, fallback: fallbackVote(hunter, ctx.agents)
  });
  if (!result.target) return;
  hunter.hunterShotUsed = true;
  eliminate(ctx.agents, result.target, round.day, '猎人开枪');
  round.hunterShot = { from: hunter.id, target: result.target, reason };
  await ctx.emit({ type: 'hunter-shot', round, shot: round.hunterShot, game: ctx.serialize() });
  await maybeTransferSheriffBadge(ctx, round, result.target, '猎人开枪', reason);
}

async function maybeTransferSheriffBadge(ctx, round, playerId, reason, phase) {
  if (Number(round.sheriffId) !== Number(playerId)) return;
  const sheriff = ctx.agents.find((agent) => Number(agent.id) === Number(playerId));
  const alive = sortBySeat(ctx.agents.filter((agent) => agent.alive));
  const validIds = alive.map((agent) => agent.id);
  const fallbackTarget = validIds[0] || null;
  const parsed = sheriff && validIds.length
    ? await sheriff.playerAgent.askJson([
      `你是已出局警长。当前仍存活玩家：${validIds.join('、')}。`,
      '请选择移交警徽给一名仍存活玩家，或撕掉警徽。',
      '只返回 JSON：{"action":"transfer","target":2} 或 {"action":"tear","target":null}。'
    ].join('\n\n'), { maxTokens: 60, fallback: { action: 'transfer', target: fallbackTarget } })
    : { action: 'tear', target: null };
  const targetId = Number(parsed?.target);
  const shouldTransfer = parsed?.action === 'transfer' && validIds.includes(targetId);
  const transfer = {
    day: round.day, phase, from: Number(playerId),
    to: shouldTransfer ? targetId : null,
    action: shouldTransfer ? 'transfer' : 'tear', reason
  };
  round.sheriffTransfers.push(transfer);
  round.sheriffId = shouldTransfer ? targetId : null;
  round.sheriffBadge.status = shouldTransfer ? 'held' : 'torn';
  await ctx.emit({
    type: shouldTransfer ? 'sheriff-badge-transfer' : 'sheriff-badge-tear',
    round, sheriffTransfer: transfer,
    message: buildSheriffBadgeMessage(transfer), game: ctx.serialize()
  });
}

module.exports = {
  runDay, decideDaySpeechOrder, resolveDayVote,
  collectLastWords, maybeHunterShot, maybeTransferSheriffBadge
};
