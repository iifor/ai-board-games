const { buildSheriffStartMessage, buildSheriffResultMessage } = require('./announcements');
const { shuffle, rotateFromSeat, getTopCandidateIds, prefetchOrderedSpeechTexts, buildSheriffVoteMessage, buildSheriffBadgeMessage, buildPublicLog } = require('./utils');
const { countTargets } = require('./winCheck');

async function runSheriffElection(ctx, round) {
  const { agents, emit, serialize } = ctx;
  const alive = agents.filter((agent) => agent.alive).sort((a, b) => Number(a.id) - Number(b.id));
  const signedUpAgents = [];
  for (const [index, agent] of alive.entries()) {
    const parsed = await agent.playerAgent.askJson([
      '第一天警长竞选开始。你是否上警竞选警长？',
      '只返回 JSON：{"run":true} 或 {"run":false}。'
    ].join('\n\n'), { maxTokens: 40, fallback: { run: index < Math.min(3, alive.length) } });
    if (parsed?.run) signedUpAgents.push(agent);
  }

  const signedUpIds = signedUpAgents.map((agent) => agent.id);
  round.sheriffElection = {
    signedUpIds, speechOrder: [], speeches: [], withdrawnIds: [],
    candidates: signedUpIds, voters: [], votes: {}, tally: {},
    runoffCandidateIds: [], runoffSpeechOrder: [], runoffSpeeches: [],
    runoffVotes: {}, runoffTally: {}, sheriffId: null,
    result: signedUpIds.length ? 'pending' : 'no-candidates'
  };
  await emit({ type: 'sheriff-start', round, sheriffCandidateIds: signedUpIds, message: buildSheriffStartMessage(round), game: serialize() });

  if (!signedUpAgents.length) {
    await finishSheriffElection(ctx, round, null, 'no-candidates');
    return;
  }

  await playSheriffSpeeches(ctx, round, signedUpAgents, 'sheriff-speech');
  const candidates = [];
  for (const agent of signedUpAgents) {
    const parsed = await agent.playerAgent.askJson([
      '你的警上竞选发言已经结束。你是否退水退出警长竞选？',
      '只返回 JSON：{"withdraw":true} 或 {"withdraw":false}。'
    ].join('\n\n'), { maxTokens: 40, fallback: { withdraw: false } });
    if (parsed?.withdraw) round.sheriffElection.withdrawnIds.push(agent.id);
    else candidates.push(agent);
  }
  round.sheriffElection.candidates = candidates.map((agent) => agent.id);
  await emit({ type: 'sheriff-candidates', round, sheriffCandidateIds: round.sheriffElection.candidates, game: serialize() });
  if (!candidates.length) {
    await finishSheriffElection(ctx, round, null, 'withdrawn');
    return;
  }

  const voters = alive.filter((agent) => agent.canVote && !signedUpIds.includes(agent.id));
  round.sheriffElection.voters = voters.map((agent) => agent.id);
  const firstVote = await collectSheriffVotes(voters, candidates, '警长竞选投票，请从候选人中选择警长。');
  round.sheriffElection.votes = firstVote.votes;
  round.sheriffElection.tally = firstVote.tally;
  await emit({ type: 'sheriff-vote', round, sheriffCandidateIds: round.sheriffElection.candidates, message: buildSheriffVoteMessage(round, false), game: serialize() });

  const firstTopIds = getTopCandidateIds(firstVote.tally);
  if (firstTopIds.length === 1 || candidates.length === 1) {
    await finishSheriffElection(ctx, round, firstTopIds[0] || candidates[0]?.id, 'elected');
    return;
  }
  if (!firstTopIds.length) {
    await finishSheriffElection(ctx, round, null, 'no-votes');
    return;
  }

  const runoffCandidates = candidates.filter((agent) => firstTopIds.includes(agent.id));
  round.sheriffElection.runoffCandidateIds = runoffCandidates.map((agent) => agent.id);
  await playSheriffSpeeches(ctx, round, runoffCandidates, 'sheriff-runoff-speech');
  const runoffVote = await collectSheriffVotes(voters, runoffCandidates, '警长复投，请在平票候选人中选择警长。');
  round.sheriffElection.runoffVotes = runoffVote.votes;
  round.sheriffElection.runoffTally = runoffVote.tally;
  await emit({ type: 'sheriff-runoff-vote', round, sheriffCandidateIds: round.sheriffElection.runoffCandidateIds, message: buildSheriffVoteMessage(round, true), game: serialize() });

  const runoffTopIds = getTopCandidateIds(runoffVote.tally);
  await finishSheriffElection(ctx, round, runoffTopIds.length === 1 ? runoffTopIds[0] : null, runoffTopIds.length === 1 ? 'elected' : 'runoff-tie');
}

async function playSheriffSpeeches(ctx, round, candidates, eventType) {
  const firstSpeaker = shuffle(candidates)[0];
  const ordered = rotateFromSeat(candidates, firstSpeaker?.id, 'clockwise');
  const isRunoff = eventType === 'sheriff-runoff-speech';
  const orderKey = isRunoff ? 'runoffSpeechOrder' : 'speechOrder';
  const speechesKey = isRunoff ? 'runoffSpeeches' : 'speeches';
  round.sheriffElection[orderKey] = ordered.map((agent) => agent.id);
  const context = buildPublicLog(ctx.rounds, ctx.agents);
  const { askSheriffSpeech } = require('./agents');
  for await (const { agent, text } of prefetchOrderedSpeechTexts(ordered, (item) => (
    askSheriffSpeech(item, round.day, context, isRunoff)
  ))) {
    const speech = { playerId: agent.id, text, phase: 'sheriff', day: round.day, runoff: isRunoff };
    round.sheriffElection[speechesKey].push(speech);
    await ctx.emit({
      type: eventType, round, speech,
      sheriffCandidateIds: isRunoff ? round.sheriffElection.runoffCandidateIds : round.sheriffElection.signedUpIds,
      game: ctx.serialize()
    });
  }
}

async function finishSheriffElection(ctx, round, sheriffId, result) {
  round.sheriffId = sheriffId || null;
  round.sheriffBadge.status = sheriffId ? 'held' : 'none';
  round.sheriffElection.sheriffId = round.sheriffId;
  round.sheriffElection.result = result;
  await ctx.emit({ type: 'sheriff-result', round, message: buildSheriffResultMessage(round, ctx.modeConfig), game: ctx.serialize() });
}

async function collectSheriffVotes(voters, candidates, prompt) {
  const candidateIds = candidates.map((agent) => agent.id);
  const votes = {};
  for (const agent of voters) {
    const target = await agent.playerAgent.askVoteTarget(prompt, candidateIds, candidateIds[0]);
    votes[agent.id] = target;
  }
  return { votes, tally: countTargets(votes) };
}

module.exports = { runSheriffElection, playSheriffSpeeches, finishSheriffElection, collectSheriffVotes };
