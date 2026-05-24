const { callOpenAIChat, callModelChatWithThinking, parseJsonObject, cachedLlmCall } = require('./modules/llm');

const { buildPlayerPersonaModule, compilePromptModules, hashText } = require('./services/ai/promptComposer');
const { syncMissingPublicMemory } = require('./modules/game-memory');
const { DEBATE } = require('../shared/constants/gameLimits');
const { createTraceContext, flushTrace, markTraceComplete, markTraceError, recordSnapshot, recordEvent, startPhaseSpan, endSpan } = require('./modules/observability');

const PHASE_LIMITS = DEBATE.PHASE_LIMITS;

const PHASES = [
  { id: 'strategy', name: '队长战术部署', limit: PHASE_LIMITS.strategy },
  { id: 'opening', name: '立论陈词', limit: PHASE_LIMITS.opening },
  { id: 'crossfire', name: '正反攻辩', limit: PHASE_LIMITS.crossfire },
  { id: 'free', name: '自由辩论', limit: PHASE_LIMITS.free },
  { id: 'closing', name: '总结陈词', limit: PHASE_LIMITS.closing },
  { id: 'judges', name: '评委点评', limit: PHASE_LIMITS.judges },
  { id: 'mvp', name: '评选最佳辩手', limit: PHASE_LIMITS.mvp },
  { id: 'postgame', name: '赛后发言', limit: PHASE_LIMITS.postgame }
];
const TOPICS = [
  {
    title: 'AI 应该拥有参与重大公共决策的投票权吗？',
    proPosition: 'AI 应该在限定范围内拥有公共决策投票权',
    conPosition: 'AI 不应该拥有公共决策投票权'
  },
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

function normalizeTopic(input) {
  const title = String(input?.title || '').trim();
  const proPosition = String(input?.proPosition || '').trim();
  const conPosition = String(input?.conPosition || '').trim();
  if (!title || !proPosition || !conPosition) return null;
  return { title, proPosition, conPosition };
}

function getDebateRoleName(agent) {
  if (!agent) return '辩手';
  if (agent.side === 'judge') return '评委';
  const sideLabel = agent.side === 'pro' ? '正方' : '反方';
  const ordinal = ['零', '一', '二', '三', '四'][Number(agent.sideIndex || 0) + 1] || String(Number(agent.sideIndex || 0) + 1);
  return `${sideLabel}${ordinal}辩`;
}

function createDebateAgents(config, topic) {
  const setup = getConfiguredDebateSetup(config);
  const selected = setup.players;

  return selected.map((player, index) => {
    const side = index < 4 ? 'pro' : index < 8 ? 'con' : 'judge';
    const debateRole = side === 'judge'
      ? 'judge'
      : Number(player.id) === Number(side === 'pro' ? setup.proCaptainId : setup.conCaptainId)
        ? 'captain'
        : 'debater';
    const agent = {
      ...player,
      side,
      sideIndex: side === 'judge' ? null : index % 4,
      debateRole,
      sideLabel: side === 'pro' ? '正方' : side === 'con' ? '反方' : '评委席',
      debateRoleLabel: debateRole === 'captain' ? '队长' : debateRole === 'judge' ? '评委' : '选手',
      speeches: [],
      messages: []
    };
    agent.baseSystemPrompt = buildSystemPrompt(agent, topic, PHASES[0]);
    agent.baseSystemPromptHash = hashText(agent.baseSystemPrompt);
    agent.messages = [{ role: 'system', content: agent.baseSystemPrompt }];
    return agent;
  });
}

function getConfiguredDebateSetup(config) {
  const playerMap = new Map(config.players.map((player) => [Number(player.id), player]));
  const teamConfig = normalizeDebateTeams(config.debateTeams, playerMap);
  if (!teamConfig) {
    const players = shuffle(config.players).slice(0, Math.min(12, Math.max(8, config.players.length)));
    return {
      players,
      proCaptainId: players[0]?.id,
      conCaptainId: players[4]?.id
    };
  }

  const players = [...teamConfig.pro, ...teamConfig.con, ...teamConfig.judges]
    .map((id) => playerMap.get(Number(id)))
    .filter(Boolean);
  return {
    players,
    proCaptainId: teamConfig.proCaptainId,
    conCaptainId: teamConfig.conCaptainId
  };
}

function normalizeDebateTeams(value, playerMap) {
  if (!value || !Array.isArray(value.proIds) || !Array.isArray(value.conIds)) return null;
  const pro = uniqueValidIds(value.proIds, playerMap).slice(0, 4);
  const con = uniqueValidIds(value.conIds, playerMap).filter((id) => !pro.includes(id)).slice(0, 4);
  if (pro.length !== 4 || con.length !== 4) return null;

  const assigned = new Set([...pro, ...con]);
  const configuredJudges = uniqueValidIds(value.judgeIds, playerMap).filter((id) => !assigned.has(id));
  const remaining = [...playerMap.keys()]
    .filter((id) => !assigned.has(id) && !configuredJudges.includes(id))
    .slice(0, Math.max(0, 12 - pro.length - con.length - configuredJudges.length));
  const captainEnabled = value.captainEnabled !== false;
  const proCaptainId = captainEnabled && pro.includes(Number(value.proCaptainId)) ? Number(value.proCaptainId) : captainEnabled ? pro[0] : null;
  const conCaptainId = captainEnabled && con.includes(Number(value.conCaptainId)) ? Number(value.conCaptainId) : captainEnabled ? con[0] : null;
  return { pro, con, judges: [...configuredJudges, ...remaining], proCaptainId, conCaptainId };
}

function uniqueValidIds(value, playerMap) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => playerMap.has(id)))];
}

function buildSystemPrompt(agent, topic, phase) {
  const personaModule = buildPlayerPersonaModule(agent);
  if (agent.side === 'judge') {
    return compilePromptModules([
      '你是《AI 辩论赛》的评委。你不是正反方选手。',
      `你的场上称谓是${getDebateRoleName(agent)}。`,
      personaModule,
      '发言时不要自称几号，也不要用几号称呼自己；请以评委身份发言。',
      '你需要依据论点清晰度、反驳质量、团队协作、表达感染力进行判断。',
      '点评要具体指出双方亮点和问题，不能只说空话。',
      'MVP 投票必须从正反方 8 位选手中选择 1 位；投票任务只返回目标，不需要理由。',
      `严格遵守当前环节字数限制：${phase.limit}。`
    ]).text;
  }

  return compilePromptModules([
    '你正在参加《AI 辩论赛》。你不是主持人。',
    `你的场上称谓是${getDebateRoleName(agent)}。`,
    personaModule,
    `你的阵营是：${agent.sideLabel}。你的身份是：${agent.debateRoleLabel}。`,
    `辩题：${topic.title}`,
    `你的立场：${agent.side === 'pro' ? topic.proPosition : topic.conPosition}`,
    '你的目标是帮助本方赢得辩论，同时保持自然、有个性的表达。',
    '发言时不要自称几号，也不要用几号称呼自己；',
    '必须围绕辩题发言；可以反驳、举例、追问、让步后反击，但不要编造不存在的赛制信息。',
    `严格遵守当前环节字数限制：${phase.limit}。`,
    '不要输出 JSON，除非主持人明确要求。',
    agent.debateRole === 'captain'
      ? '你是本方队长。你需要给队友制定战术：核心论点、攻击重点、防守底线、发言分工。战术部署只面向本方，不要写给对方或评委。'
      : ''
  ]).text;
}

function buildHostPrompt(topic, phaseName, options = {}) {
  const lines = [
    '你是《AI 辩论赛》的主持人。你的职责是推进赛程、宣布辩题、介绍阵营、控制发言顺序、总结环节结果、汇总 MVP 投票、保持节奏和公平。',
    '你不能代替选手辩论，不能泄露队长私下部署内容，不能偏袒任一方。',
    `输出要像现场主持，简洁、有仪式感、信息明确。每次主持播报建议不超过 ${DEBATE.HOST_ANNOUNCE_CHAR_LIMIT} 字（弱约束，超出也正常输出）。`,
    options.includeTopic
      ? `本场开局首次播报可以介绍辩题和双方立场：辩题「${topic.title}」；正方「${topic.proPosition}」；反方「${topic.conPosition}」。`
      : '本场辩题和正反方立场已经在开局播报过。之后进入阶段时不要重复介绍辩题、正方观点或反方观点，只宣布当前环节和必要规则。',
    `当前环节：${phaseName}`
  ];
  return lines.join('\n');
}

async function askAgent(agent, prompt, options = {}) {
  agent.messages.push({ role: 'user', content: prompt });
  const reply = await callOpenAIChat({
    apiKey: agent.apiKey,
    baseUrl: agent.baseUrl,
    provider: agent.provider,
    model: agent.model,
    apiFormat: agent.apiFormat,
    temperature: agent.temperature,
    messages: agent.messages,
    maxTokens: options.maxTokens || 800,
    _gameId: agent._gameId,
    _playerId: agent.id,
    _playerRole: agent.sideLabel || agent.side,
    _playerFaction: agent.side
  });
  agent.messages.push({ role: 'assistant', content: reply });
  return reply;
}

async function askAgentWithThinking(agent, prompt, options = {}) {
  agent.messages.push({ role: 'user', content: prompt });
  const { content, thinking } = await callModelChatWithThinking({
    apiKey: agent.apiKey,
    baseUrl: agent.baseUrl,
    provider: agent.provider,
    model: agent.model,
    apiFormat: agent.apiFormat,
    temperature: agent.temperature,
    messages: agent.messages,
    maxTokens: options.maxTokens || 800,
    _gameId: agent._gameId,
    _playerId: agent.id,
    _playerRole: agent.sideLabel || agent.side,
    _playerFaction: agent.side
  });
  agent.messages.push({ role: 'assistant', content });
  return { content, thinking };
}

async function askHost(config, topic, phaseName, prompt, maxTokens, options = {}) {
  const effectiveMaxTokens = maxTokens || Math.ceil(DEBATE.HOST_ANNOUNCE_CHAR_LIMIT * 2.5);
  const messages = [
    { role: 'system', content: buildHostPrompt(topic, phaseName, options) },
    { role: 'user', content: prompt }
  ];
  const payload = {
    apiKey: config.host.apiKey,
    baseUrl: config.host.baseUrl,
    provider: config.host.provider,
    model: config.host.model,
    apiFormat: config.host.apiFormat,
    temperature: config.host.temperature,
    messages,
    maxTokens: effectiveMaxTokens,
    _gameId: config._gameId || null
  };
  if (options.cacheable) {
    const cached = await cachedLlmCall(['debate-host', config.host.provider, config.host.model, messages, effectiveMaxTokens], () => callOpenAIChat(payload));
    return cached.value;
  }
  return callOpenAIChat(payload);
}

// limit 仅作为提示词弱约束，不做实际截断处理
function normalizeText(text, limit, fallback) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return String(fallback || '');
  return clean;
}

function normalizeSpeechText(text, fallback) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim();
  return clean || fallback;
}

async function collectSpeech(agent, phase, context, instruction, fallback, maxTokens) {
  const effectiveMaxTokens = maxTokens || Math.ceil((phase.limit || 200) * 2.5);
  if (!agent.apiKey) return normalizeSpeechText(fallback, fallback);
  const prompt = [
    `当前环节：${phase.name}`,
    `建议字数：${phase.limit}字以内（弱约束，超出也正常输出）`,
    `公开赛况：${context || '已通过上文增量同步；如果没有同步内容，则比赛刚开始。'}`,
    instruction
  ].join('\n\n');

  if (agent.thinkingEnabled) {
    try {
      const { content, thinking } = await askAgentWithThinking(agent, prompt, { maxTokens: effectiveMaxTokens });
      return { content: normalizeSpeechText(content, fallback), thinking };
    } catch (error) {
      console.error(`辩论赛 ${agent.nickname || agent.id} 发言+thinking失败，使用兜底：${error.message}`);
      return { content: normalizeSpeechText(fallback, fallback), thinking: '' };
    }
  }

  try {
    const reply = await askAgent(agent, prompt, { maxTokens: effectiveMaxTokens });
    return normalizeSpeechText(reply, fallback);
  } catch (error) {
    console.error(`辩论赛 ${agent.nickname || agent.id} 发言失败，使用兜底：${error.message}`);
    return normalizeSpeechText(fallback, fallback);
  }
}

function createPhase(id) {
  const source = PHASES.find((item) => item.id === id);
  return { ...source, speeches: [], votes: [], summary: '', stageSummary: '' };
}

function pushSpeech(phase, agent, text, kind = 'speech', targetId = null) {
  const item = {
    phaseId: phase.id,
    kind,
    playerId: agent.id,
    side: agent.side,
    debateRole: agent.debateRole,
    speakerLabel: getDebateRoleName(agent),
    text,
    targetId
  };
  phase.speeches.push(item);
  agent.speeches.push(item);
  return item;
}

function publicDebateLog(phases) {
  const summaries = phases
    .filter((phase) => phase.stageSummary)
    .map((phase) => `${phase.name}摘要：${phase.stageSummary}`);
  const recent = phases
    .flatMap((phase) => phase.speeches.map((speech) => `${phase.name}｜${speech.speakerLabel || '发言'}：${speech.text}`))
    .slice(-6);
  return [...summaries.slice(-5), ...recent].join('\n');
}

function collectDebateMemoryEntries(state) {
  const phases = state.phases || [];
  const currentPhase = phases.at(-1);
  const entries = [];
  phases.forEach((phase, phaseIndex) => {
    const baseOrder = (phaseIndex + 1) * 100000;
    const current = phase === currentPhase;

    if (!current) {
      if (phase.id === 'strategy') {
        (phase.speeches || []).forEach((speech, index) => {
          entries.push(createDebateMemoryEntry({
            id: `debate:${phase.id}:team-strategy:${index}:${speech.playerId}`,
            scope: 'team',
            targetSide: speech.side,
            type: 'summary',
            text: `${phase.name}本方战术，${speech.speakerLabel || '队长'}：${speech.text}`,
            order: baseOrder + index
          }));
        });
      } else if (phase.stageSummary) {
        entries.push(createDebateMemoryEntry({
          id: `debate:${phase.id}:summary`,
          type: 'summary',
          text: `${phase.name}摘要：${phase.stageSummary}`,
          order: baseOrder + 1
        }));
      }
      return;
    }

    (phase.speeches || []).forEach((speech, index) => {
      const teamOnly = phase.id === 'strategy' || speech.kind === 'strategy';
      entries.push(createDebateMemoryEntry({
        id: `debate:${phase.id}:speech:${index}:${speech.playerId}:${speech.kind || 'speech'}`,
        scope: teamOnly ? 'team' : 'public',
        targetSide: teamOnly ? speech.side : undefined,
        type: 'speech',
        text: `${phase.name}｜${speech.speakerLabel || '发言'}：${speech.text}`,
        order: baseOrder + 100 + index
      }));
    });

    if ((phase.votes || []).length) {
      entries.push(createDebateMemoryEntry({
        id: `debate:${phase.id}:votes`,
        type: 'vote',
        text: `${phase.name}投票：${phase.votes.map((vote) => `${vote.voterId}投${vote.target}`).join('、')}。`,
        order: baseOrder + 900
      }));
    }
  });
  return entries;
}

function createDebateMemoryEntry(entry) {
  return {
    scope: 'public',
    ...entry
  };
}

function syncDebateMemory(agent, state) {
  return syncMissingPublicMemory(agent, collectDebateMemoryEntries(state));
}

function publicDebateHost(host = {}) {
  return {
    id: host.id || 0,
    name: host.name || host.nickname || '主持人',
    nickname: host.nickname || host.name || '主持人',
    avatar: host.avatar || '',
    avatarUrl: host.avatarUrl || host.avatar || '',
    provider: host.provider || '',
    model: host.model || '',
    voicePackageId: host.voicePackageId || null
  };
}

function serializeGame({ gameId, mode, topic, agents, phases, host = null, winner = null, mvp = null, winReason = '' }) {
  const players = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    nickname: agent.nickname,
    avatar: agent.avatar,
    avatarUrl: agent.avatarUrl || agent.avatar,
    provider: agent.provider,
    voicePackageId: agent.voicePackageId,
    model: agent.model,
    sex: agent.sex || '未知',
    personality: agent.personality,
    side: agent.side,
    sideIndex: agent.sideIndex,
    sideLabel: agent.sideLabel,
    debateRole: agent.debateRole,
    debateRoleLabel: agent.debateRoleLabel,
    role: agent.side,
    roleLabel: `${agent.sideLabel}${agent.debateRole === 'captain' ? '队长' : agent.debateRole === 'judge' ? '评委' : '选手'}`,
    alive: true,
    excluded: false
  }));
  return {
    id: gameId,
    gameType: 'debate',
    type: 'debate',
    mode,
    topic,
    event: {
      id: 'ai-debate',
      name: 'AI 辩论赛',
      version: 'v1.0',
      background: `辩题：${topic.title}\n正方：${topic.proPosition}\n反方：${topic.conPosition}`,
      terms: { investigators: '正方', mist: '反方', keyFigure: '最佳辩手', cover: '评委' },
      truth: ''
    },
    host: publicDebateHost(host),
    players,
    phases,
    rounds: phases.map((phase, index) => ({
      number: index + 1,
      phase: phase.id,
      title: phase.name,
      speeches: phase.speeches,
      aliveIds: agents.map((agent) => agent.id),
      votes: {},
      tally: { A: 0, B: 0 },
    })),
    mvp,
    winner,
    winReason,
    shareReport: buildShareReport({ topic, players, phases, winner, mvp, winReason }),
    createdAt: new Date().toISOString()
  };
}

async function runAiDebate(config, options = {}) {
  if (config.mode !== 'real') throw new Error('全局已禁用 Mock 模式，只支持真实模式。');

  const emit = async (event) => {
    recordEvent(trace, event);
    return options.onEvent ? options.onEvent(event) : undefined;
  };
  const topic = normalizeTopic(config.topic) || choose(TOPICS);
  const agents = createDebateAgents(config, topic);
  const phases = [];
  const gameId = `debate-${Date.now()}`;
  const trace = createTraceContext(gameId, 'debate', '');
  config._gameId = gameId;
  agents.forEach((agent) => { agent._gameId = gameId; });
  const state = { gameId, mode: 'real', topic, agents, phases, host: config.host, trace };
  let winner = null;
  let mvp = null;
  let winReason = '';

  recordSnapshot(trace, 'game-start', serializeGame(state), { phase: 'init' });
  await emit({ type: 'players', players: serializeGame(state).players, game: serializeGame(state) });

  await runPhase(config, emit, state, 'strategy', async (phase) => {
    for (const captain of agents.filter((agent) => agent.debateRole === 'captain')) {
      syncDebateMemory(captain, state);
      const text = await collectSpeech(captain, phase, '', '请给本方队友做战术部署。', `${captain.sideLabel}先稳住核心论点，抓住对方定义漏洞，队友分工补证据和反问。`);
      await emitSpeech(emit, state, phase, captain, text, 'strategy');
    }
  });

  await runPhase(config, emit, state, 'opening', async (phase) => {
    for (const agent of [debaterAt(agents, 'pro', 0), debaterAt(agents, 'con', 0)].filter(Boolean)) {
      syncDebateMemory(agent, state);
      const text = await collectSpeech(agent, phase, '', '请完成本方立论陈词。', `${agent.sideLabel}认为本方立场更能兼顾现实约束与长期价值，核心标准应当先被清晰定义。`);
      await emitSpeech(emit, state, phase, agent, text, 'opening');
    }
  });

  await runPhase(config, emit, state, 'crossfire', async (phase) => {
    const pro = agents.filter((agent) => agent.side === 'pro').slice(1, 3);
    const con = agents.filter((agent) => agent.side === 'con').slice(1, 3);
    const pairs = [[pro[0], con[0]], [con[0], pro[1]], [pro[1], con[1]], [con[1], pro[0]]].filter(([a, b]) => a && b);
    for (const [questioner, responder] of pairs) {
      syncDebateMemory(questioner, state);
      const question = await collectSpeech(questioner, { ...phase, limit: PHASE_LIMITS.crossfire_question }, '', `请向${getDebateRoleName(responder)}提出一个尖锐问题。`, `请问对方如何解释本方标准下的关键风险？`);
      await emitSpeech(emit, state, phase, questioner, question, 'question', responder.id);
      syncDebateMemory(responder, state);
      const answer = await collectSpeech(responder, phase, '', `请回应${getDebateRoleName(questioner)}刚才的问题，并反击一句。`, `这个问题忽略了前提差异，我方标准更能处理边界情况。`);
      await emitSpeech(emit, state, phase, responder, answer, 'answer', questioner.id);
    }
  });

  await runPhase(config, emit, state, 'free', async (phase) => {
    let previousId = null;
    for (let i = 0; i < 8; i += 1) {
      const side = i % 2 === 0 ? 'pro' : 'con';
      const candidates = agents.filter((agent) => agent.side === side && agent.id !== previousId);
      const agent = choose(candidates);
      previousId = agent.id;
      syncDebateMemory(agent, state);
      const text = await collectSpeech(agent, phase, '', '请进行自由辩论发言，回应最近争点并推进本方论证。', `${agent.sideLabel}补充一点：对方刚才回避了评判标准，我方才是在处理真实场景。`);
      await emitSpeech(emit, state, phase, agent, text, 'free');
    }
  });

  await runPhase(config, emit, state, 'closing', async (phase) => {
    for (const agent of [debaterAt(agents, 'con', 3), debaterAt(agents, 'pro', 3)].filter(Boolean)) {
      syncDebateMemory(agent, state);
      const text = await collectSpeech(agent, phase, '', '请以四辩身份完成本方总结陈词。', `${agent.sideLabel}总结：我方完成了定义、风险和价值三层证明，对方关键反驳没有击穿核心标准。`);
      await emitSpeech(emit, state, phase, agent, text, 'closing');
    }
  });

  const result = await runAwardPhases(config, emit, state);
  winner = result.winner;
  mvp = result.mvp;
  winReason = result.winReason;
  await runPostgamePhase(config, emit, { ...state, winner, mvp, winReason });

  const game = serializeGame({ ...state, winner, mvp, winReason });
  await emit({ type: 'game', game });

  // Finalize trace
  markTraceComplete(trace);
  recordSnapshot(trace, 'game-end', game, { phase: 'game-end' });
  flushTrace(trace);

  return game;
}

async function runPhase(config, emit, state, phaseId, action) {
  const phase = createPhase(phaseId);
  state.phases.push(phase);
  const phaseSpan = startPhaseSpan(`phase:${phaseId}`, { phase: phaseId, phase_name: phase.name });
  const hostText = await safeHost(
    config,
    state.topic,
    phase.name,
    phaseId === 'strategy'
      ? `请宣布本场辩论开局，介绍辩题和正反方立场，然后进入「${phase.name}」环节。`
      : `请宣布进入「${phase.name}」环节。不要重复介绍辩题、正方观点或反方观点。`,
    phaseId === 'strategy'
      ? `本场辩题：${state.topic.title}。正方主张${state.topic.proPosition}，反方主张${state.topic.conPosition}。现在进入${phase.name}。`
      : `现在进入${phase.name}。`,
    { includeTopic: phaseId === 'strategy', cacheable: true }
  );
  phase.summary = hostText;
  await emit({ type: 'phase-start', phase, message: hostText, game: serializeGame(state) });
  await action(phase);
  phase.stageSummary = summarizeDebatePhase(phase);
  await emit({ type: 'phase-end', phase, message: `${phase.name}结束。`, game: serializeGame(state) });
  endSpan(phaseSpan);
}

async function safeHost(config, topic, phaseName, prompt, fallback, options = {}) {
  if (!config.host?.apiKey) return fallback;
  try {
    const reply = await askHost(config, topic, phaseName, prompt, undefined, options);
    return normalizeText(reply, DEBATE.HOST_ANNOUNCE_CHAR_LIMIT, fallback);
  } catch (error) {
    console.error(`主持人生成失败，使用兜底：${error.message}`);
    return fallback;
  }
}

async function emitSpeech(emit, state, phase, agent, result, kind, targetId = null) {
  const text = typeof result === 'string' ? result : result.content;
  const thinking = typeof result === 'string' ? '' : (result.thinking || '');
  if (thinking) await emit({ type: 'thinking', playerId: agent.id, thinking });
  const speech = pushSpeech(phase, agent, text, kind, targetId);
  if (thinking) speech.thinking = thinking;
  await emit({ type: 'speech', phase, speech, game: serializeGame(state) });
}

async function runAwardPhases(config, emit, state) {
  const contestants = state.agents.filter((agent) => agent.side === 'pro' || agent.side === 'con');
  const judges = state.agents.filter((agent) => agent.side === 'judge');
  const judgePhase = createPhase('judges');
  state.phases.push(judgePhase);
  judgePhase.summary = judges.length ? '现在进入评委点评。' : '本场无评委席，由主持人进行点评。';
  await emit({ type: 'phase-start', phase: judgePhase, message: judgePhase.summary, game: serializeGame(state) });
  const winnerVotes = {};
  if (judges.length) {
    for (const judge of judges) {
      const review = await collectJudgeReview(judge, state);
      winnerVotes[judge.id] = review.winner;
      const speech = pushSpeech(judgePhase, judge, review.text, 'judge-review');
      await emit({ type: 'speech', phase: judgePhase, speech, game: serializeGame(state) });
    }
  } else {
    const hostText = await safeHost(config, state.topic, judgePhase.name, `请根据赛况点评双方表现，并给出胜负倾向。赛况：\n${publicDebateLog(state.phases)}`, '正方结构更完整，反方反击更锋利；综合推进质量，正方略胜。');
    const host = { id: '主持', side: 'host', debateRole: 'host', speeches: [] };
    const speech = pushSpeech(judgePhase, host, hostText.slice(0, 160), 'judge-review');
    await emit({ type: 'speech', phase: judgePhase, speech, game: serializeGame(state) });
    winnerVotes.host = hostText.includes('反方') && !hostText.includes('正方略胜') ? 'con' : 'pro';
  }
  judgePhase.stageSummary = summarizeDebatePhase(judgePhase);
  const winner = topWinner(winnerVotes);
  const winReason = winner === 'draw' ? '评委意见接近，双方战成平局。' : `${winner === 'pro' ? '正方' : '反方'}获得更多评委倾向。`;
  await emit({ type: 'phase-end', phase: judgePhase, message: '评委点评完成。', game: serializeGame({ ...state, winner, winReason }) });

  const mvpPhase = createPhase('mvp');
  state.phases.push(mvpPhase);
  mvpPhase.summary = '现在进入全员评选最佳辩手。';
  await emit({ type: 'phase-start', phase: mvpPhase, message: mvpPhase.summary, game: serializeGame({ ...state, winner, winReason }) });

  const voters = contestants;
  const votes = await Promise.all(voters.map((voter) => collectBestDebaterVote(voter, contestants, state)));
  const mvpVotes = {};
  for (const vote of votes) {
    mvpVotes[vote.voterId] = vote.target;
    mvpPhase.votes.push(vote);
  }
  const mvpId = topVotedId(mvpVotes) || choose(contestants).id;
  const mvp = publicPlayer(contestants.find((agent) => agent.id === mvpId) || contestants[0]);
  mvpPhase.stageSummary = `MVP投票完成，最高票目标为${mvp?.nickname || mvp?.id || '最佳辩手'}。`;
  await emit({ type: 'phase-end', phase: mvpPhase, message: '最佳辩手评选完成。', game: serializeGame({ ...state, winner, mvp, winReason }) });
  return { winner, mvp, winReason };
}

async function runPostgamePhase(config, emit, state) {
  const phase = createPhase('postgame');
  state.phases.push(phase);
  phase.summary = '比赛结果已经公布，现在进入赛后发言。';
  await emit({ type: 'phase-start', phase, message: phase.summary, game: serializeGame(state) });
  for (const agent of getPostgameSpeakers(state.agents, state.mvp?.id)) {
    syncDebateMemory(agent, state);
    const text = await collectSpeech(
      agent,
      phase,
      '',
      '请发表赛后感言：可以回应本场胜负、点评关键争点、感谢队友或回应对手。不要再投票。',
      `${agent.sideLabel}赛后想说，本场最关键的是双方都把核心标准讲清楚了；无论结果如何，这场交锋很过瘾。`
    );
    await emitSpeech(emit, state, phase, agent, text, 'postgame');
  }
  phase.stageSummary = summarizeDebatePhase(phase);
  await emit({ type: 'phase-end', phase, message: '赛后发言结束。', game: serializeGame(state) });
}

function getPostgameSpeakers(agents, mvpId) {
  const contestants = agents
    .filter((agent) => agent.side === 'pro' || agent.side === 'con')
    .sort((a, b) => {
      const sideOrder = { pro: 0, con: 1 };
      const sideDiff = sideOrder[a.side] - sideOrder[b.side];
      if (sideDiff !== 0) return sideDiff;
      return Number(a.sideIndex || 0) - Number(b.sideIndex || 0);
    });
  if (!contestants.length) return [];
  const mvpIndex = contestants.findIndex((agent) => Number(agent.id) === Number(mvpId));
  const startIndex = mvpIndex >= 0 ? (mvpIndex + 1) % contestants.length : 0;
  return [...contestants.slice(startIndex), ...contestants.slice(0, startIndex)];
}

async function collectBestDebaterVote(voter, contestants, state) {
  const fallback = contestants[Math.floor(Math.random() * contestants.length)];
  try {
    syncDebateMemory(voter, state);
    const reply = await askAgent(voter, [
      '请从正反方 8 位选手中评选最佳辩手。',
      `可选对象：${contestants.map((agent) => `${agent.id}号${agent.nickname}`).join('、')}`,
      '公开赛况已通过上文增量同步。',
      '只返回 JSON：{"target":2}，不要返回理由。'
    ].join('\n\n'), { maxTokens: 80 });
    const parsed = parseJsonObject(reply);
    const target = Number(parsed?.target);
    const valid = contestants.some((agent) => agent.id === target) ? target : fallback.id;
    return { voterId: voter.id, target: valid };
  } catch {
    return { voterId: voter.id, target: fallback.id };
  }
}

async function collectJudgeReview(judge, state) {
  try {
    syncDebateMemory(judge, state);
    const reply = await askAgent(judge, [
      '请点评双方表现，并给出胜负倾向。',
      '公开赛况已通过上文增量同步。',
      `只返回 JSON：{"winner":"pro","text":"建议${PHASE_LIMITS.judges}字以内点评（弱约束，超出也正常输出）"}，winner 只能是 pro/con/draw。`
    ].join('\n\n'), { maxTokens: Math.ceil(PHASE_LIMITS.judges * 2.5) });
    const parsed = parseJsonObject(reply);
    const winner = ['pro', 'con', 'draw'].includes(parsed?.winner) ? parsed.winner : 'draw';
    return { winner, text: normalizeSpeechText(parsed?.text, '双方都有亮点，正方结构完整，反方反击积极，胜负取决于评判标准。') };
  } catch {
    return { winner: 'draw', text: '双方都有亮点，正方结构完整，反方反击积极，胜负取决于评判标准。' };
  }
}

function summarizeDebatePhase(phase) {
  const texts = (phase.speeches || [])
    .map((speech) => `${speech.speakerLabel || '发言'}：${cleanSummaryText(speech.text)}`)
    .filter(Boolean);
  if (!texts.length) return cleanSummaryText(phase.summary).slice(0, 120);
  return texts.join('；').slice(0, 260);
}

function cleanSummaryText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function debaterAt(agents, side, index) {
  return agents.filter((agent) => agent.side === side)[index] || null;
}

function publicPlayer(agent) {
  return agent ? {
    id: agent.id,
    nickname: agent.nickname,
    avatar: agent.avatar,
    voicePackageId: agent.voicePackageId,
    side: agent.side,
    sideLabel: agent.sideLabel
  } : null;
}

function buildShareReport({ topic, players = [], phases = [], winner = null, mvp = null, winReason = '' }) {
  const normalizedPlayers = players.map((player) => ({
    id: player.id,
    name: player.name,
    nickname: player.nickname || player.name || `${player.id}号`,
    avatar: player.avatar,
    voicePackageId: player.voicePackageId,
    side: player.side,
    sideIndex: player.sideIndex,
    sideLabel: player.sideLabel,
    debateRole: player.debateRole,
    debateRoleLabel: player.debateRoleLabel
  }));
  const proLineup = normalizedPlayers.filter((player) => player.side === 'pro').sort(compareDebateSeat);
  const conLineup = normalizedPlayers.filter((player) => player.side === 'con').sort(compareDebateSeat);
  const judges = normalizedPlayers.filter((player) => player.side === 'judge').sort(compareDebateSeat);
  return {
    topic: topic?.title || '',
    proPosition: topic?.proPosition || '',
    conPosition: topic?.conPosition || '',
    proLineup,
    conLineup,
    judges,
    winner,
    winnerLabel: getWinnerLabel(winner),
    winReason: winReason || '',
    mvp: normalizeReportPlayer(mvp, normalizedPlayers),
    highlights: extractHighlights(phases, normalizedPlayers),
    judgeComments: extractJudgeComments(phases, normalizedPlayers),
    generatedAt: new Date().toISOString()
  };
}

function compareDebateSeat(a, b) {
  return (Number(a.sideIndex) || 0) - (Number(b.sideIndex) || 0);
}

function normalizeReportPlayer(player, players) {
  if (!player) return null;
  const found = players.find((item) => Number(item.id) === Number(player.id));
  return found || {
    id: player.id,
    nickname: player.nickname || player.name || `${player.id}号`,
    side: player.side,
    sideLabel: player.sideLabel
  };
}

function getWinnerLabel(winner) {
  if (winner === 'pro') return '正方胜出';
  if (winner === 'con') return '反方胜出';
  if (winner === 'draw') return '双方平局';
  return '待公布';
}

function extractJudgeComments(phases, players) {
  const playerMap = new Map(players.map((player) => [Number(player.id), player]));
  const judgePhase = phases.find((phase) => phase.id === 'judges');
  return (judgePhase?.speeches || [])
    .filter((speech) => speech.kind === 'judge-review' || speech.side === 'judge' || speech.side === 'host')
    .map((speech) => {
      const player = playerMap.get(Number(speech.playerId));
      return {
        judgeId: speech.playerId,
        judgeName: player?.nickname || speech.speakerLabel || '评委',
        text: cleanReportText(speech.text).slice(0, 120)
      };
    })
    .filter((item) => item.text)
    .slice(0, 3);
}

function extractHighlights(phases, players) {
  const playerMap = new Map(players.map((player) => [Number(player.id), player]));
  const preferred = new Set(['opening', 'free', 'closing', 'postgame']);
  const candidates = phases
    .flatMap((phase) => (phase.speeches || []).map((speech) => ({ phase, speech })))
    .filter(({ phase, speech }) => preferred.has(phase.id) && (speech.side === 'pro' || speech.side === 'con'))
    .map(({ phase, speech }) => {
      const text = cleanReportText(speech.text);
      const player = playerMap.get(Number(speech.playerId));
      return {
        playerId: speech.playerId,
        speaker: player?.nickname || speech.speakerLabel || `${speech.playerId}号`,
        side: speech.side,
        phaseId: phase.id,
        text: compactHighlight(text),
        score: scoreHighlight(text, phase.id)
      };
    })
    .filter((item) => item.text.length >= 14);
  candidates.sort((a, b) => b.score - a.score);
  return uniqueByText(candidates).slice(0, 4).map(({ score, ...item }) => item);
}

function cleanReportText(value) {
  return String(value || '')
    .replace(/[“”"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactHighlight(text) {
  const clean = cleanReportText(text);
  const sentence = clean.split(/[。！？!?；;]/).map((item) => item.trim()).find((item) => item.length >= 12) || clean;
  return sentence.slice(0, 56);
}

function scoreHighlight(text, phaseId) {
  const keywords = ['关键', '标准', '核心', '证明', '反驳', '风险', '价值', '现实', '定义', '胜负'];
  const keywordScore = keywords.reduce((sum, word) => sum + (text.includes(word) ? 8 : 0), 0);
  const phaseScore = phaseId === 'free' ? 18 : phaseId === 'closing' ? 16 : phaseId === 'opening' ? 12 : 8;
  const lengthScore = Math.min(40, text.length);
  return phaseScore + keywordScore + lengthScore;
}

function uniqueByText(items) {
  const seen = new Set();
  return items.filter((item) => {
    const key = item.text.slice(0, 18);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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
  PHASES,
  PHASE_LIMITS
};
