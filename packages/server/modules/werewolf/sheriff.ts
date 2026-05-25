const { buildSheriffStartMessage, buildSheriffResultMessage } = require('./announcements');
const {
  shuffle, rotateFromSeat, getTopCandidateIds,
  buildSheriffVoteMessage, collectWerewolfPublicMemoryEntries
} = require('./utils');
const { countTargets } = require('./winCheck');
const { syncMissingPublicMemory } = require('../game-memory');

interface Agent {
  id: number;
  alive?: boolean;
  canVote?: boolean;
  thinkingEnabled?: boolean;
  playerAgent: PlayerAgent;
  [key: string]: unknown;
}

interface PlayerAgent {
  thinkingEnabled?: boolean;
  askJson: (prompt: string, options: Record<string, unknown>) => Promise<Record<string, unknown> | null>;
  askVoteTarget: (prompt: string, validIds: number[], fallback: number | undefined) => Promise<number>;
}

interface ModeConfig {
  [key: string]: unknown;
}

interface SheriffElection {
  signedUpIds: number[];
  speechOrder: number[];
  speeches: unknown[];
  withdrawnIds: number[];
  candidates: number[];
  voters: number[];
  votes: Record<string, number>;
  tally: Record<string, number>;
  runoffCandidateIds: number[];
  runoffSpeechOrder: number[];
  runoffSpeeches: unknown[];
  runoffVotes: Record<string, number>;
  runoffTally: Record<string, number>;
  sheriffId: number | null;
  result: string;
}

interface SheriffBadge {
  status: string;
}

interface Round {
  day: number;
  sheriffId?: number | null;
  sheriffBadge: SheriffBadge;
  sheriffElection: SheriffElection;
  [key: string]: unknown;
}

interface GameContext {
  agents: Agent[];
  rounds: Round[];
  modeConfig: ModeConfig;
  emit: (event: Record<string, unknown>) => Promise<void>;
  serialize: () => Record<string, unknown>;
}

async function runSheriffElection(ctx: GameContext, round: Round): Promise<void> {
  const { agents, emit, serialize } = ctx;
  const alive: Agent[] = agents.filter((agent) => agent.alive).sort((a, b) => Number(a.id) - Number(b.id));
  const signedUpAgents: Agent[] = [];
  for (const [index, agent] of alive.entries()) {
    syncWerewolfMemory(agent, ctx);
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
  const candidates: Agent[] = [];
  for (const agent of signedUpAgents) {
    syncWerewolfMemory(agent, ctx);
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

  const voters: Agent[] = alive.filter((agent) => agent.canVote && !signedUpIds.includes(agent.id));
  round.sheriffElection.voters = voters.map((agent) => agent.id);
  const firstVote = await collectSheriffVotes(ctx, voters, candidates, '警长竞选投票，请从候选人中选择警长。');
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

  const runoffCandidates: Agent[] = candidates.filter((agent) => firstTopIds.includes(agent.id));
  round.sheriffElection.runoffCandidateIds = runoffCandidates.map((agent) => agent.id);
  await playSheriffSpeeches(ctx, round, runoffCandidates, 'sheriff-runoff-speech');
  const runoffVote = await collectSheriffVotes(ctx, voters, runoffCandidates, '警长复投，请在平票候选人中选择警长。');
  round.sheriffElection.runoffVotes = runoffVote.votes;
  round.sheriffElection.runoffTally = runoffVote.tally;
  await emit({ type: 'sheriff-runoff-vote', round, sheriffCandidateIds: round.sheriffElection.runoffCandidateIds, message: buildSheriffVoteMessage(round, true), game: serialize() });

  const runoffTopIds = getTopCandidateIds(runoffVote.tally);
  await finishSheriffElection(ctx, round, runoffTopIds.length === 1 ? runoffTopIds[0] : null, runoffTopIds.length === 1 ? 'elected' : 'runoff-tie');
}

async function playSheriffSpeeches(ctx: GameContext, round: Round, candidates: Agent[], eventType: string): Promise<void> {
  const firstSpeaker = shuffle(candidates)[0];
  const ordered: Agent[] = rotateFromSeat(candidates, firstSpeaker?.id, 'clockwise');
  const isRunoff = eventType === 'sheriff-runoff-speech';
  const orderKey = isRunoff ? 'runoffSpeechOrder' : 'speechOrder';
  const speechesKey = isRunoff ? 'runoffSpeeches' : 'speeches';
  round.sheriffElection[orderKey] = ordered.map((agent) => agent.id);
  const { askSheriffSpeech, askSheriffSpeechWithThinking } = require('./agents');
  for (const agent of ordered) {
    syncWerewolfMemory(agent, ctx);
    if (agent.thinkingEnabled && agent.playerAgent.thinkingEnabled) {
      const { content, thinking } = await askSheriffSpeechWithThinking(agent, round.day, '公开信息已通过上文增量同步。', isRunoff);
      if (thinking) await ctx.emit({ type: 'thinking', playerId: agent.id, thinking });
      const speech = { playerId: agent.id, text: content, phase: 'sheriff', day: round.day, runoff: isRunoff, thinking };
      round.sheriffElection[speechesKey].push(speech);
      await ctx.emit({
        type: eventType, round, speech,
        sheriffCandidateIds: isRunoff ? round.sheriffElection.runoffCandidateIds : round.sheriffElection.signedUpIds,
        game: ctx.serialize()
      });
    } else {
      const text = await askSheriffSpeech(agent, round.day, '公开信息已通过上文增量同步。', isRunoff);
      const speech = { playerId: agent.id, text, phase: 'sheriff', day: round.day, runoff: isRunoff };
      round.sheriffElection[speechesKey].push(speech);
      await ctx.emit({
        type: eventType, round, speech,
        sheriffCandidateIds: isRunoff ? round.sheriffElection.runoffCandidateIds : round.sheriffElection.signedUpIds,
        game: ctx.serialize()
      });
    }
  }
}

async function finishSheriffElection(ctx: GameContext, round: Round, sheriffId: number | null | undefined, result: string): Promise<void> {
  round.sheriffId = sheriffId || null;
  round.sheriffBadge.status = sheriffId ? 'held' : 'none';
  round.sheriffElection.sheriffId = round.sheriffId;
  round.sheriffElection.result = result;
  await ctx.emit({ type: 'sheriff-result', round, message: buildSheriffResultMessage(round, ctx.modeConfig), game: ctx.serialize() });
}

async function collectSheriffVotes(ctx: GameContext, voters: Agent[], candidates: Agent[], prompt: string): Promise<{ votes: Record<string, number>; tally: Record<string, number> }> {
  const candidateIds = candidates.map((agent) => agent.id);
  const votes: Record<string, number> = {};
  for (const agent of voters) {
    syncWerewolfMemory(agent, ctx);
    const target = await agent.playerAgent.askVoteTarget(prompt, candidateIds, candidateIds[0]);
    votes[agent.id] = target;
  }
  return { votes, tally: countTargets(votes) };
}

function syncWerewolfMemory(agent: Agent, ctx: GameContext): void {
  return syncMissingPublicMemory(agent, collectWerewolfPublicMemoryEntries(ctx.rounds, ctx.agents));
}

export { runSheriffElection, playSheriffSpeeches, finishSheriffElection, collectSheriffVotes };
