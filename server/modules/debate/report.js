function buildShareReport({ topic, players = [], phases = [], winner = null, mvp = null, winReason = '' }) {
  const normalizedPlayers = players.map((player) => ({
    id: player.id, name: player.name, nickname: player.nickname || player.name || `${player.id}号`,
    avatar: player.avatar, voicePackageId: player.voicePackageId, side: player.side,
    sideIndex: player.sideIndex, sideLabel: player.sideLabel,
    debateRole: player.debateRole, debateRoleLabel: player.debateRoleLabel
  }));
  return {
    topic: topic?.title || '',
    proPosition: topic?.proPosition || '',
    conPosition: topic?.conPosition || '',
    proLineup: normalizedPlayers.filter((player) => player.side === 'pro').sort(compareDebateSeat),
    conLineup: normalizedPlayers.filter((player) => player.side === 'con').sort(compareDebateSeat),
    judges: normalizedPlayers.filter((player) => player.side === 'judge').sort(compareDebateSeat),
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
  return players.find((item) => Number(item.id) === Number(player.id)) || {
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
      const player = playerMap.get(Number(speech.playerId));
      const text = cleanReportText(speech.text);
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
  return String(value || '').replace(/[“”"]/g, '').replace(/\s+/g, ' ').trim();
}

function compactHighlight(text) {
  const sentence = cleanReportText(text).split(/[。！？!?；;]/)
    .map((item) => item.trim())
    .find((item) => item.length >= 12) || cleanReportText(text);
  return sentence.slice(0, 56);
}

function scoreHighlight(text, phaseId) {
  const keywords = ['关键', '标准', '核心', '证明', '反驳', '风险', '价值', '现实', '定义', '胜负'];
  return (phaseId === 'free' ? 18 : phaseId === 'closing' ? 16 : phaseId === 'opening' ? 12 : 8)
    + keywords.reduce((sum, word) => sum + (text.includes(word) ? 8 : 0), 0)
    + Math.min(40, text.length);
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

module.exports = { buildShareReport };
