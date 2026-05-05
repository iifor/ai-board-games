const { callOpenAIChat, parseJsonObject } = require('./openaiChat');

const PHASES = [
  { id: 'strategy', name: '队长战术部署', limit: 120 },
  { id: 'opening', name: '立论陈词', limit: 180 },
  { id: 'crossfire', name: '正反攻辩阶段', limit: 100 },
  { id: 'free', name: '自由辩论', limit: 80 },
  { id: 'closing', name: '总结陈词', limit: 160 },
  { id: 'mvp', name: '评选 MVP', limit: 80 },
  { id: 'judges', name: '评委点评', limit: 120 },
  { id: 'reflection', name: '赛后感言', limit: 80 }
];

const TOPICS = [
  {
    title: 'AI 应该拥有参与重大公共决策的投票权吗？',
    proPosition: 'AI 应该在限定范围内拥有公共决策投票权',
    conPosition: 'AI 不应该拥有公共决策投票权'
  },
  {
    title: '未来学校是否应该把 AI 导师作为主教师？',
    proPosition: 'AI 导师可以成为主教师',
    conPosition: 'AI 导师不能取代人类主教师'
  },
  {
    title: '开放强 AI 模型能力是否利大于弊？',
    proPosition: '开放强 AI 模型能力利大于弊',
    conPosition: '开放强 AI 模型能力弊大于利'
  },
  {
    title: '人类是否应该允许 AI 创作作品独立署名？',
    proPosition: '应该允许 AI 独立署名',
    conPosition: '不应该允许 AI 独立署名'
  }
];

function shuffle(items) {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function choose(items) {
  return items[Math.floor(Math.random() * items.length)];
}

function createDebateAgents(config, topic) {
  const selected = shuffle(config.players).slice(0, Math.min(12, Math.max(8, config.players.length)));
  const proCaptainIndex = Math.floor(Math.random() * 4);
  const conCaptainIndex = 4 + Math.floor(Math.random() * 4);

  return selected.map((player, index) => {
    const side = index < 4 ? 'pro' : index < 8 ? 'con' : 'judge';
    const debateRole = side === 'judge'
      ? 'judge'
      : index === proCaptainIndex || index === conCaptainIndex
        ? 'captain'
        : 'debater';
    const agent = {
      ...player,
      side,
      debateRole,
      sideLabel: side === 'pro' ? '正方' : side === 'con' ? '反方' : '评委席',
      debateRoleLabel: debateRole === 'captain' ? '队长' : debateRole === 'judge' ? '评委' : '选手',
      speeches: [],
      messages: []
    };
    agent.messages = [{ role: 'system', content: buildSystemPrompt(agent, topic, PHASES[0]) }];
    return agent;
  });
}

function buildSystemPrompt(agent, topic, phase) {
  if (agent.side === 'judge') {
    return [
      '你是《AI 辩论赛》的评委。你不是正反方选手。',
      `你的编号是 ${agent.id}，昵称是 ${agent.nickname}，人格倾向是：${agent.personality}。`,
      '你需要依据论点清晰度、反驳质量、团队协作、表达感染力进行判断。',
      '点评要具体指出双方亮点和问题，不能只说空话。',
      'MVP 投票必须从正反方 8 位选手中选择 1 位，并给出理由。',
      `严格遵守当前环节字数限制：${phase.limit}。`
    ].join('\n');
  }

  return [
    '你正在参加《AI 辩论赛》。你不是主持人。',
    `你的编号是 ${agent.id}，昵称是 ${agent.nickname}，人格倾向是：${agent.personality}。`,
    `你的阵营是：${agent.sideLabel}。你的身份是：${agent.debateRoleLabel}。`,
    `辩题：${topic.title}`,
    `你的立场：${agent.side === 'pro' ? topic.proPosition : topic.conPosition}`,
    '你的目标是帮助本方赢得辩论，同时保持自然、有个性的表达。',
    '必须围绕辩题发言；可以反驳、举例、追问、让步后反击，但不要编造不存在的赛制信息。',
    `严格遵守当前环节字数限制：${phase.limit}。`,
    '不要输出 JSON，除非主持人明确要求。',
    agent.debateRole === 'captain'
      ? '你是本方队长。你需要给队友制定战术：核心论点、攻击重点、防守底线、发言分工。战术部署只面向本方，不要写给对方或评委。'
      : ''
  ].filter(Boolean).join('\n');
}

function buildHostPrompt(topic, phaseName) {
  return [
    '你是《AI 辩论赛》的主持人。你的职责是推进赛程、宣布辩题、介绍阵营、控制发言顺序、总结环节结果、评选或汇总 MVP、保持节奏和公平。',
    '你不能代替选手辩论，不能泄露队长私下部署内容，不能偏袒任一方。',
    '输出要像现场主持，简洁、有仪式感、信息明确。每次主持播报不超过 100 字。',
    `当前辩题：${topic.title}`,
    `正方观点：${topic.proPosition}`,
    `反方观点：${topic.conPosition}`,
    `当前环节：${phaseName}`
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

async function askHost(config, topic, phaseName, prompt, maxTokens = 160) {
  const messages = [
    { role: 'system', content: buildHostPrompt(topic, phaseName) },
    { role: 'user', content: prompt }
  ];
  return callOpenAIChat({
    apiKey: config.host.apiKey,
    baseUrl: config.host.baseUrl,
    provider: config.host.provider,
    model: config.host.model,
    temperature: config.host.temperature,
    messages,
    maxTokens
  });
}

function normalizeText(text, limit, fallback) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return fallback.slice(0, limit);
  return clean.slice(0, limit);
}

async function collectSpeech(agent, phase, context, instruction, fallback, maxTokens = 260) {
  if (!agent.apiKey) return normalizeText(fallback, phase.limit, fallback);
  try {
    const reply = await askAgent(agent, [
      `当前环节：${phase.name}`,
      `字数限制：${phase.limit}字以内`,
      `赛况：\n${context || '比赛刚开始。'}`,
      instruction
    ].join('\n\n'), { maxTokens });
    return normalizeText(reply, phase.limit, fallback);
  } catch (error) {
    console.error(`辩论赛 ${agent.nickname || agent.id} 发言失败，使用兜底：${error.message}`);
    return normalizeText(fallback, phase.limit, fallback);
  }
}

function createPhase(id) {
  const source = PHASES.find((item) => item.id === id);
  return { ...source, speeches: [], votes: [], summary: '' };
}

function pushSpeech(phase, agent, text, kind = 'speech', targetId = null) {
  const item = {
    phaseId: phase.id,
    kind,
    playerId: agent.id,
    side: agent.side,
    debateRole: agent.debateRole,
    text,
    targetId
  };
  phase.speeches.push(item);
  agent.speeches.push(item);
  return item;
}

function publicDebateLog(phases) {
  return phases
    .flatMap((phase) => phase.speeches.map((speech) => `${phase.name}｜${speech.playerId}号：${speech.text}`))
    .slice(-18)
    .join('\n');
}

function serializeGame({ gameId, mode, topic, agents, phases, winner = null, mvp = null, winReason = '' }) {
  return {
    id: gameId,
    type: 'debate',
    mode,
    topic,
    event: {
      id: 'ai-debate',
      name: 'AI 辩论赛',
      version: 'v1.0',
      background: `辩题：${topic.title}\n正方：${topic.proPosition}\n反方：${topic.conPosition}`,
      terms: { investigators: '正方', mist: '反方', keyFigure: 'MVP', cover: '评委' },
      truth: ''
    },
    players: agents.map((agent) => ({
      id: agent.id,
      name: agent.name,
      nickname: agent.nickname,
      avatar: agent.avatar,
      provider: agent.provider,
      model: agent.model,
      sex: agent.sex || '未知',
      personality: agent.personality,
      side: agent.side,
      sideLabel: agent.sideLabel,
      debateRole: agent.debateRole,
      debateRoleLabel: agent.debateRoleLabel,
      role: agent.side,
      roleLabel: `${agent.sideLabel}${agent.debateRole === 'captain' ? '队长' : agent.debateRole === 'judge' ? '评委' : '选手'}`,
      alive: true,
      excluded: false
    })),
    phases,
    rounds: phases.map((phase, index) => ({
      number: index + 1,
      phase: phase.id,
      title: phase.name,
      speeches: phase.speeches,
      aliveIds: agents.map((agent) => agent.id),
      votes: {},
      tally: { A: 0, B: 0 },
      consensusType: 'effective',
      consensus: true
    })),
    mvp,
    winner,
    winReason,
    createdAt: new Date().toISOString()
  };
}

async function runAiDebate(config, options = {}) {
  if (config.mode !== 'real') return runMockDebate(config, options);

  const emit = async (event) => options.onEvent ? options.onEvent(event) : undefined;
  const topic = choose(TOPICS);
  const agents = createDebateAgents(config, topic);
  const phases = [];
  const gameId = `debate-${Date.now()}`;
  let winner = null;
  let mvp = null;
  let winReason = '';

  await emit({ type: 'players', players: serializeGame({ gameId, mode: 'real', topic, agents, phases }).players, game: serializeGame({ gameId, mode: 'real', topic, agents, phases }) });

  await runPhase(config, emit, { gameId, mode: 'real', topic, agents, phases }, 'strategy', async (phase) => {
    for (const captain of agents.filter((agent) => agent.debateRole === 'captain')) {
      const text = await collectSpeech(captain, phase, publicDebateLog(phases), '请给本方队友做战术部署。', `${captain.sideLabel}先稳住核心论点，抓住对方定义漏洞，队友分工补证据和反问。`);
      await emitSpeech(emit, { gameId, mode: 'real', topic, agents, phases }, phase, captain, text, 'strategy');
    }
  });

  await runPhase(config, emit, { gameId, mode: 'real', topic, agents, phases }, 'opening', async (phase) => {
    for (const agent of [firstDebater(agents, 'pro'), firstDebater(agents, 'con')].filter(Boolean)) {
      const text = await collectSpeech(agent, phase, publicDebateLog(phases), '请完成本方立论陈词。', `${agent.sideLabel}认为本方立场更能兼顾现实约束与长期价值，核心标准应当先被清晰定义。`);
      await emitSpeech(emit, { gameId, mode: 'real', topic, agents, phases }, phase, agent, text, 'opening');
    }
  });

  await runPhase(config, emit, { gameId, mode: 'real', topic, agents, phases }, 'crossfire', async (phase) => {
    const pro = agents.filter((agent) => agent.side === 'pro').slice(1, 3);
    const con = agents.filter((agent) => agent.side === 'con').slice(1, 3);
    const pairs = [[pro[0], con[0]], [con[0], pro[1]], [pro[1], con[1]], [con[1], pro[0]]].filter(([a, b]) => a && b);
    for (const [questioner, responder] of pairs) {
      const question = await collectSpeech(questioner, { ...phase, limit: 60 }, publicDebateLog(phases), `请向${responder.sideLabel}${responder.id}号提出一个尖锐问题。`, `请问对方如何解释本方标准下的关键风险？`, 160);
      await emitSpeech(emit, { gameId, mode: 'real', topic, agents, phases }, phase, questioner, question, 'question', responder.id);
      const answer = await collectSpeech(responder, phase, publicDebateLog(phases), `请回应${questioner.id}号刚才的问题，并反击一句。`, `这个问题忽略了前提差异，我方标准更能处理边界情况。`, 180);
      await emitSpeech(emit, { gameId, mode: 'real', topic, agents, phases }, phase, responder, answer, 'answer', questioner.id);
    }
  });

  await runPhase(config, emit, { gameId, mode: 'real', topic, agents, phases }, 'free', async (phase) => {
    let previousId = null;
    for (let i = 0; i < 8; i += 1) {
      const side = i % 2 === 0 ? 'pro' : 'con';
      const candidates = agents.filter((agent) => agent.side === side && agent.id !== previousId);
      const agent = choose(candidates);
      previousId = agent.id;
      const text = await collectSpeech(agent, phase, publicDebateLog(phases), '请进行自由辩论发言，回应最近争点并推进本方论证。', `${agent.sideLabel}补充一点：对方刚才回避了评判标准，我方才是在处理真实场景。`);
      await emitSpeech(emit, { gameId, mode: 'real', topic, agents, phases }, phase, agent, text, 'free');
    }
  });

  await runPhase(config, emit, { gameId, mode: 'real', topic, agents, phases }, 'closing', async (phase) => {
    for (const captain of agents.filter((agent) => agent.debateRole === 'captain')) {
      const text = await collectSpeech(captain, phase, publicDebateLog(phases), '请完成本方总结陈词。', `${captain.sideLabel}总结：我方完成了定义、风险和价值三层证明，对方关键反驳没有击穿核心标准。`);
      await emitSpeech(emit, { gameId, mode: 'real', topic, agents, phases }, phase, captain, text, 'closing');
    }
  });

  const result = await runAwardPhases(config, emit, { gameId, mode: 'real', topic, agents, phases });
  winner = result.winner;
  mvp = result.mvp;
  winReason = result.winReason;

  await runPhase(config, emit, { gameId, mode: 'real', topic, agents, phases, winner, mvp, winReason }, 'reflection', async (phase) => {
    const speakers = pickReflectionSpeakers(agents, mvp);
    for (const agent of speakers) {
      const text = await collectSpeech(agent, phase, publicDebateLog(phases), '请发表赛后感言。', `这场辩论让我重新看见了问题的复杂性，也感谢队友和对手的交锋。`);
      await emitSpeech(emit, { gameId, mode: 'real', topic, agents, phases, winner, mvp, winReason }, phase, agent, text, 'reflection');
    }
  });

  const game = serializeGame({ gameId, mode: 'real', topic, agents, phases, winner, mvp, winReason });
  await emit({ type: 'game', game });
  return game;
}

async function runPhase(config, emit, state, phaseId, action) {
  const phase = createPhase(phaseId);
  state.phases.push(phase);
  const hostText = await safeHost(config, state.topic, phase.name, `请宣布进入「${phase.name}」环节。`, `现在进入${phase.name}。`);
  phase.summary = hostText;
  await emit({ type: 'phase-start', phase, message: hostText, game: serializeGame(state) });
  await action(phase);
  await emit({ type: 'phase-end', phase, message: `${phase.name}结束。`, game: serializeGame(state) });
}

async function safeHost(config, topic, phaseName, prompt, fallback) {
  if (!config.host?.apiKey) return fallback;
  try {
    const reply = await askHost(config, topic, phaseName, prompt, 140);
    return normalizeText(reply, 100, fallback);
  } catch (error) {
    console.error(`主持人生成失败，使用兜底：${error.message}`);
    return fallback;
  }
}

async function emitSpeech(emit, state, phase, agent, text, kind, targetId = null) {
  const speech = pushSpeech(phase, agent, text, kind, targetId);
  await emit({ type: 'speech', phase, speech, game: serializeGame(state) });
}

async function runAwardPhases(config, emit, state) {
  const contestants = state.agents.filter((agent) => agent.side === 'pro' || agent.side === 'con');
  const judges = state.agents.filter((agent) => agent.side === 'judge');
  const mvpPhase = createPhase('mvp');
  state.phases.push(mvpPhase);
  mvpPhase.summary = '现在进入 MVP 评选。';
  await emit({ type: 'phase-start', phase: mvpPhase, message: mvpPhase.summary, game: serializeGame(state) });

  const mvpVotes = {};
  if (judges.length) {
    for (const judge of judges) {
      const vote = await collectJudgeVote(judge, contestants, state.phases);
      mvpVotes[judge.id] = vote.target;
      mvpPhase.votes.push(vote);
      const speech = pushSpeech(mvpPhase, judge, vote.reason, 'mvp-vote', vote.target);
      await emit({ type: 'speech', phase: mvpPhase, speech, game: serializeGame(state) });
    }
  }
  const mvpId = judges.length ? topVotedId(mvpVotes) : choose(contestants).id;
  const mvp = publicPlayer(contestants.find((agent) => agent.id === mvpId) || contestants[0]);
  if (!judges.length) {
    const hostPick = `本场没有评委席，主持人评选 ${mvp.nickname || mvp.id + '号'} 为 MVP：表达稳定，能持续推进争点。`;
    mvpPhase.summary = hostPick;
    await emit({ type: 'host', message: hostPick, game: serializeGame(state) });
  }
  await emit({ type: 'phase-end', phase: mvpPhase, message: 'MVP 评选完成。', game: serializeGame({ ...state, mvp }) });

  const judgePhase = createPhase('judges');
  state.phases.push(judgePhase);
  judgePhase.summary = judges.length ? '现在进入评委点评。' : '本场无评委席，由主持人进行点评。';
  await emit({ type: 'phase-start', phase: judgePhase, message: judgePhase.summary, game: serializeGame({ ...state, mvp }) });
  const winnerVotes = {};
  if (judges.length) {
    for (const judge of judges) {
      const review = await collectJudgeReview(judge, state.phases);
      winnerVotes[judge.id] = review.winner;
      const speech = pushSpeech(judgePhase, judge, review.text, 'judge-review');
      await emit({ type: 'speech', phase: judgePhase, speech, game: serializeGame({ ...state, mvp }) });
    }
  } else {
    const hostText = await safeHost(config, state.topic, judgePhase.name, `请根据赛况点评双方表现，并给出胜负倾向。赛况：\n${publicDebateLog(state.phases)}`, '正方结构更完整，反方反击更锋利；综合推进质量，正方略胜。');
    const host = { id: '主持', side: 'host', debateRole: 'host', speeches: [] };
    const speech = pushSpeech(judgePhase, host, hostText.slice(0, 160), 'judge-review');
    await emit({ type: 'speech', phase: judgePhase, speech, game: serializeGame({ ...state, mvp }) });
    winnerVotes.host = hostText.includes('反方') && !hostText.includes('正方略胜') ? 'con' : 'pro';
  }
  const winner = topWinner(winnerVotes);
  const winReason = winner === 'draw' ? '评委意见接近，双方战成平局。' : `${winner === 'pro' ? '正方' : '反方'}获得更多评委倾向。`;
  await emit({ type: 'phase-end', phase: judgePhase, message: '评委点评完成。', game: serializeGame({ ...state, winner, mvp, winReason }) });
  return { winner, mvp, winReason };
}

async function collectJudgeVote(judge, contestants, phases) {
  const fallback = contestants[Math.floor(Math.random() * contestants.length)];
  try {
    const reply = await askAgent(judge, [
      '请从正反方 8 位选手中评选 MVP。',
      `可选对象：${contestants.map((agent) => `${agent.id}号${agent.nickname}`).join('、')}`,
      `赛况：\n${publicDebateLog(phases)}`,
      '只返回 JSON：{"target":2,"reason":"80字以内理由"}'
    ].join('\n\n'), { maxTokens: 160 });
    const parsed = parseJsonObject(reply);
    const target = Number(parsed?.target);
    const valid = contestants.some((agent) => agent.id === target) ? target : fallback.id;
    return { judgeId: judge.id, target: valid, reason: normalizeText(parsed?.reason, 80, `${valid}号在关键争点上表现突出。`) };
  } catch {
    return { judgeId: judge.id, target: fallback.id, reason: `${fallback.id}号在关键争点上表现突出。` };
  }
}

async function collectJudgeReview(judge, phases) {
  try {
    const reply = await askAgent(judge, [
      '请点评双方表现，并给出胜负倾向。',
      `赛况：\n${publicDebateLog(phases)}`,
      '只返回 JSON：{"winner":"pro","text":"120字以内点评"}，winner 只能是 pro/con/draw。'
    ].join('\n\n'), { maxTokens: 220 });
    const parsed = parseJsonObject(reply);
    const winner = ['pro', 'con', 'draw'].includes(parsed?.winner) ? parsed.winner : 'draw';
    return { winner, text: normalizeText(parsed?.text, 120, '双方都有亮点，正方结构完整，反方反击积极，胜负取决于评判标准。') };
  } catch {
    return { winner: 'draw', text: '双方都有亮点，正方结构完整，反方反击积极，胜负取决于评判标准。' };
  }
}

function runMockDebate(config, options = {}) {
  const emit = async (event) => options.onEvent ? options.onEvent(event) : undefined;
  return createMockDebate(config, emit);
}

async function createMockDebate(config, emit) {
  const topic = choose(TOPICS);
  const agents = createDebateAgents(config, topic);
  const phases = [];
  const gameId = `mock-debate-${Date.now()}`;
  await emit({ type: 'players', players: serializeGame({ gameId, mode: 'mock', topic, agents, phases }).players, game: serializeGame({ gameId, mode: 'mock', topic, agents, phases }) });

  for (const phaseDef of PHASES) {
    const phase = createPhase(phaseDef.id);
    phases.push(phase);
    phase.summary = `现在进入${phase.name}。`;
    await emit({ type: 'phase-start', phase, message: phase.summary, game: serializeGame({ gameId, mode: 'mock', topic, agents, phases }) });
    for (const item of mockSpeakersForPhase(phase.id, agents)) {
      const text = mockLine(item, phase, topic);
      const speech = pushSpeech(phase, item, text, phase.id);
      await emit({ type: 'speech', phase, speech, game: serializeGame({ gameId, mode: 'mock', topic, agents, phases }) });
    }
    await emit({ type: 'phase-end', phase, message: `${phase.name}结束。`, game: serializeGame({ gameId, mode: 'mock', topic, agents, phases }) });
  }

  const contestants = agents.filter((agent) => agent.side !== 'judge');
  const mvp = publicPlayer(contestants[0]);
  const winner = Math.random() > 0.5 ? 'pro' : 'con';
  const winReason = `${winner === 'pro' ? '正方' : '反方'}在 Mock 赛中获得更多倾向。`;
  const game = serializeGame({ gameId, mode: 'mock', topic, agents, phases, winner, mvp, winReason });
  await emit({ type: 'game', game });
  return game;
}

function mockSpeakersForPhase(phaseId, agents) {
  const pro = agents.filter((agent) => agent.side === 'pro');
  const con = agents.filter((agent) => agent.side === 'con');
  const judges = agents.filter((agent) => agent.side === 'judge');
  if (phaseId === 'strategy') return [pro.find((a) => a.debateRole === 'captain'), con.find((a) => a.debateRole === 'captain')].filter(Boolean);
  if (phaseId === 'opening') return [pro[0], con[0]];
  if (phaseId === 'crossfire') return [pro[1], con[1], pro[2], con[2]].filter(Boolean);
  if (phaseId === 'free') return [pro[0], con[0], pro[1], con[1], pro[2], con[2], pro[3], con[3]].filter(Boolean);
  if (phaseId === 'closing') return [pro.find((a) => a.debateRole === 'captain'), con.find((a) => a.debateRole === 'captain')].filter(Boolean);
  if (phaseId === 'mvp') return judges.length ? judges : [pro[0]];
  if (phaseId === 'judges') return judges.length ? judges : [pro[0]];
  return [pro[0], con[0], pro[1], con[1]].filter(Boolean);
}

function mockLine(agent, phase, topic) {
  if (phase.id === 'mvp') return `${agent.nickname || agent.id + '号'}认为本场 MVP 应给到持续推进关键争点的选手。`;
  if (phase.id === 'judges') return '正方结构更完整，反方质询更有压迫感；我会把胜负交给谁更好回应了现实风险。';
  if (phase.id === 'strategy') return `${agent.sideLabel}要先定义标准，再围绕${topic.title.slice(0, 12)}抓对方漏洞，发言保持短促有力。`;
  return `${agent.sideLabel}${agent.debateRoleLabel}认为，本方立场更能解释辩题中的关键矛盾，对方需要回答现实边界。`;
}

function firstDebater(agents, side) {
  return agents.find((agent) => agent.side === side && agent.debateRole !== 'captain') || agents.find((agent) => agent.side === side);
}

function pickReflectionSpeakers(agents, mvp) {
  const contestants = agents.filter((agent) => agent.side === 'pro' || agent.side === 'con');
  const picked = new Map();
  if (mvp?.id) {
    const mvpAgent = contestants.find((agent) => agent.id === mvp.id);
    if (mvpAgent) picked.set(mvpAgent.id, mvpAgent);
  }
  for (const side of ['pro', 'con']) {
    shuffle(contestants.filter((agent) => agent.side === side)).slice(0, 2).forEach((agent) => picked.set(agent.id, agent));
  }
  return Array.from(picked.values()).slice(0, 5);
}

function publicPlayer(agent) {
  return agent ? { id: agent.id, nickname: agent.nickname, side: agent.side, sideLabel: agent.sideLabel } : null;
}

function topVotedId(votes) {
  const counts = {};
  Object.values(votes).forEach((id) => {
    counts[id] = (counts[id] || 0) + 1;
  });
  const entries = Object.entries(counts);
  if (!entries.length) return null;
  entries.sort((a, b) => b[1] - a[1]);
  return Number(entries[0][0]);
}

function topWinner(votes) {
  const counts = { pro: 0, con: 0, draw: 0 };
  Object.values(votes).forEach((winner) => {
    if (counts[winner] !== undefined) counts[winner] += 1;
  });
  if (counts.pro === counts.con) return 'draw';
  return counts.pro > counts.con ? 'pro' : 'con';
}

module.exports = {
  runAiDebate,
  PHASES
};
