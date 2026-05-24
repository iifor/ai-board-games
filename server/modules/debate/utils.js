const { hashText } = require('../../services/ai/promptComposer');
const { syncMissingPublicMemory } = require('../game-memory');
const { TOPICS } = require('./constants');
const { buildShareReport } = require('./report');

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

function uniqueValidIds(value, playerMap) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => playerMap.has(id)))];
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
  return {
    pro,
    con,
    judges: [...configuredJudges, ...remaining],
    proCaptainId: captainEnabled && pro.includes(Number(value.proCaptainId)) ? Number(value.proCaptainId) : captainEnabled ? pro[0] : null,
    conCaptainId: captainEnabled && con.includes(Number(value.conCaptainId)) ? Number(value.conCaptainId) : captainEnabled ? con[0] : null
  };
}

function getConfiguredDebateSetup(config) {
  const playerMap = new Map(config.players.map((player) => [Number(player.id), player]));
  const teamConfig = normalizeDebateTeams(config.debateTeams, playerMap);
  if (!teamConfig) {
    const players = shuffle(config.players).slice(0, Math.min(12, Math.max(8, config.players.length)));
    return { players, proCaptainId: players[0]?.id, conCaptainId: players[4]?.id };
  }
  return {
    players: [...teamConfig.pro, ...teamConfig.con, ...teamConfig.judges].map((id) => playerMap.get(Number(id))).filter(Boolean),
    proCaptainId: teamConfig.proCaptainId,
    conCaptainId: teamConfig.conCaptainId
  };
}

function createDebateMemoryEntry(entry) {
  return { scope: 'public', ...entry };
}

function collectDebateMemoryEntries(state) {
  const entries = [];
  (state.phases || []).forEach((phase, phaseIndex) => {
    const baseOrder = (phaseIndex + 1) * 100000;
    const current = phase === state.phases.at(-1);
    if (!current) {
      if (phase.id === 'strategy') {
        (phase.speeches || []).forEach((speech, index) => entries.push(createDebateMemoryEntry({
          id: `debate:${phase.id}:team-strategy:${index}:${speech.playerId}`,
          scope: 'team',
          targetSide: speech.side,
          type: 'summary',
          text: `${phase.name}本方战术，${speech.speakerLabel || '队长'}：${speech.text}`,
          order: baseOrder + index
        })));
      } else if (phase.stageSummary) {
        entries.push(createDebateMemoryEntry({ id: `debate:${phase.id}:summary`, type: 'summary', text: `${phase.name}摘要：${phase.stageSummary}`, order: baseOrder + 1 }));
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
      entries.push(createDebateMemoryEntry({ id: `debate:${phase.id}:votes`, type: 'vote', text: `${phase.name}投票：${phase.votes.map((vote) => `${vote.voterId}投${vote.target}`).join('、')}。`, order: baseOrder + 900 }));
    }
  });
  return entries;
}

function syncDebateMemory(agent, state) {
  return syncMissingPublicMemory(agent, collectDebateMemoryEntries(state));
}

function publicDebateLog(phases) {
  const summaries = phases.filter((phase) => phase.stageSummary).map((phase) => `${phase.name}摘要：${phase.stageSummary}`);
  const recent = phases.flatMap((phase) => phase.speeches.map((speech) => `${phase.name}｜${speech.speakerLabel || '发言'}：${speech.text}`)).slice(-6);
  return [...summaries.slice(-5), ...recent].join('\n');
}

function debaterAt(agents, side, index) {
  return agents.filter((agent) => agent.side === side)[index] || null;
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function publicPlayer(agent) {
  return agent ? { id: agent.id, nickname: agent.nickname, avatar: agent.avatar, voicePackageId: agent.voicePackageId, side: agent.side, sideLabel: agent.sideLabel } : null;
}

function publicDebateHost(host = {}) {
  return {
    id: host.id || 0, name: host.name || host.nickname || '主持人',
    nickname: host.nickname || host.name || '主持人', avatar: host.avatar || '',
    avatarUrl: host.avatarUrl || host.avatar || '', provider: host.provider || '',
    model: host.model || '', voicePackageId: host.voicePackageId || null
  };
}

function buildAgentHash(systemPrompt) {
  return hashText(systemPrompt);
}

function serializeGame({ gameId, mode, topic, agents, phases, host = null, winner = null, mvp = null, winReason = '', fallbackAudit = [] }) {
  const players = agents.map((agent) => ({
    id: agent.id, name: agent.name, nickname: agent.nickname,
    avatar: agent.avatar, avatarUrl: agent.avatarUrl || agent.avatar,
    provider: agent.provider, voicePackageId: agent.voicePackageId,
    model: agent.model, sex: agent.sex || '未知', personality: agent.personality,
    side: agent.side, sideIndex: agent.sideIndex, sideLabel: agent.sideLabel,
    debateRole: agent.debateRole, debateRoleLabel: agent.debateRoleLabel,
    role: agent.side,
    roleLabel: `${agent.sideLabel}${agent.debateRole === 'captain' ? '队长' : agent.debateRole === 'judge' ? '评委' : '选手'}`,
    alive: true, excluded: false
  }));
  return {
    id: gameId, gameType: 'debate', type: 'debate', mode, topic,
    event: {
      id: 'ai-debate', name: 'AI 辩论赛', version: 'v1.0',
      background: `辩题：${topic.title}\n正方：${topic.proPosition}\n反方：${topic.conPosition}`,
      terms: { investigators: '正方', mist: '反方', keyFigure: '最佳辩手', cover: '评委' },
      truth: ''
    },
    host: publicDebateHost(host),
    players,
    phases,
    rounds: phases.map((phase, index) => ({
      number: index + 1, phase: phase.id, title: phase.name,
      speeches: phase.speeches, aliveIds: agents.map((agent) => agent.id),
      votes: {}, tally: { A: 0, B: 0 }
    })),
    mvp, winner, winReason, fallbackAudit,
    shareReport: buildShareReport({ topic, players, phases, winner, mvp, winReason }),
    createdAt: new Date().toISOString()
  };
}

module.exports = {
  TOPICS, shuffle, choose, normalizeTopic, getConfiguredDebateSetup,
  syncDebateMemory, publicDebateLog, debaterAt, cleanText, publicPlayer,
  publicDebateHost, buildAgentHash, serializeGame
};
