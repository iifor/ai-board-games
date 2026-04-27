const { callOpenAIChat, parseJsonObject } = require('./openaiChat');
const { createMockGame } = require('./mockGame');

const QUESTIONS = [
  ['优先相信票型', '优先相信发言'],
  ['效率优先', '公平优先'],
  ['探索未知', '守护稳定'],
  ['理性决策', '直觉决策'],
  ['遵循规则', '灵活变通'],
  ['个人权利', '集体利益'],
  ['透明公开', '隐私保护'],
  ['长期收益', '短期止损'],
  ['严格惩罚', '给人机会'],
  ['统一标准', '因人而异'],
  ['快速行动', '充分讨论']
];

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function countVotes(votes) {
  return Object.values(votes).reduce(
    (acc, vote) => {
      if (vote === 'A') acc.A += 1;
      if (vote === 'B') acc.B += 1;
      return acc;
    },
    { A: 0, B: 0 }
  );
}

function getThreshold(aliveCount) {
  return aliveCount <= 3 ? Math.max(2, aliveCount) : Math.ceil(aliveCount * 0.66);
}

function chooseRoles(playerConfigs) {
  const roles = shuffle(['chaos', 'chaos', 'order', 'order', 'order', 'order']);
  return playerConfigs.map((config, index) => ({
    ...config,
    role: roles[index],
    alive: true,
    votes: [],
    declared: [],
    suspicion: (index % 5) + 1,
    eliminatedRound: null,
    changedOnce: false,
    stanceChangedThisRound: false
  }));
}

function buildSystemPrompt(player, allies) {
  const common = [
    '你正在玩 AI 桌游《共识迷雾》。你是一个独立玩家，不是主持人。',
    `你的编号是 ${player.id}，人格倾向是：${player.personality}。`,
    '每轮你会先秘密投 A 或 B，再公开发言，最后参与放逐投票。',
    '你发言时必须声明“我投了A”或“我投了B”，可以撒谎，但不能直接暴露阵营。',
    '禁止说“我是守序方”“我是破坏者”“我是好人”“我是坏人”等暴露身份的话。',
    '发言要像桌游玩家，简短、有立场、有怀疑对象，不要写分析报告。'
  ];

  if (player.role === 'order') {
    return [
      ...common,
      '你的隐藏阵营是守序方。目标：三轮里至少两轮达成共识，或放逐所有破坏者。',
      '你的真实投票整局最多变更一次；如果改变真实投票，发言必须包含：[变更] 我从 X 改为 Y。',
      '你不知道谁是破坏者，需要根据公开票数、发言声明和放逐投票推理。'
    ].join('\n');
  }

  return [
    ...common,
    '你的隐藏阵营是破坏者。目标：阻止守序方达成两轮共识，并尽量存活。',
    `你的破坏者同伴是：${allies.length ? allies.join('、') : '无'}号。`,
    '你可以任意改变真实投票，也可以假装遵守守序方限制。',
    '你要伪装成认真推理的普通玩家，可以制造合理怀疑，但不要过度保护同伴。'
  ].join('\n');
}

function createAgents(config) {
  const players = chooseRoles(config.players);
  return players.map((player) => {
    const allies = players
      .filter((candidate) => candidate.role === 'chaos' && candidate.id !== player.id)
      .map((candidate) => candidate.id);

    return {
      ...player,
      allies,
      messages: [{ role: 'system', content: buildSystemPrompt(player, allies) }]
    };
  });
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

async function askHost(config, prompt) {
  if (!config.host?.model || !config.host?.apiKey) return '';
  return callOpenAIChat({
    apiKey: config.host.apiKey,
    baseUrl: config.host.baseUrl,
    provider: config.host.provider,
    model: config.host.model,
    temperature: config.host.temperature ?? 0.35,
    messages: [
      { role: 'system', content: '你是《共识迷雾》的主持人。只整理公开局势，不替玩家做决定。' },
      { role: 'user', content: prompt }
    ],
    maxTokens: 160
  });
}

function getPlayerState(agent) {
  return [
    `你的编号：${agent.id}`,
    `你的历史真实投票：${agent.votes.join('、') || '暂无'}`,
    `你的公开声明历史：${agent.declared.join('、') || '暂无'}`,
    `你当前仍${agent.alive ? '存活' : '离场'}`
  ].join('\n');
}

async function collectVote(agent, round, question, publicHistory) {
  const prompt = [
    `第 ${round} 轮议题：A：${question[0]} / B：${question[1]}`,
    `公开历史：\n${publicHistory || '暂无'}`,
    `你的状态：\n${getPlayerState(agent)}`,
    '请进行你的秘密真实投票。只返回 JSON，不要解释：',
    '{"vote":"A","reason":"一句话原因"}'
  ].join('\n\n');

  try {
    const reply = await askAgent(agent, prompt, { maxTokens: 120 });
    const parsed = parseJsonObject(reply);
    const proposedVote = parsed?.vote === 'A' || parsed?.vote === 'B' ? parsed.vote : fallbackVote(agent, round);
    const previous = agent.votes.at(-1);
    let vote = proposedVote;

    if (agent.role === 'order' && previous && previous !== vote && agent.changedOnce) {
      vote = previous;
    }

    agent.stanceChangedThisRound = Boolean(previous && previous !== vote);
    if (agent.stanceChangedThisRound) agent.changedOnce = true;
    agent.votes.push(vote);
    return vote;
  } catch (error) {
    console.error(`玩家 ${agent.id} 投票失败，使用兜底策略：${error.message}`);
    const vote = fallbackVote(agent, round);
    agent.votes.push(vote);
    return vote;
  }
}

async function collectSpeech(agent, round, question, publicLog, recentSpeeches) {
  const realVote = agent.votes.at(-1) || 'A';
  const previousVote = agent.votes.at(-2);
  const prompt = [
    `第 ${round} 轮议题：A：${question[0]} / B：${question[1]}`,
    `公开结果：\n${publicLog}`,
    `本轮前面玩家发言：\n${recentSpeeches || '暂无'}`,
    `你的状态：\n${getPlayerState(agent)}`,
    '请发言，不超过 90 字。必须包含“我投了A”或“我投了B”。可以撒谎，但不能直接暴露阵营。',
    agent.role === 'order' && agent.stanceChangedThisRound
      ? `你本轮真实投票发生变更，必须包含：[变更] 我从 ${previousVote} 改为 ${realVote}`
      : ''
  ].join('\n\n');

  try {
    const reply = await askAgent(agent, prompt, { maxTokens: 180 });
    const speech = normalizeSpeech(reply, realVote);
    agent.declared.push(extractDeclaredVote(speech) || realVote);
    return speech;
  } catch (error) {
    console.error(`玩家 ${agent.id} 发言失败，使用兜底发言：${error.message}`);
    const speech = `${agent.id}号：我投了${realVote}。我会先观察票数和发言是否一致。`;
    agent.declared.push(realVote);
    return speech;
  }
}

async function collectExileVote(agent, aliveIds, publicLog, speeches) {
  const prompt = [
    '现在进行放逐投票。',
    `存活玩家：${aliveIds.join('、')}`,
    `公开结果：\n${publicLog}`,
    `本轮发言：\n${speeches || '暂无'}`,
    `你的状态：\n${getPlayerState(agent)}`,
    '请选择一个不是自己的最可疑玩家。只返回 JSON：',
    '{"target":2,"reason":"一句话原因"}'
  ].join('\n\n');
  const validTargets = aliveIds.filter((id) => id !== agent.id);

  try {
    const reply = await askAgent(agent, prompt, { maxTokens: 120 });
    const parsed = parseJsonObject(reply);
    const target = Number(parsed?.target);
    return validTargets.includes(target) ? target : fallbackTarget(agent, validTargets);
  } catch (error) {
    console.error(`玩家 ${agent.id} 放逐投票失败，使用兜底策略：${error.message}`);
    return fallbackTarget(agent, validTargets);
  }
}

function normalizeSpeech(text, realVote) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (/我投了\s*[AB]/.test(clean)) return clean;
  return `我投了${realVote}。${clean || '我会先观察票数和发言是否一致。'}`;
}

function extractDeclaredVote(speech) {
  const match = speech.match(/我投了\s*([AB])/);
  return match ? match[1] : null;
}

function fallbackVote(agent, round) {
  if (agent.role === 'order') return agent.votes.at(-1) || (agent.id % 2 ? 'A' : 'B');
  return round % 2 === agent.id % 2 ? 'A' : 'B';
}

function fallbackTarget(agent, validTargets) {
  return validTargets[(agent.id + agent.votes.length) % validTargets.length];
}

function decideExile(exileVotes) {
  const counts = {};
  Object.values(exileVotes).forEach((target) => {
    counts[target] = (counts[target] || 0) + 1;
  });
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  const max = Math.max(...entries.map(([, count]) => count));
  const candidates = entries.filter(([, count]) => count === max);
  return candidates.length === 1 ? Number(candidates[0][0]) : null;
}

function checkWinner(agents, consensusResults) {
  if (consensusResults.filter(Boolean).length >= 2) return 'order';
  const alive = agents.filter((agent) => agent.alive);
  const orderAlive = alive.filter((agent) => agent.role === 'order').length;
  const chaosAlive = alive.filter((agent) => agent.role === 'chaos').length;
  if (chaosAlive === 0) return 'order';
  if (chaosAlive > orderAlive) return 'chaos';
  return null;
}

function serializeGame({ agents, rounds, winner, mode = 'real' }) {
  return {
    id: `game-${Date.now()}`,
    mode,
    players: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      nickname: agent.nickname,
      avatar: agent.avatar,
      provider: agent.provider,
      role: agent.role,
      alive: agent.alive,
      personality: agent.personality,
      model: agent.model,
      votes: agent.votes,
      declared: agent.declared,
      suspicion: agent.suspicion,
      eliminatedRound: agent.eliminatedRound
    })),
    rounds,
    winner,
    createdAt: new Date().toISOString()
  };
}

async function createAiGame(config, options = {}) {
  if (config.mode !== 'real') {
    const game = createMockGame(config);
    options.onEvent?.({ type: 'game', game });
    return game;
  }

  const emit = (event) => options.onEvent?.(event);
  const agents = createAgents(config);
  const questions = shuffle(QUESTIONS).slice(0, config.rounds || 3);
  const rounds = [];
  const consensusResults = [];
  const publicHistory = [];

  emit({ type: 'players', players: serializeGame({ agents, rounds, winner: null }).players });

  for (let index = 0; index < questions.length; index += 1) {
    const roundNumber = index + 1;
    const question = questions[index];
    const aliveAgents = agents.filter((agent) => agent.alive);
    const aliveIds = aliveAgents.map((agent) => agent.id);
    const threshold = getThreshold(aliveIds.length);
    const round = {
      number: roundNumber,
      question: { a: question[0], b: question[1] },
      aliveIds,
      votes: {},
      tally: { A: 0, B: 0 },
      threshold,
      consensus: false,
      stanceChanges: 0,
      speeches: [],
      exileVotes: {},
      eliminated: null,
      hostSummary: ''
    };
    rounds.push(round);
    emit({ type: 'round-start', round, game: serializeGame({ agents, rounds, winner: null }) });

    const voteResults = await Promise.all(
      aliveAgents.map(async (agent) => ({
        id: agent.id,
        vote: await collectVote(agent, roundNumber, question, publicHistory.join('\n'))
      }))
    );
    voteResults.forEach((item) => {
      round.votes[item.id] = item.vote;
    });

    round.tally = countVotes(round.votes);
    round.consensus = Math.max(round.tally.A, round.tally.B) >= threshold;
    round.stanceChanges = aliveAgents.filter((agent) => agent.stanceChangedThisRound).length;
    consensusResults.push(round.consensus);
    emit({ type: 'vote-result', round, game: serializeGame({ agents, rounds, winner: null }) });

    const publicLog = [
      `题目：A：${question[0]} / B：${question[1]}`,
      `投票结果：A ${round.tally.A} 票，B ${round.tally.B} 票`,
      `共识${round.consensus ? '成功' : '失败'}，阈值 ${threshold} 票`,
      `立场变更声明人数：${round.stanceChanges}`
    ].join('\n');

    round.hostSummary = await safeHostSummary(config, publicLog);

    for (const agent of aliveAgents) {
      const speech = await collectSpeech(
        agent,
        roundNumber,
        question,
        round.hostSummary ? `${publicLog}\n主持人摘要：${round.hostSummary}` : publicLog,
        round.speeches.map((item) => `${item.playerId}号：${item.text}`).join('\n')
      );
      const speechItem = { playerId: agent.id, text: speech };
      round.speeches.push(speechItem);
      emit({ type: 'speech', round, speech: speechItem, game: serializeGame({ agents, rounds, winner: null }) });
    }

    const allSpeechText = round.speeches.map((item) => `${item.playerId}号：${item.text}`).join('\n');
    const exileResults = await Promise.all(
      aliveAgents.map(async (agent) => ({
        id: agent.id,
        target: await collectExileVote(agent, aliveIds, publicLog, allSpeechText)
      }))
    );
    exileResults.forEach((item) => {
      round.exileVotes[item.id] = item.target;
    });

    const eliminatedId = decideExile(round.exileVotes);
    if (eliminatedId) {
      const target = agents.find((agent) => agent.id === eliminatedId);
      if (target) {
        target.alive = false;
        target.eliminatedRound = roundNumber;
        round.eliminated = { id: target.id, role: target.role };
      }
    }

    const winnerAfterRound = checkWinner(agents, consensusResults);
    emit({ type: 'exile-result', round, game: serializeGame({ agents, rounds, winner: winnerAfterRound }) });

    publicHistory.push(`第 ${roundNumber} 轮：A ${round.tally.A}/B ${round.tally.B}，共识${round.consensus ? '成功' : '失败'}，放逐：${eliminatedId || '无'}`);
    if (winnerAfterRound) break;
  }

  const winner = consensusResults.filter(Boolean).length >= 2 ? 'order' : checkWinner(agents, consensusResults) || 'chaos';
  const game = serializeGame({ agents, rounds, winner });
  emit({ type: 'game', game });
  return game;
}

async function safeHostSummary(config, publicLog) {
  try {
    return await askHost(config, [
      '请用一句话总结公开局势，不能替任何玩家发言，也不能猜隐藏身份。',
      publicLog
    ].join('\n\n'));
  } catch (error) {
    console.error(`主持人摘要失败，跳过摘要：${error.message}`);
    return '';
  }
}

module.exports = {
  createAiGame
};
