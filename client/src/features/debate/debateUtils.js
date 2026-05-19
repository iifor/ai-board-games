import { CircleHelp, Star, Swords, Users, Landmark, Award, MessageSquareText } from 'lucide-react';
import { getPlayerAvatar } from '../../utils/player';
import { DEFAULT_DEBATE_STAGE_STEPS, DEFAULT_DEBATE_TOPIC } from './constants';

// ─── Text helpers ──────────────────────────────────────

export function removeParentheticalText(value) {
  return String(value || '')
    .replace(/（[^（）]*）/g, '')
    .replace(/\([^()]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanPosterText(value) {
  return String(value || '').replace(/["""]/g, '').replace(/\s+/g, ' ').trim();
}

export function compactPosterText(value, limit) {
  const clean = cleanPosterText(value);
  const sentence = clean.split(/[。！？!?；;]/).map((item) => item.trim()).find((item) => item.length >= 12) || clean;
  return sentence.slice(0, limit);
}

// ─── Phase / stage helpers ─────────────────────────────

export function getDebateSubtitleMaxChars(game) {
  return game?.subtitleMaxChars || game?.config?.subtitleMaxChars || 50;
}

export function getDebatePhaseSteps(phases = [], currentPhase = null) {
  const source = Array.isArray(phases) ? phases : [];
  const steps = [];
  const seen = new Set();
  [...source, currentPhase].filter(Boolean).forEach((phase) => {
    const id = String(phase.id || phase.phase || phase.name || `phase-${steps.length + 1}`);
    if (seen.has(id)) return;
    seen.add(id);
    steps.push({
      id,
      label: phase.name || phase.title || getDefaultPhaseLabel(id),
      Icon: getPhaseIcon(id, phase)
    });
  });
  return steps;
}

export function getActiveStageIndex(currentPhase, steps = []) {
  const phaseId = String(currentPhase?.id || steps.at(-1)?.id || '');
  const direct = steps.findIndex((step) => step.id === phaseId);
  if (direct >= 0) return direct;
  return Math.max(0, steps.length - 1);
}

export function getStageTitle(currentPhase) {
  return currentPhase?.name || currentPhase?.title || getDefaultPhaseLabel(currentPhase?.id) || '等待开赛';
}

function getDefaultPhaseLabel(phaseId) {
  const text = String(phaseId || '');
  const matched = DEFAULT_DEBATE_STAGE_STEPS.find((step) => step.ids.includes(text));
  if (matched) return matched.label;
  if (!text) return '';
  return text
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPhaseIcon(phaseId, phase = {}) {
  const id = String(phaseId || '').toLowerCase();
  const matched = DEFAULT_DEBATE_STAGE_STEPS.find((step) => step.ids.some((item) => id === item || id.includes(item)));
  if (matched) return matched.Icon;
  const text = `${id} ${phase.name || ''} ${phase.title || ''}`.toLowerCase();
  if (text.includes('judge') || text.includes('评委') || text.includes('点评')) return CircleHelp;
  if (text.includes('mvp') || text.includes('最佳')) return Star;
  if (text.includes('cross') || text.includes('attack') || text.includes('clash') || text.includes('攻辩') || text.includes('交锋')) return Swords;
  if (text.includes('free') || text.includes('自由')) return Users;
  if (text.includes('open') || text.includes('立论') || text.includes('开场')) return Landmark;
  if (text.includes('post') || text.includes('result') || text.includes('赛后') || text.includes('结果')) return Award;
  return MessageSquareText;
}

// ─── Report / share helpers ────────────────────────────

export function getShareReport(game) {
  if (game?.shareReport) {
    const playerMap = new Map((game.players || []).map((player) => [Number(player.id), player]));
    const withPlayerAvatar = (players = []) => players.map((player) => {
      const match = playerMap.get(Number(player.id));
      return {
        ...player,
        avatar: getPlayerAvatar(player) || getPlayerAvatar(match) || '',
        avatarUrl: getPlayerAvatar(player) || getPlayerAvatar(match) || ''
      };
    });
    return {
      ...game.shareReport,
      proLineup: withPlayerAvatar(game.shareReport.proLineup || []),
      conLineup: withPlayerAvatar(game.shareReport.conLineup || []),
      judges: withPlayerAvatar(game.shareReport.judges || []),
      highlights: game.shareReport.highlights || [],
      judgeComments: game.shareReport.judgeComments || []
    };
  }
  const players = game?.players || [];
  const phases = game?.phases || [];
  return {
    topic: game?.topic?.title || '',
    proPosition: game?.topic?.proPosition || '',
    conPosition: game?.topic?.conPosition || '',
    proLineup: sortReportPlayers(players.filter((player) => player.side === 'pro')),
    conLineup: sortReportPlayers(players.filter((player) => player.side === 'con')),
    judges: sortReportPlayers(players.filter((player) => player.side === 'judge')),
    winner: game?.winner || null,
    winnerLabel: game?.winner === 'pro' ? '正方胜出' : game?.winner === 'con' ? '反方胜出' : game?.winner === 'draw' ? '双方平局' : '待公布',
    winReason: game?.winReason || '',
    mvp: game?.mvp || null,
    highlights: extractClientHighlights(phases, players),
    judgeComments: extractClientJudgeComments(phases, players),
    generatedAt: game?.createdAt || new Date().toISOString()
  };
}

export function sortReportPlayers(players) {
  return [...players].sort((a, b) => (Number(a.sideIndex) || 0) - (Number(b.sideIndex) || 0));
}

export function formatReportNames(players = []) {
  return players.map((player) => player.nickname || player.name || `${player.id}号`).filter(Boolean).join(' / ');
}

export function extractClientJudgeComments(phases, players) {
  const playerMap = new Map(players.map((player) => [Number(player.id), player]));
  const judgePhase = phases.find((phase) => phase.id === 'judges');
  return (judgePhase?.speeches || [])
    .filter((speech) => speech.kind === 'judge-review' || speech.side === 'judge' || speech.side === 'host')
    .map((speech) => {
      const player = playerMap.get(Number(speech.playerId));
      return {
        judgeId: speech.playerId,
        judgeName: player?.nickname || speech.speakerLabel || '评委',
        text: cleanPosterText(speech.text).slice(0, 120)
      };
    })
    .filter((item) => item.text)
    .slice(0, 3);
}

export function extractClientHighlights(phases, players) {
  const playerMap = new Map(players.map((player) => [Number(player.id), player]));
  const phasePriority = new Set(['opening', 'free', 'closing', 'postgame']);
  return phases
    .flatMap((phase) => (phase.speeches || []).map((speech) => ({ phase, speech })))
    .filter(({ phase, speech }) => phasePriority.has(phase.id) && (speech.side === 'pro' || speech.side === 'con'))
    .map(({ speech }) => {
      const text = compactPosterText(speech.text, 56);
      const player = playerMap.get(Number(speech.playerId));
      return {
        playerId: speech.playerId,
        speaker: player?.nickname || speech.speakerLabel || `${speech.playerId}号`,
        side: speech.side,
        text
      };
    })
    .filter((item) => item.text.length >= 12)
    .slice(0, 4);
}

// ─── MVP / narration ───────────────────────────────────

export function getMvpVoteTargetMap(game) {
  const mvpPhase = (game.phases || []).find((phase) => phase.id === 'mvp');
  const votes = Array.isArray(mvpPhase?.votes) ? mvpPhase.votes : [];
  const result = new Map();
  if (!votes.length) return result;
  const playerMap = new Map((game.players || []).map((player) => [Number(player.id), player]));
  votes.forEach((vote) => {
    const voterId = Number(vote.voterId);
    const targetId = Number(vote.target);
    const target = playerMap.get(targetId);
    result.set(voterId, target?.nickname || target?.name || `${targetId}号`);
  });
  return result;
}

export function getDebateNarration(event) {
  if (event?.type === 'speech') return event.speech?.text || '';
  return event?.message || event?.narration || '';
}

// ─── Topic / replay ────────────────────────────────────

export function normalizeTopicDraft(topic) {
  return {
    title: String(topic?.title || DEFAULT_DEBATE_TOPIC.title).trim(),
    proPosition: String(topic?.proPosition || DEFAULT_DEBATE_TOPIC.proPosition).trim(),
    conPosition: String(topic?.conPosition || DEFAULT_DEBATE_TOPIC.conPosition).trim()
  };
}

export function formatReplayOption(item) {
  const time = item.savedAt ? new Date(item.savedAt).toLocaleString('zh-CN', { hour12: false }) : '';
  const title = item.title || item.id || '历史对局';
  return time ? `${time}｜${title}` : title;
}

export function createReplayOptionFromGame(game) {
  return {
    id: game?.id,
    filename: game?.id,
    savedAt: game?.createdAt,
    title: game?.topic?.title || game?.event?.name || game?.id,
    topic: game?.topic,
    players: game?.players || []
  };
}

export function getReplaySetup(options = [], replayId = '') {
  if (!replayId) return null;
  const replay = options.find((item) => (item.filename || item.id) === replayId || item.id === replayId);
  const players = Array.isArray(replay?.players) ? replay.players : [];
  const playerIds = uniquePlayerIds(players.map((player) => player.id)).slice(0, 12);
  if (!replay?.topic || playerIds.length < 8) return null;
  return {
    topic: normalizeTopicDraft(replay.topic),
    players,
    playerIds,
    teams: createDebateTeamsFromPlayers(players)
  };
}

// ─── Team management ───────────────────────────────────

export function createDebateTeamsFromPlayers(players = []) {
  const sorted = [...players].sort((a, b) => {
    const sideOrder = { pro: 0, con: 1, judge: 2 };
    const sideDiff = (sideOrder[a.side] ?? 9) - (sideOrder[b.side] ?? 9);
    if (sideDiff !== 0) return sideDiff;
    return (Number(a.sideIndex) || 0) - (Number(b.sideIndex) || 0);
  });
  const proIds = uniquePlayerIds(sorted.filter((player) => player.side === 'pro').map((player) => player.id)).slice(0, 4);
  const conIds = uniquePlayerIds(sorted.filter((player) => player.side === 'con').map((player) => player.id)).slice(0, 4);
  const judgeIds = uniquePlayerIds(sorted.filter((player) => player.side === 'judge').map((player) => player.id));
  const proCaptain = sorted.find((player) => player.side === 'pro' && player.debateRole === 'captain');
  const conCaptain = sorted.find((player) => player.side === 'con' && player.debateRole === 'captain');
  return {
    proIds,
    conIds,
    judgeIds,
    proCaptainId: proIds.includes(Number(proCaptain?.id)) ? Number(proCaptain.id) : null,
    conCaptainId: conIds.includes(Number(conCaptain?.id)) ? Number(conCaptain.id) : null
  };
}

export function hasDebateCaptains(players = []) {
  return players.some((player) => player.debateRole === 'captain');
}

export function createDefaultDebateTeams(playerIds = []) {
  return {
    proIds: [],
    conIds: [],
    judgeIds: [],
    proCaptainId: null,
    conCaptainId: null
  };
}

export function normalizeDebateTeamDraft(value, playerIds = []) {
  const selectedIds = uniquePlayerIds(playerIds).slice(0, 12);
  if (!value) return createDefaultDebateTeams(selectedIds);
  const selectedSet = new Set(selectedIds);
  const proIds = normalizeDebateSlots(value?.proIds, 4, selectedSet);
  const proSet = new Set(proIds.filter(Boolean));
  const conIds = normalizeDebateSlots(value?.conIds, 4, selectedSet, proSet);
  const assigned = new Set([...proIds, ...conIds].filter(Boolean));
  const judgeCapacity = Math.max(0, selectedIds.length - 8);
  const judgeIds = normalizeDebateSlots(value?.judgeIds, judgeCapacity, selectedSet, assigned);
  const hasExplicitProCaptain = Object.prototype.hasOwnProperty.call(value || {}, 'proCaptainId');
  const hasExplicitConCaptain = Object.prototype.hasOwnProperty.call(value || {}, 'conCaptainId');
  const proCaptainId = hasExplicitProCaptain && value?.proCaptainId == null
    ? null
    : proIds.includes(Number(value?.proCaptainId))
      ? Number(value.proCaptainId)
      : hasExplicitProCaptain ? null : proIds[0] || null;
  const conCaptainId = hasExplicitConCaptain && value?.conCaptainId == null
    ? null
    : conIds.includes(Number(value?.conCaptainId))
      ? Number(value.conCaptainId)
      : hasExplicitConCaptain ? null : conIds[0] || null;
  return {
    proIds,
    conIds,
    judgeIds,
    proCaptainId,
    conCaptainId
  };
}

function normalizeDebateSlots(ids = [], size = 0, selectedSet = new Set(), usedSet = new Set()) {
  const used = new Set(usedSet);
  return Array.from({ length: size }).map((_, index) => {
    const id = Number(ids[index]);
    if (!id || !selectedSet.has(id) || used.has(id)) return null;
    used.add(id);
    return id;
  });
}

export function getOrderedDebatePlayerIds(teams, playerIds = []) {
  const selectedIds = uniquePlayerIds(playerIds).slice(0, 12);
  const selectedSet = new Set(selectedIds);
  const assigned = uniquePlayerIds([...(teams?.proIds || []), ...(teams?.conIds || []), ...(teams?.judgeIds || [])])
    .filter((id) => selectedSet.has(id));
  const missing = selectedIds.filter((id) => !assigned.includes(id));
  return [...assigned, ...missing];
}

export function uniquePlayerIds(value = []) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(Boolean))];
}

export function getDebateTeamKey(side) {
  if (side === 'con') return 'conIds';
  if (side === 'judge') return 'judgeIds';
  return 'proIds';
}

export function findDebateTeamSlot(teams, playerId) {
  const id = Number(playerId);
  const groups = [
    ['pro', teams.proIds],
    ['con', teams.conIds],
    ['judge', teams.judgeIds]
  ];
  for (const [side, ids] of groups) {
    const index = ids.findIndex((item) => Number(item) === id);
    if (index >= 0) return { side, index };
  }
  return null;
}

export function removeDebatePlayerIds(ids, playerId, targetPlayerId) {
  return ids.map((id) => {
    const value = Number(id);
    if (value === Number(playerId) || value === Number(targetPlayerId)) return undefined;
    return value;
  });
}

// ─── Player labels ─────────────────────────────────────

export function getDebatePlayerLabel(players, playerId) {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  if (!player) return `${playerId}号`;
  if (player.side === 'judge') return '评委';
  const sidePlayers = players.filter((item) => item.side === player.side);
  const index = sidePlayers.findIndex((item) => Number(item.id) === Number(playerId));
  const sideLabel = player.side === 'pro' ? '正方' : '反方';
  return `${sideLabel}${toChineseOrdinal(index + 1)}辩`;
}

export function getDebateSpeakerLabel(players, playerId) {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  const roleLabel = getDebatePlayerLabel(players, playerId);
  if (!player) return roleLabel;
  return `${roleLabel}·${player.nickname || player.name || `${player.id}号`}`;
}

export function getDebateIdentityDescription(player) {
  if (player.side === 'judge') return '本局评委，负责从论点清晰度、反驳质量、团队协作和表达感染力判断胜负，并参与最佳选手评选。';
  const side = player.side === 'pro' ? '正方' : '反方';
  const role = player.debateRole === 'captain' ? '队长' : '辩手';
  const position = player.position || player.sideLabel || side;
  return `本局立场：${position}。身份：${side}${role}，需要围绕本方观点推进论证、反驳对方并配合队友。`;
}

export function toChineseOrdinal(value) {
  return ['零', '一', '二', '三', '四'][value] || String(value);
}

// ─── Import system ─────────────────────────────────────

export function normalizeImportedDebateGame(raw, filename = 'imported-debate.json', libraryPlayers = []) {
  if (raw?.type === 'debate' && Array.isArray(raw.players) && (Array.isArray(raw.phases) || Array.isArray(raw.rounds))) {
    const players = raw.players.map((player) => ({
      ...player,
      avatar: getImportedAvatar(player) || player.avatar || ''
    }));
    return {
      ...raw,
      id: raw.id || `imported-debate-${Date.now()}`,
      mode: 'real',
      topic: normalizeTopicDraft(raw.topic),
      players,
      phases: Array.isArray(raw.phases) ? raw.phases : getPhasesFromImportedRounds(raw.rounds),
      createdAt: raw.createdAt || new Date().toISOString()
    };
  }
  if (raw?.type !== 'ai_debate_match' || !Array.isArray(raw.segments)) {
    throw new Error('暂不支持此文件格式，请导入 ai_debate_match 或项目导出的 debate JSON。');
  }

  const topic = {
    title: raw.metadata?.topic || raw.metadata?.title || '导入 AI 辩论赛',
    proPosition: raw.positions?.affirmative || raw.teams?.affirmative?.position || '正方立场',
    conPosition: raw.positions?.negative || raw.teams?.negative?.position || '反方立场'
  };
  const { players, externalToInternalId, nameToInternalId } = createImportedPlayers(raw, libraryPlayers);
  const result = extractImportedResult(raw, externalToInternalId, nameToInternalId);
  const phases = createImportedPhases(raw, externalToInternalId, players, result);
  const game = {
    id: `imported-debate-${Date.now()}`,
    type: 'debate',
    mode: 'real',
    importSource: filename,
    topic,
    players,
    phases,
    rounds: phases.map((phase, index) => ({ number: index + 1, phase: phase.id, title: phase.name, speeches: phase.speeches || [] })),
    winner: result.winner,
    winReason: result.winReason,
    mvp: result.mvpId ? publicImportedPlayer(players.find((player) => Number(player.id) === Number(result.mvpId))) : null,
    createdAt: new Date().toISOString()
  };
  game.shareReport = createImportedShareReport(game);
  return game;
}

function createImportedPlayers(raw, libraryPlayers = []) {
  const entries = [
    ...normalizeImportedTeamMembers(raw.teams?.affirmative?.members, 'pro'),
    ...normalizeImportedTeamMembers(raw.teams?.negative?.members, 'con'),
    ...normalizeImportedTeamMembers(raw.teams?.judges?.members, 'judge')
  ];
  const matcher = createPlayerLibraryMatcher(libraryPlayers);
  const seen = new Set();
  const players = [];
  const externalToInternalId = new Map();
  const nameToInternalId = new Map();
  const addPlayer = (entry) => {
    if (!entry.externalId || seen.has(entry.externalId)) return;
    seen.add(entry.externalId);
    const libraryPlayer = matcher.find(entry);
    const id = libraryPlayer?.id || getNextImportedPlayerId(players, libraryPlayers);
    const player = mergeImportedPlayer(libraryPlayer, entry, id);
    players.push(player);
    externalToInternalId.set(entry.externalId, id);
    nameToInternalId.set(normalizeImportedName(entry.externalId), id);
    nameToInternalId.set(normalizeImportedName(entry.name), id);
    nameToInternalId.set(normalizeImportedName(player.nickname), id);
    nameToInternalId.set(normalizeImportedName(player.name), id);
  };

  entries.forEach(addPlayer);

  Object.entries(raw.speakerMap || {}).forEach(([externalId, speaker]) => {
    if (externalToInternalId.has(externalId) || speaker?.side === 'neutral') return;
    const side = normalizeImportedSide(speaker?.side);
    if (side === 'host') return;
    addPlayer({
      externalId,
      name: speaker?.nickname || speaker?.name || externalId,
      nickname: speaker?.nickname || speaker?.name || externalId,
      avatar: getImportedAvatar(speaker),
      side,
      sideIndex: side === 'judge' ? null : players.filter((item) => item.side === side).length,
      role: speaker?.role || '',
      persona: ''
    });
  });

  raw.segments.flatMap(flattenImportedSegmentItems).forEach((item) => {
    const externalId = String(item.speakerId || item.judgeId || '');
    if (!externalId || externalId === 'host' || externalToInternalId.has(externalId) || players.length >= 12) return;
    const side = item.judgeId || item.scores ? 'judge' : normalizeImportedSide(item.side);
    if (side === 'host') return;
    addPlayer({
      externalId,
      name: item.nickname || item.name || externalId,
      nickname: item.nickname || item.name || externalId,
      avatar: getImportedAvatar(item),
      side,
      sideIndex: side === 'judge' ? null : players.filter((candidate) => candidate.side === side).length,
      role: '',
      persona: ''
    });
  });

  if (players.filter((player) => player.side === 'pro').length !== 4 || players.filter((player) => player.side === 'con').length !== 4) {
    throw new Error('导入对局需要恰好 4 名正方和 4 名反方辩手。');
  }
  return { players, externalToInternalId, nameToInternalId };
}

function normalizeImportedTeamMembers(members = [], side) {
  if (!Array.isArray(members)) return [];
  return members.map((member, index) => ({
    externalId: String(member.id || `${side}-${index + 1}`),
    name: member.nickname || member.name || member.id || `${side}-${index + 1}`,
    nickname: member.nickname || member.name || member.id || `${side}-${index + 1}`,
    avatar: getImportedAvatar(member),
    role: member.role || '',
    persona: member.persona || '',
    side,
    sideIndex: side === 'judge' ? null : index,
    isCaptain: Boolean(member.isCaptain || member.captain || /captain|队长/i.test(String(member.role || '')))
  }));
}

function createPlayerLibraryMatcher(libraryPlayers = []) {
  const byId = new Map();
  const byName = new Map();
  libraryPlayers.forEach((player) => {
    byId.set(String(player.id), player);
    getPlayerMatchKeys(player).forEach((key) => {
      if (key && !byName.has(key)) byName.set(key, player);
    });
  });
  return {
    find(entry) {
      const idMatch = byId.get(String(entry.externalId || ''));
      if (idMatch) return idMatch;
      for (const key of getPlayerMatchKeys(entry)) {
        const match = byName.get(key);
        if (match) return match;
      }
      return null;
    }
  };
}

function getPlayerMatchKeys(value = {}) {
  return [
    value.nickname,
    value.name,
    value.externalId,
    value.id,
    getKnownPlayerAlias(value.nickname || value.name || value.externalId || value.id)
  ].map(normalizePlayerMatchKey).filter(Boolean);
}

function getKnownPlayerAlias(value) {
  const key = String(value || '').trim().toLowerCase();
  const aliases = {
    doubao: '豆包',
    yuanbao: '元宝',
    wenxin: '文心一言',
    spark: '讯飞星火',
    chatglm: '智谱清言',
    zhipu: '智谱清言',
    qianwen: '千问',
    deepseek: 'DeepSeek',
    chatgpt: 'ChatGPT',
    kimi: 'Kimi',
    grok: 'Grok',
    gemini: 'Gemini',
    claude: 'Claude'
  };
  return aliases[key] || '';
}

function normalizePlayerMatchKey(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·._-]+/g, '');
}

function mergeImportedPlayer(libraryPlayer, entry, id) {
  const sideLabel = entry.side === 'pro' ? '正方' : entry.side === 'con' ? '反方' : '评委席';
  const debateRole = entry.side === 'judge' ? 'judge' : entry.isCaptain ? 'captain' : 'debater';

  return {
    ...(libraryPlayer || {}),
    id,
    externalId: entry.externalId,
    name: libraryPlayer?.name || libraryPlayer?.nickname || entry.name,
    nickname: libraryPlayer?.nickname || libraryPlayer?.name || entry.nickname || entry.name,
    avatar: libraryPlayer?.avatar || entry.avatar || '',
    provider: libraryPlayer?.provider || 'imported',
    model: libraryPlayer?.model || 'imported-match',
    sex: libraryPlayer?.sex || '未知',
    personality: libraryPlayer?.personality || entry.persona || '',
    side: entry.side,
    sideIndex: entry.side === 'judge' ? null : entry.sideIndex,
    sideLabel,
    debateRole,
    debateRoleLabel: debateRole === 'judge' ? '评委' : debateRole === 'captain' ? '队长' : '选手',
    role: entry.side,
    roleLabel: entry.role || '',
    alive: true,
    excluded: false
  };
}

function getNextImportedPlayerId(players, libraryPlayers) {
  const used = new Set([
    ...players.map((player) => Number(player.id)),
    ...libraryPlayers.map((player) => Number(player.id)).filter(Number.isFinite)
  ]);
  let next = 1001;
  while (used.has(next)) next += 1;
  return next;
}

function createImportedPhases(raw, externalToInternalId, players, result) {
  const phases = [];
  raw.segments.forEach((segment) => {
    const phaseId = mapImportedPhaseId(segment.type || segment.id);
    if (!phaseId) return;
    const speeches = flattenImportedSegmentItems(segment)
      .map((item, index) => createImportedSpeech(item, phaseId, externalToInternalId, players, index))
      .filter(Boolean);
    if (!speeches.length && phaseId !== 'mvp') return;
    phases.push({
      id: phaseId,
      name: mapImportedPhaseName(phaseId, segment.title),
      summary: segment.title || mapImportedPhaseName(phaseId),
      speeches,
      votes: []
    });
  });

  const judgePhase = phases.find((phase) => phase.id === 'judges');
  const mvpVotes = extractImportedMvpVotes(raw, externalToInternalId, result.mvpId);
  if (mvpVotes.length) {
    const mvpPhase = {
      id: 'mvp',
      name: '最佳辩手评选',
      summary: '导入对局最佳辩手评选结果。',
      speeches: [],
      votes: mvpVotes
    };
    const insertAt = judgePhase ? phases.indexOf(judgePhase) + 1 : phases.length;
    phases.splice(insertAt, 0, mvpPhase);
  }
  return phases;
}

function flattenImportedSegmentItems(segment) {
  const direct = Array.isArray(segment.items) ? segment.items : [];
  const nested = Array.isArray(segment.rounds)
    ? segment.rounds.flatMap((round) => Array.isArray(round.items) ? round.items : [])
    : [];
  return [...direct, ...nested];
}

function createImportedSpeech(item, phaseId, externalToInternalId, players, index) {
  const speakerId = String(item.speakerId || item.judgeId || 'host');
  const playerId = externalToInternalId.get(speakerId) || speakerId;
  const player = players.find((candidate) => Number(candidate.id) === Number(playerId));
  const side = player?.side || normalizeImportedSide(item.side) || 'host';
  const text = String(item.text || '').trim();
  if (!text) return null;
  return {
    id: item.id || `${phaseId}-${index + 1}`,
    phaseId,
    kind: phaseId === 'judges' ? 'judge-review' : side === 'host' ? 'host' : phaseId,
    playerId,
    side,
    debateRole: player?.debateRole || (side === 'host' ? 'host' : 'debater'),
    speakerLabel: player ? getDebatePlayerLabel(players, player.id) : '主持人',
    text,
    targetId: null
  };
}

function extractImportedResult(raw, externalToInternalId, nameToInternalId) {
  const resultItem = raw.segments.flatMap(flattenImportedSegmentItems).find((item) => item.result)?.result || {};
  const winner = resultItem.winner === 'affirmative' ? 'pro' : resultItem.winner === 'negative' ? 'con' : resultItem.winner === 'draw' ? 'draw' : null;
  const mvpId = externalToInternalId.get(String(resultItem.bestDebater || '')) || nameToInternalId.get(normalizeImportedName(resultItem.bestDebater));
  const winReason = resultItem.winnerName || (winner === 'pro' ? '正方获得更高综合评分。' : winner === 'con' ? '反方获得更高综合评分。' : '');
  return { winner, mvpId, winReason };
}

function extractImportedMvpVotes(raw, externalToInternalId, fallbackMvpId) {
  const judgeItems = raw.segments
    .filter((segment) => mapImportedPhaseId(segment.type || segment.id) === 'judges')
    .flatMap(flattenImportedSegmentItems);
  const votes = judgeItems.map((item) => {
    const voterId = externalToInternalId.get(String(item.speakerId || item.judgeId || ''));
    const target = externalToInternalId.get(String(item.bestDebater || '')) || fallbackMvpId;
    if (!voterId || !target) return null;
    return { voterId, target, reason: String(item.text || '').slice(0, 80) };
  }).filter(Boolean);
  return votes.length ? votes : fallbackMvpId ? [{ voterId: 'host', target: fallbackMvpId, reason: '导入对局结果指定。' }] : [];
}

function extractImportedShareComments(phases) {
  const judgePhase = phases.find((phase) => phase.id === 'judges');
  return (judgePhase?.speeches || []).map((speech) => ({
    judgeId: speech.playerId,
    judgeName: speech.speakerLabel || '评委',
    text: String(speech.text || '').slice(0, 120)
  })).slice(0, 3);
}

function createImportedShareReport(game) {
  return {
    topic: game.topic.title,
    proPosition: game.topic.proPosition,
    conPosition: game.topic.conPosition,
    proLineup: game.players.filter((player) => player.side === 'pro'),
    conLineup: game.players.filter((player) => player.side === 'con'),
    judges: game.players.filter((player) => player.side === 'judge'),
    winner: game.winner,
    winnerLabel: game.winner === 'pro' ? '正方胜出' : game.winner === 'con' ? '反方胜出' : game.winner === 'draw' ? '双方平局' : '待公布',
    winReason: game.winReason,
    mvp: game.mvp,
    highlights: extractClientHighlights(game.phases, game.players),
    judgeComments: extractImportedShareComments(game.phases),
    generatedAt: game.createdAt
  };
}

function publicImportedPlayer(player) {
  return player ? { id: player.id, nickname: player.nickname, name: player.name, avatar: getPlayerAvatar(player), avatarUrl: getPlayerAvatar(player), side: player.side, sideLabel: player.sideLabel } : null;
}

function getImportedAvatar(value = {}) {
  const avatar = String(
    value.avatar ||
    value.avatarUrl ||
    value.avatarURL ||
    value.avatar_url ||
    value.image ||
    value.imageUrl ||
    value.icon ||
    ''
  ).trim();
  if (!avatar) return '';
  if (/^(https?:|data:|blob:|\/)/i.test(avatar)) return avatar;
  if (avatar.includes('/')) return avatar;
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(avatar)) return `/avatars/${avatar}`;
  return avatar;
}

function getPhasesFromImportedRounds(rounds = []) {
  if (!Array.isArray(rounds)) return [];
  return rounds.map((round, index) => ({
    id: round.phase || round.id || `round-${index + 1}`,
    name: round.title || round.name || `第 ${index + 1} 环节`,
    summary: round.summary || '',
    speeches: Array.isArray(round.speeches) ? round.speeches : [],
    votes: Array.isArray(round.votes) ? round.votes : []
  }));
}

function mapImportedPhaseId(value) {
  const type = String(value || '').toLowerCase();
  if (type.includes('opening_statement')) return 'opening';
  if (type === 'opening') return 'strategy';
  if (type.includes('crossfire')) return 'crossfire';
  if (type.includes('free')) return 'free';
  if (type.includes('closing')) return 'closing';
  if (type.includes('judge')) return 'judges';
  if (type.includes('result')) return 'postgame';
  return sanitizeImportedPhaseId(type);
}

function mapImportedPhaseName(phaseId, fallback = '') {
  const names = {
    strategy: '开场介绍',
    opening: '立论陈词',
    crossfire: '正反攻辩',
    free: '自由辩论',
    closing: '总结陈词',
    judges: '评委点评',
    mvp: '最佳辩手评选',
    postgame: '赛果公布'
  };
  return fallback || names[phaseId] || phaseId;
}

function normalizeImportedSide(value) {
  const side = String(value || '').toLowerCase();
  if (side === 'affirmative' || side === 'pro') return 'pro';
  if (side === 'negative' || side === 'con') return 'con';
  if (side === 'judge') return 'judge';
  return 'host';
}

function normalizeImportedName(value) {
  return String(value || '').trim().toLowerCase();
}

function sanitizeImportedPhaseId(value) {
  const text = String(value || '').trim().toLowerCase();
  const safe = text
    .replace(/[^a-z0-9一-龥_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || `custom-phase-${Date.now()}`;
}
