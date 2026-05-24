const { PHASES, PHASE_LIMITS } = require('./constants');
const { askHost } = require('./prompts');
const { createPhase, emitSpeech, pushSpeech, summarizeDebatePhase } = require('./speech');
const { choose, debaterAt, publicDebateLog, publicPlayer, syncDebateMemory } = require('./utils');
const { executeSkillWithTrace } = require('../agent-core');
const { startPhaseSpan, endSpan } = require('../observability');

async function runPhase(ctx, phaseId, action) {
  const source = PHASES.find((item) => item.id === phaseId);
  const phase = createPhase(source);
  const phaseSpan = startPhaseSpan(`phase:${phaseId}`, { phase: phaseId, phase_name: phase.name });
  ctx.state.phases.push(phase);
  try {
    const hostText = await safeHost(
      ctx,
      phase.name,
      phaseId === 'strategy'
        ? `请宣布本场辩论开局，介绍辩题和正反方立场，然后进入「${phase.name}」环节。`
        : `请宣布进入「${phase.name}」环节。不要重复介绍辩题、正方观点或反方观点。`,
      phaseId === 'strategy'
        ? `本场辩题：${ctx.state.topic.title}。正方主张${ctx.state.topic.proPosition}，反方主张${ctx.state.topic.conPosition}。现在进入${phase.name}。`
        : `现在进入${phase.name}。`,
      { includeTopic: phaseId === 'strategy', cacheable: true }
    );
    phase.summary = hostText;
    await ctx.emit({ type: 'phase-start', phase, message: hostText, game: ctx.serialize() });
    await action(phase);
    phase.stageSummary = summarizeDebatePhase(phase);
    await ctx.emit({ type: 'phase-end', phase, message: `${phase.name}结束。`, game: ctx.serialize() });
    endSpan(phaseSpan);
  } catch (error) {
    endSpan(phaseSpan, 'error', {}, error);
    throw error;
  }
}

async function runStrategyPhase(ctx) {
  await runPhase(ctx, 'strategy', async (phase) => {
    for (const captain of ctx.state.agents.filter((agent) => agent.debateRole === 'captain')) {
      syncDebateMemory(captain, ctx.state);
      const result = await runSkill(ctx, 'strategize', captain, phase);
      await emitSpeech(ctx, phase, captain, result, 'strategy');
    }
  });
}

async function runOpeningPhase(ctx) {
  await runPhase(ctx, 'opening', async (phase) => {
    for (const agent of [debaterAt(ctx.state.agents, 'pro', 0), debaterAt(ctx.state.agents, 'con', 0)].filter(Boolean)) {
      syncDebateMemory(agent, ctx.state);
      await emitSpeech(ctx, phase, agent, await runSkill(ctx, 'opening_argue', agent, phase), 'opening');
    }
  });
}

async function runCrossfirePhase(ctx) {
  await runPhase(ctx, 'crossfire', async (phase) => {
    const pro = ctx.state.agents.filter((agent) => agent.side === 'pro').slice(1, 3);
    const con = ctx.state.agents.filter((agent) => agent.side === 'con').slice(1, 3);
    const pairs = [[pro[0], con[0]], [con[0], pro[1]], [pro[1], con[1]], [con[1], pro[0]]].filter(([a, b]) => a && b);
    for (const [questioner, responder] of pairs) {
      syncDebateMemory(questioner, ctx.state);
      const question = await runSkill(ctx, 'crossfire_question', questioner, phase, { target: responder });
      await emitSpeech(ctx, phase, questioner, question, 'question', responder.id);
      syncDebateMemory(responder, ctx.state);
      const answer = await runSkill(ctx, 'crossfire_answer', responder, phase, { target: questioner });
      await emitSpeech(ctx, phase, responder, answer, 'answer', questioner.id);
    }
  });
}

async function runFreePhase(ctx) {
  await runPhase(ctx, 'free', async (phase) => {
    let previousId = null;
    for (let i = 0; i < 8; i += 1) {
      const side = i % 2 === 0 ? 'pro' : 'con';
      const candidates = ctx.state.agents.filter((agent) => agent.side === side && agent.id !== previousId);
      const agent = choose(candidates);
      previousId = agent.id;
      syncDebateMemory(agent, ctx.state);
      await emitSpeech(ctx, phase, agent, await runSkill(ctx, 'free_speech', agent, phase), 'free');
    }
  });
}

async function runClosingPhase(ctx) {
  await runPhase(ctx, 'closing', async (phase) => {
    for (const agent of [debaterAt(ctx.state.agents, 'con', 3), debaterAt(ctx.state.agents, 'pro', 3)].filter(Boolean)) {
      syncDebateMemory(agent, ctx.state);
      await emitSpeech(ctx, phase, agent, await runSkill(ctx, 'closing_summary', agent, phase), 'closing');
    }
  });
}

async function runAwardPhases(ctx) {
  const result = await runJudgesPhase(ctx);
  const mvp = await runMvpPhase(ctx, result);
  return { ...result, mvp };
}

async function runJudgesPhase(ctx) {
  const phase = createPhase(PHASES.find((item) => item.id === 'judges'));
  const phaseSpan = startPhaseSpan('phase:judges', { phase: 'judges', phase_name: phase.name });
  ctx.state.phases.push(phase);
  try {
    const contestants = ctx.state.agents.filter((agent) => agent.side === 'pro' || agent.side === 'con');
    const judges = ctx.state.agents.filter((agent) => agent.side === 'judge');
    phase.summary = judges.length ? '现在进入评委点评。' : '本场无评委席，由主持人进行点评。';
    await ctx.emit({ type: 'phase-start', phase, message: phase.summary, game: ctx.serialize() });
    const winnerVotes = {};
    if (judges.length) {
      for (const judge of judges) {
        syncDebateMemory(judge, ctx.state);
        const review = await runSkill(ctx, 'judge_review', judge, phase);
        winnerVotes[judge.id] = review.winner;
        await ctx.emit({ type: 'speech', phase, speech: pushSpeech(phase, judge, review.text, 'judge-review'), game: ctx.serialize() });
      }
    } else {
      const text = await safeHost(ctx, phase.name, `请根据赛况点评双方表现，并给出胜负倾向。赛况：\n${publicDebateLog(ctx.state.phases)}`, '正方结构更完整，反方反击更锋利；综合推进质量，正方略胜。');
      await ctx.emit({ type: 'speech', phase, speech: pushSpeech(phase, { id: '主持', side: 'host', debateRole: 'host', speeches: [] }, text.slice(0, 160), 'judge-review'), game: ctx.serialize() });
      winnerVotes.host = text.includes('反方') && !text.includes('正方略胜') ? 'con' : 'pro';
    }
    phase.stageSummary = summarizeDebatePhase(phase);
    const winner = topWinner(winnerVotes);
    const winReason = winner === 'draw' ? '评委意见接近，双方战成平局。' : `${winner === 'pro' ? '正方' : '反方'}获得更多评委倾向。`;
    await ctx.emit({ type: 'phase-end', phase, message: '评委点评完成。', game: ctx.serialize({ winner, winReason }) });
    endSpan(phaseSpan);
    return { winner, winReason, contestants };
  } catch (error) {
    endSpan(phaseSpan, 'error', {}, error);
    throw error;
  }
}

async function runMvpPhase(ctx, result) {
  const phase = createPhase(PHASES.find((item) => item.id === 'mvp'));
  const phaseSpan = startPhaseSpan('phase:mvp', { phase: 'mvp', phase_name: phase.name });
  ctx.state.phases.push(phase);
  try {
    phase.summary = '现在进入全员评选最佳辩手。';
    await ctx.emit({ type: 'phase-start', phase, message: phase.summary, game: ctx.serialize(result) });
    const votes = await Promise.all(result.contestants.map((actor) => runSkill(ctx, 'vote_mvp', actor, phase, { contestants: result.contestants })));
    const mvpVotes = {};
    votes.forEach((vote) => { mvpVotes[vote.voterId] = vote.target; phase.votes.push(vote); });
    const mvpId = topVotedId(mvpVotes) || choose(result.contestants).id;
    const mvp = publicPlayer(result.contestants.find((agent) => agent.id === mvpId) || result.contestants[0]);
    phase.stageSummary = `MVP投票完成，最高票目标为${mvp?.nickname || mvp?.id || '最佳辩手'}。`;
    await ctx.emit({ type: 'phase-end', phase, message: '最佳辩手评选完成。', game: ctx.serialize({ ...result, mvp }) });
    endSpan(phaseSpan);
    return mvp;
  } catch (error) {
    endSpan(phaseSpan, 'error', {}, error);
    throw error;
  }
}

async function runPostgamePhase(ctx) {
  await runPhase(ctx, 'postgame', async (phase) => {
    for (const agent of getPostgameSpeakers(ctx.state.agents, ctx.state.mvp?.id)) {
      syncDebateMemory(agent, ctx.state);
      await emitSpeech(ctx, phase, agent, await runSkill(ctx, 'postgame_speech', agent, phase), 'postgame');
    }
  });
}

async function runSkill(ctx, action, actor, phase, extra = {}) {
  return executeSkillWithTrace(ctx.skillRegistry, action, {
    ...extra, actor, phase, state: ctx.state, config: ctx.config,
    emit: ctx.emit, serialize: ctx.serialize, fallbackAudit: ctx.fallbackAudit,
    gameType: 'debate'
  });
}

async function safeHost(ctx, phaseName, prompt, fallback, options = {}) {
  if (!ctx.config.host?.apiKey) {
    ctx.fallbackAudit.record({ gameType: 'debate', phase: phaseName, skillId: 'host-announce', reason: 'missing-api-key', fallbackValue: fallback });
    return fallback;
  }
  try {
    return String(await askHost(ctx.config, ctx.state.topic, phaseName, prompt, undefined, options) || fallback).replace(/\s+/g, ' ').trim();
  } catch (error) {
    ctx.fallbackAudit.record({ gameType: 'debate', phase: phaseName, skillId: 'host-announce', reason: error.message, fallbackValue: fallback });
    return fallback;
  }
}

function getPostgameSpeakers(agents, mvpId) {
  const contestants = agents.filter((agent) => agent.side === 'pro' || agent.side === 'con')
    .sort((a, b) => ({ pro: 0, con: 1 }[a.side] - { pro: 0, con: 1 }[b.side]) || Number(a.sideIndex || 0) - Number(b.sideIndex || 0));
  if (!contestants.length) return [];
  const mvpIndex = contestants.findIndex((agent) => Number(agent.id) === Number(mvpId));
  const startIndex = mvpIndex >= 0 ? (mvpIndex + 1) % contestants.length : 0;
  return [...contestants.slice(startIndex), ...contestants.slice(0, startIndex)];
}

function topVotedId(votes) {
  const counts = {};
  Object.values(votes).forEach((id) => { counts[id] = (counts[id] || 0) + 1; });
  const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
  return entries.length ? Number(entries[0][0]) : null;
}

function topWinner(votes) {
  const counts = { pro: 0, con: 0, draw: 0 };
  Object.values(votes).forEach((winner) => { if (counts[winner] !== undefined) counts[winner] += 1; });
  if (counts.pro === counts.con) return 'draw';
  return counts.pro > counts.con ? 'pro' : 'con';
}

module.exports = {
  runStrategyPhase, runOpeningPhase, runCrossfirePhase, runFreePhase,
  runClosingPhase, runAwardPhases, runPostgamePhase
};
