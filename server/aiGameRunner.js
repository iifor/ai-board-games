const { callOpenAIChat, parseJsonObject } = require('./openaiChat');
const { createMockGame } = require('./mockGame');
const { readRealGameLogs } = require('./gameLogStore');
const { getRandomEnabledSkin } = require('./adminStore');
const { buildMemoryCard, getInvestigationQuestions } = require('./mistTemplate');

let lastMockReplayGameId = null;

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function createAgents(config, template) {
  const selectedPlayers = config.players.slice(0, 7);
  const roleSet = shuffle([
    'keyFigure',
    'cover',
    'investigator',
    'investigator',
    'investigator',
    'investigator',
    'investigator'
  ]);
  const keyFigureIndex = roleSet.indexOf('keyFigure');
  const coverIndex = roleSet.indexOf('cover');
  const keyFigureId = selectedPlayers[keyFigureIndex].id;
  const coverId = selectedPlayers[coverIndex].id;

  const agents = selectedPlayers.map((player, index) => ({
    ...player,
    role: roleSet[index],
    alive: true,
    excluded: false,
    excludedRound: null,
    votes: [],
    declared: [],
    suspicion: (index % 5) + 1,
    marked: false,
    lastTestimony: '',
    allies: roleSet[index] === 'investigator' ? [] : [keyFigureId, coverId].filter((id) => id !== player.id),
    messages: []
  }));

  agents.forEach((agent) => {
    agent.memoryCard = buildMemoryCard(agent, agents, keyFigureId, coverId, template);
    agent.messages = [{ role: 'system', content: buildSystemPrompt(agent, keyFigureId, coverId, template) }];
  });

  return agents;
}

function buildSystemPrompt(agent, keyFigureId, coverId, template) {
  const terms = template.terms;
  const common = [
    '你正在参与《共识迷雾·迷雾调查》v3.2 标准7人局。你是一个独立玩家，不是主持人。',
    `你的编号是 ${agent.id}，昵称是 ${agent.nickname}，人格倾向是：${agent.personality}。`,
    `本局皮肤：${template.name}`,
    `事件背景：${template.background}`,
    `你的个人记忆卡：\n${agent.memoryCard}`,
    '共识投票为匿名 A/B，只公布总票数。你可以声称自己投了什么，但不需要每次都声明。',
    '讨论阶段采用自然发言制。发言必须像桌游玩家，可以分析线索、质疑、辩护、补充记忆或转移讨论。',
    `禁止直接公开阵营身份，禁止说“我是调查方/好人/${terms.mist}/${terms.keyFigure}/${terms.cover}”。`,
    '禁止直接列出属性集合，禁止说“根据属性表”，禁止直接计算线索覆盖范围。',
    '发言不超过 120 字，必须包含至少一个具体怀疑、辩护、证词或票型判断。'
  ];

  if (agent.role === 'investigator') {
    return [
      ...common,
      `你的隐藏阵营是${terms.investigators}。目标：找出真正的${terms.keyFigure}。`,
      `第二轮如果${terms.exclusion}${terms.keyFigure}，调查方立即胜利；否则第三轮必须最终指认${terms.keyFigure}。`,
      `你不知道谁是${terms.keyFigure}，也不知道谁是${terms.cover}。你应推动有效共识，警惕过度共识带来的噪音。`
    ].join('\n');
  }

  if (agent.role === 'keyFigure') {
    return [
      ...common,
      `你的隐藏身份是${terms.mist}中的${terms.keyFigure}。目标：避免第二轮被${terms.exclusion}，避免第三轮成为唯一最高票。`,
      `你的同伴${terms.cover}是 ${coverId} 号。`,
      '你可以误导、模糊、选择性表达信息，制造共识失败、诱导过度共识，或伪装成健康异议。'
    ].join('\n');
  }

  return [
    ...common,
    `你的隐藏身份是${terms.mist}中的${terms.cover}。目标：保护${terms.keyFigure}，制造错误判断。`,
    `真正的${terms.keyFigure}是 ${keyFigureId} 号。`,
    `你可以替${terms.keyFigure}吸引怀疑，把怀疑引向调查方，或在最终指认前制造分票。`
  ].join('\n');
}

async function askAgent(agent, prompt, options = {}) {
  agent.messages.push({ role: 'user', content: prompt });
  const reply = await callOpenAIChat({
    apiKey: agent.apiKey,
    baseUrl: agent.baseUrl,
    provider: agent.provider,
    model: agent.model,
    temperature: agent.temperature,
    messages: agent.messages,
    maxTokens: options.maxTokens || 260
  });
  agent.messages.push({ role: 'assistant', content: reply });
  return reply;
}

function getPublicPlayerState(agent, template) {
  const terms = template?.terms || {};
  return [
    `你的编号：${agent.id}`,
    `你的历史真实共识投票：${agent.votes.join('、') || '暂无'}`,
    `你当前${agent.excluded ? `已被${terms.exclusion || '排除'}，不能继续投票或发言` : '仍有投票权和发言权'}`,
    agent.marked ? `你身上有${terms.suspicionMark || '嫌疑标记'}。` : `你当前没有${terms.suspicionMark || '嫌疑标记'}。`
  ].join('\n');
}

async function collectConsensusVote(agent, round, question, publicHistory, template) {
  const prompt = [
    `第 ${round} 轮调查题前提：${question.premise || '主持人要求在两个调查方向中选择其一。'}`,
    `选项：A：${question.a} / B：${question.b}`,
    `公开历史：\n${publicHistory || '暂无'}`,
    `你的状态：\n${getPublicPlayerState(agent, template)}`,
    '请选择你的秘密共识投票。只返回 JSON：',
    '{"vote":"A","reason":"一句话原因"}'
  ].join('\n\n');

  try {
    const reply = await askAgent(agent, prompt, { maxTokens: 120 });
    const parsed = parseJsonObject(reply);
    const vote = parsed?.vote === 'A' || parsed?.vote === 'B' ? parsed.vote : fallbackConsensusVote(agent, round);
    agent.votes.push(vote);
    return vote;
  } catch (error) {
    console.error(`玩家 ${agent.id} 共识投票失败，使用兜底策略：${error.message}`);
    const vote = fallbackConsensusVote(agent, round);
    agent.votes.push(vote);
    return vote;
  }
}

async function collectSpeech(agent, round, question, publicLog, recentSpeeches, template) {
  const prompt = [
    `第 ${round} 轮自然发言。调查题前提：${question.premise || '主持人要求在两个调查方向中选择其一。'}；A：${question.a} / B：${question.b}`,
    `公开信息：\n${publicLog}`,
    `本轮前面玩家发言：\n${recentSpeeches || '暂无'}`,
    `你的状态：\n${getPublicPlayerState(agent, template)}`,
    '请发表一段自然语言证词或推理。不需要声明你投了什么；禁止自曝阵营、列属性集合、说“根据属性表”。'
  ].join('\n\n');

  try {
    const reply = await askAgent(agent, prompt, { maxTokens: 220 });
    return normalizeSpeech(reply, agent);
  } catch (error) {
    console.error(`玩家 ${agent.id} 发言失败，使用兜底发言：${error.message}`);
    return fallbackSpeech(agent, round);
  }
}

async function collectTargetVote(agent, phase, validTargetIds, publicLog, speeches, template) {
  const terms = template?.terms || {};
  const phaseText = phase === 'suspicion'
    ? `${terms.suspicionMark || '嫌疑标记'}投票：选择一名你认为最可疑的玩家。`
    : phase === 'exclusion'
      ? `${terms.exclusion || '排除行动'}投票：选择一名你认为应被排除的玩家。`
      : `最终指认：选择一名你认为是真正${terms.keyFigure || '关键人物'}的玩家。`;
  const prompt = [
    phaseText,
    `可选对象：${validTargetIds.join('、')}`,
    `公开信息：\n${publicLog}`,
    `本轮发言：\n${speeches || '暂无'}`,
    `你的状态：\n${getPublicPlayerState(agent, template)}`,
    '只返回 JSON：',
    '{"target":2,"reason":"一句话原因"}'
  ].join('\n\n');

  try {
    const reply = await askAgent(agent, prompt, { maxTokens: 120 });
    const parsed = parseJsonObject(reply);
    const target = Number(parsed?.target);
    return validTargetIds.includes(target) ? target : fallbackTarget(agent, validTargetIds, phase);
  } catch (error) {
    console.error(`玩家 ${agent.id} ${phase} 投票失败，使用兜底策略：${error.message}`);
    return fallbackTarget(agent, validTargetIds, phase);
  }
}

async function collectLastTestimony(agent, publicLog, template) {
  const terms = template?.terms || {};
  const prompt = [
    `你刚刚被${terms.exclusion || '排除'}，失去第三轮投票和发言权。请留下不超过80字的${terms.lastTestimony || '最后证词'}。`,
    `公开信息：\n${publicLog}`,
    '可以包含一条自然语言记忆、怀疑、解释或提醒；禁止自曝阵营或系统性证明身份。'
  ].join('\n\n');

  try {
    const reply = await askAgent(agent, prompt, { maxTokens: 120 });
    return String(reply || '').replace(/\s+/g, ' ').trim().slice(0, 80) || fallbackLastTestimony(agent, template);
  } catch {
    return fallbackLastTestimony(agent, template);
  }
}

function fallbackConsensusVote(agent, round) {
  if (agent.role === 'investigator') return round === 1 || agent.id % 2 ? 'A' : 'B';
  if (agent.role === 'keyFigure') return round === 2 ? 'B' : agent.id % 2 ? 'A' : 'B';
  return round === 3 ? 'B' : agent.id % 2 ? 'B' : 'A';
}

function fallbackSpeech(agent, round) {
  if (agent.role === 'keyFigure') return `我觉得现在不能只盯手册，公共终端那条也值得看。${round}轮的票型如果太顺，反而可能有人在带方向。`;
  if (agent.role === 'cover') return '日志重写未必就是核心行为，我更担心有人把所有线索都压到同一个方向，像是在提前定案。';
  return '我倾向把手册、权限撤回和备用终端连起来看。现在最需要解释的是谁接触过材料，又一直回避时间线。';
}

function fallbackTarget(agent, validTargetIds, phase) {
  if (agent.role === 'investigator') {
    const markedCandidate = validTargetIds.find((id) => id !== agent.id);
    return markedCandidate || validTargetIds[0];
  }
  const nonAlly = validTargetIds.find((id) => id !== agent.id && !agent.allies.includes(id));
  if (phase === 'final' && agent.role === 'cover') return nonAlly || validTargetIds[0];
  return nonAlly || validTargetIds[0];
}

function fallbackLastTestimony(agent, template) {
  const lastTestimony = template?.terms?.lastTestimony || '最后证词';
  return `${agent.id}号${lastTestimony}：别只看单条线索，重点核对谁在淡化关键记录。`;
}

function normalizeSpeech(text, agent) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 140);
  if (!clean) return fallbackSpeech(agent, agent.votes.length);
  if (includesForbiddenReveal(clean)) return fallbackSpeech(agent, agent.votes.length);
  return clean;
}

function includesForbiddenReveal(text) {
  return /我是\s*(调查方|安全调查员|隐瞒者|迷雾方|关键人物|违规操作者|掩护者|日志篡改者|好人|坏人)/i.test(text);
}

function countVotes(votes) {
  return Object.values(votes).reduce((acc, vote) => {
    if (vote === 'A') acc.A += 1;
    if (vote === 'B') acc.B += 1;
    return acc;
  }, { A: 0, B: 0 });
}

function getConsensusType(tally, voterCount) {
  const max = Math.max(tally.A, tally.B);
  if (max === voterCount && voterCount > 0) return 'overConsensus';
  if (max >= Math.ceil(voterCount * 0.66)) return 'effective';
  return 'failed';
}

function getTopTargets(votes) {
  const counts = {};
  Object.values(votes).forEach((target) => {
    counts[target] = (counts[target] || 0) + 1;
  });
  const entries = Object.entries(counts);
  if (!entries.length) return [];
  const max = Math.max(...entries.map(([, count]) => count));
  return entries.filter(([, count]) => count === max).map(([id]) => Number(id));
}

function buildPublicLog(round) {
  const items = [
    round.question.premise ? `调查前提：${round.question.premise}` : '',
    `调查题：A：${round.question.a} / B：${round.question.b}`,
    `共识票型：A ${round.tally.A} 票，B ${round.tally.B} 票`,
    `共识类型：${getConsensusTypeLabel(round.consensusType)}`
  ].filter(Boolean);
  if (round.clue) items.push(`公开线索：${round.clue.title}：${round.clue.text}`);
  if (round.appraisal) items.push(`鉴定报告：${round.appraisal}`);
  if (round.noise) items.push(`迷雾噪音：${round.noise}`);
  return items.join('\n');
}

function getConsensusTypeLabel(type) {
  if (type === 'overConsensus') return '过度共识';
  if (type === 'effective') return '有效共识';
  return '共识失败';
}

function getRoleLabel(role, template) {
  if (role === 'investigator') return template.terms.investigators;
  if (role === 'keyFigure') return template.terms.keyFigure;
  if (role === 'cover') return template.terms.cover;
  return '未知';
}

function serializeGame({ agents, rounds, template, gameId, winner = null, winReason = '', mode = 'real' }) {
  return {
    id: gameId || `game-${Date.now()}`,
    mode,
    event: {
      id: template.id,
      name: template.name,
      version: template.version,
      source: template.source,
      background: template.background,
      terms: template.terms,
      truth: winner ? template.truth : ''
    },
    players: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      nickname: agent.nickname,
      avatar: agent.avatar,
      provider: agent.provider,
      role: agent.role,
      roleLabel: getRoleLabel(agent.role, template),
      sex: agent.sex || '未知',
      alive: !agent.excluded,
      excluded: agent.excluded,
      excludedRound: agent.excludedRound,
      marked: agent.marked,
      personality: agent.personality,
      model: agent.model,
      memoryCard: agent.memoryCard,
      votes: agent.votes,
      declared: agent.declared,
      suspicion: agent.suspicion,
      lastTestimony: agent.lastTestimony
    })),
    rounds,
    winner,
    winReason,
    createdAt: new Date().toISOString()
  };
}

async function createAiGame(config, options = {}) {
  if (config.mode !== 'real') {
    const game = getMockReplayGame(config);
    if (options.onEvent) await replayMockGame(game, options.onEvent);
    return game;
  }
  return runAiGame(config, options);
}

function getMockReplayGame(config) {
  const selected = getRandomMatchingRealGameLog(config.selectedPlayerIds || config.players.map((player) => player.id));
  if (selected?.game?.rounds?.length && selected.game?.event?.version === 'v3.2') {
    lastMockReplayGameId = selected.game.id;
    return {
      ...clone(selected.game),
      id: `mock-replay-${selected.game.id || Date.now()}`,
      mode: 'mock',
      replayFrom: {
        id: selected.game.id,
        savedAt: selected.savedAt,
        filename: selected.filename
      }
    };
  }
  return createMockGame(config);
}

function getRandomMatchingRealGameLog(playerIds) {
  const expected = normalizeIdSet(playerIds);
  const logs = readRealGameLogs().filter((record) => normalizeIdSet(record.game?.players?.map((player) => player.id)).join(',') === expected.join(','));
  if (!logs.length) return null;
  const candidates = logs.length > 1 ? logs.filter((record) => record.game?.id !== lastMockReplayGameId) : logs;
  const pool = candidates.length ? candidates : logs;
  return pool[Math.floor(Math.random() * pool.length)];
}

function normalizeIdSet(ids = []) {
  return ids.map(Number).filter(Boolean).sort((a, b) => a - b);
}

async function replayMockGame(game, onEvent) {
  const partial = { ...clone(game), rounds: [], winner: null, winReason: '' };
  partial.players = partial.players.map((player) => ({ ...player, role: 'unknown', roleLabel: '身份隐藏' }));
  if (partial.event) partial.event.truth = '';

  await onEvent({ type: 'players', players: partial.players, game: clone(partial) });

  for (const sourceRound of game.rounds) {
    const round = {
      ...clone(sourceRound),
      votes: {},
      tally: { A: 0, B: 0 },
      consensusType: 'failed',
      consensus: false,
      clue: null,
      appraisal: '',
      noise: '',
      speeches: [],
      suspicionVotes: {},
      markedSuspects: [],
      exclusionVotes: {},
      excluded: [],
      finalAccusationVotes: {},
      finalTargets: []
    };
    partial.rounds.push(round);
    await onEvent({ type: 'round-start', round: clone(round), game: clone(partial) });

    Object.assign(round.votes, sourceRound.votes);
    round.tally = clone(sourceRound.tally);
    round.consensusType = sourceRound.consensusType;
    round.consensus = sourceRound.consensus;
    await onEvent({ type: 'vote-result', round: clone(round), game: clone(partial) });

    round.clue = clone(sourceRound.clue || null);
    round.appraisal = sourceRound.appraisal || '';
    round.noise = sourceRound.noise || '';
    await onEvent({ type: 'clue-result', round: clone(round), game: clone(partial) });

    for (const speech of sourceRound.speeches || []) {
      round.speeches.push(clone(speech));
      await onEvent({ type: 'speech', round: clone(round), speech: clone(speech), game: clone(partial) });
    }

    if (sourceRound.suspicionVotes) {
      round.suspicionVotes = clone(sourceRound.suspicionVotes);
      round.markedSuspects = clone(sourceRound.markedSuspects || []);
      await onEvent({ type: 'suspicion-result', round: clone(round), game: clone(partial) });
    }

    if (sourceRound.exclusionVotes) {
      round.exclusionVotes = clone(sourceRound.exclusionVotes);
      round.excluded = clone(sourceRound.excluded || []);
      await onEvent({ type: 'exclusion-result', round: clone(round), game: clone(partial) });
      for (const item of round.excluded) {
        await onEvent({ type: 'last-testimony', round: clone(round), testimony: clone(item), game: clone(partial) });
      }
    }

    if (sourceRound.finalAccusationVotes) {
      round.finalAccusationVotes = clone(sourceRound.finalAccusationVotes);
      round.finalTargets = clone(sourceRound.finalTargets || []);
      await onEvent({ type: 'final-accusation-result', round: clone(round), game: clone(partial) });
    }
  }

  await onEvent({ type: 'game', game: clone(game) });
}

async function runAiGame(config, options = {}) {
  const emit = async (event) => options.onEvent ? options.onEvent(event) : undefined;
  const template = getRandomEnabledSkin();
  const agents = createAgents(config, template);
  const questions = getInvestigationQuestions(template);
  const gameId = `game-${Date.now()}`;
  const rounds = [];
  const publicHistory = [];
  let nextClueIndex = 0;
  let winner = null;
  let winReason = '';

  await emit({ type: 'players', players: serializeGame({ agents, rounds, template, gameId, winner }).players, game: serializeGame({ agents, rounds, template, gameId, winner }) });

  for (let index = 0; index < 3; index += 1) {
    const roundNumber = index + 1;
    const question = questions[index];
    const voters = agents.filter((agent) => !agent.excluded);
    const round = {
      number: roundNumber,
      phase: roundNumber === 1 ? 'suspicion' : roundNumber === 2 ? 'exclusion' : 'final',
      question,
      aliveIds: voters.map((agent) => agent.id),
      votes: {},
      tally: { A: 0, B: 0 },
      consensusType: 'failed',
      consensus: false,
      clue: null,
      appraisal: '',
      noise: '',
      speeches: [],
      suspicionVotes: null,
      markedSuspects: [],
      exclusionVotes: null,
      excluded: [],
      finalAccusationVotes: null,
      finalTargets: []
    };
    rounds.push(round);
    await emit({ type: 'round-start', round, game: serializeGame({ agents, rounds, template, gameId, winner, winReason }) });

    const voteResults = await Promise.all(voters.map(async (agent) => ({
      id: agent.id,
      vote: await collectConsensusVote(agent, roundNumber, question, publicHistory.join('\n'), template)
    })));
    voteResults.forEach((item) => {
      round.votes[item.id] = item.vote;
    });
    round.tally = countVotes(round.votes);
    round.consensusType = getConsensusType(round.tally, voters.length);
    round.consensus = round.consensusType !== 'failed';
    await emit({ type: 'vote-result', round, game: serializeGame({ agents, rounds, template, gameId, winner, winReason }) });

    if (round.consensus && nextClueIndex < template.clues.length) {
      const sourceClue = template.clues[nextClueIndex];
      round.clue = { title: sourceClue.title, text: sourceClue.text };
      round.appraisal = sourceClue.appraisal;
      nextClueIndex += 1;
    }
    if (round.consensusType === 'overConsensus') {
      round.noise = template.noises[(roundNumber - 1) % template.noises.length];
    }
    await emit({ type: 'clue-result', round, game: serializeGame({ agents, rounds, template, gameId, winner, winReason }) });

    const publicLog = buildPublicLog(round);
    for (const agent of voters) {
      const speech = await collectSpeech(
        agent,
        roundNumber,
        question,
        publicLog,
        round.speeches.map((item) => `${item.playerId}号：${item.text}`).join('\n'),
        template
      );
      const speechItem = { playerId: agent.id, text: speech };
      round.speeches.push(speechItem);
      await emit({ type: 'speech', round, speech: speechItem, game: serializeGame({ agents, rounds, template, gameId, winner, winReason }) });
    }

    const allSpeechText = round.speeches.map((item) => `${item.playerId}号：${item.text}`).join('\n');

    if (roundNumber === 1) {
      const votes = {};
      await Promise.all(voters.map(async (agent) => {
        votes[agent.id] = await collectTargetVote(agent, 'suspicion', agents.map((item) => item.id), publicLog, allSpeechText, template);
      }));
      round.suspicionVotes = votes;
      round.markedSuspects = getTopTargets(votes);
      round.markedSuspects.forEach((id) => {
        const target = agents.find((agent) => agent.id === id);
        if (target) {
          target.marked = true;
          target.suspicion = Math.min(5, (target.suspicion || 1) + 2);
        }
      });
      publicHistory.push(`第1轮：${getConsensusTypeLabel(round.consensusType)}；风险标记：${round.markedSuspects.join('、') || '无'}号`);
      await emit({ type: 'suspicion-result', round, game: serializeGame({ agents, rounds, template, gameId, winner, winReason }) });
    }

    if (roundNumber === 2) {
      const votes = {};
      await Promise.all(voters.map(async (agent) => {
        votes[agent.id] = await collectTargetVote(agent, 'exclusion', voters.map((item) => item.id), publicLog, allSpeechText, template);
      }));
      round.exclusionVotes = votes;
      const excludedIds = getTopTargets(votes);
      for (const id of excludedIds) {
        const target = agents.find((agent) => agent.id === id);
        if (!target) continue;
        target.excluded = true;
        target.alive = false;
        target.excludedRound = 2;
      }
      for (const id of excludedIds) {
        const target = agents.find((agent) => agent.id === id);
        if (!target) continue;
        target.lastTestimony = await collectLastTestimony(target, publicLog, template);
        round.excluded.push({ id: target.id, testimony: target.lastTestimony });
      }
      await emit({ type: 'exclusion-result', round, game: serializeGame({ agents, rounds, template, gameId, winner, winReason }) });
      for (const item of round.excluded) {
        await emit({ type: 'last-testimony', round, testimony: item, game: serializeGame({ agents, rounds, template, gameId, winner, winReason }) });
      }

      if (excludedIds.some((id) => agents.find((agent) => agent.id === id)?.role === 'keyFigure')) {
        winner = 'investigators';
        winReason = `第二轮${template.terms.exclusion}命中${template.terms.keyFigure}，调查方立即胜利。`;
        break;
      }
      publicHistory.push(`第2轮：${getConsensusTypeLabel(round.consensusType)}；权限冻结：${excludedIds.join('、') || '无'}号；未命中违规操作者`);
    }

    if (roundNumber === 3) {
      const votes = {};
      const validTargets = agents.map((agent) => agent.id);
      await Promise.all(voters.map(async (agent) => {
        votes[agent.id] = await collectTargetVote(agent, 'final', validTargets, publicLog, allSpeechText, template);
      }));
      round.finalAccusationVotes = votes;
      round.finalTargets = getTopTargets(votes);
      const keyFigure = agents.find((agent) => agent.role === 'keyFigure');
      if (round.finalTargets.length === 1 && round.finalTargets[0] === keyFigure?.id) {
        winner = 'investigators';
        winReason = `第三轮最终指认形成唯一最高票，并命中${template.terms.keyFigure}。`;
      } else if (round.finalTargets.length > 1) {
        winner = 'mist';
        winReason = '第三轮最终指认出现最高票平票，迷雾方胜利。';
      } else {
        winner = 'mist';
        winReason = `第三轮最终指认未命中${template.terms.keyFigure}，迷雾方胜利。`;
      }
      await emit({ type: 'final-accusation-result', round, game: serializeGame({ agents, rounds, template, gameId, winner, winReason }) });
      break;
    }
  }

  if (!winner) {
    winner = 'mist';
    winReason = '调查方未能在三轮内形成明确正确指认，迷雾方胜利。';
  }

  const game = serializeGame({ agents, rounds, template, gameId, winner, winReason });
  await emit({ type: 'game', game });
  return game;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

module.exports = {
  createAiGame,
  runAiGame
};
