import { CircleHelp, Star, Swords, Users, Landmark, Award, MessageSquareText } from 'lucide-react';
import type { ComponentType } from 'react';
import { getPlayerAvatar } from '../../utils/player';
import { DEFAULT_DEBATE_STAGE_STEPS, DEFAULT_DEBATE_TOPIC } from './constants';
import type {
  Player,
  GameState,
  DebateTopic,
  DebatePhase,
  DebateSpeech,
  DebateVote,
  DebateTeamDraft,
  DebateShareReport,
  DebateStageStep,
  GameEvent
} from '../../types';

// ─── Text helpers ──────────────────────────────────────

export function removeParentheticalText(value: unknown): string {
  return String(value || '')
    .replace(/（[^（）]*）/g, '')
    .replace(/\([^()]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function cleanPosterText(value: unknown): string {
  return String(value || '').replace(/["""]/g, '').replace(/\s+/g, ' ').trim();
}

export function compactPosterText(value: unknown, limit: number): string {
  const clean = cleanPosterText(value);
  const sentence = clean.split(/[。！？!?；;]/).map((item) => item.trim()).find((item) => item.length >= 12) || clean;
  return sentence.slice(0, limit);
}

// ─── Phase / stage helpers ─────────────────────────────

export function getDebateSubtitleMaxChars(game: GameState): number {
  return game?.subtitleMaxChars || game?.config?.subtitleMaxChars || 50;
}

export function getDebatePhaseSteps(phases: DebatePhase[] = [], currentPhase: DebatePhase | null = null): DebateStageStep[] {
  const source = Array.isArray(phases) ? phases : [];
  const steps: DebateStageStep[] = [];
  const seen = new Set<string>();
  [...source, currentPhase].filter(Boolean).forEach((phase) => {
    const phase_ = phase!;
    const id = String(phase_.id || phase_.name || `phase-${steps.length + 1}`);
    if (seen.has(id)) return;
    seen.add(id);
    steps.push({
      ids: [id],
      label: phase_.name || phase_.title || getDefaultPhaseLabel(id),
      Icon: getPhaseIcon(id, phase_)
    });
  });
  return steps;
}

export function getActiveStageIndex(currentPhase: DebatePhase | null, steps: DebateStageStep[] = []): number {
  const lastStep = steps.length ? steps[steps.length - 1] : null;
  const phaseId = String(currentPhase?.id || lastStep?.ids[0] || '');
  const direct = steps.findIndex((step) => step.ids.includes(phaseId));
  if (direct >= 0) return direct;
  return Math.max(0, steps.length - 1);
}

export function getStageTitle(currentPhase: DebatePhase | null): string {
  return currentPhase?.name || currentPhase?.title || getDefaultPhaseLabel(currentPhase?.id) || '等待开赛';
}

function getDefaultPhaseLabel(phaseId: string | undefined): string {
  const text = String(phaseId || '');
  const matched = DEFAULT_DEBATE_STAGE_STEPS.find((step) => step.ids.includes(text));
  if (matched) return matched.label;
  if (!text) return '';
  return text
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function getPhaseIcon(phaseId: string, phase?: DebatePhase | null): ComponentType<{ size?: number }> {
  const id = String(phaseId || '').toLowerCase();
  const matched = DEFAULT_DEBATE_STAGE_STEPS.find((step) => step.ids.some((item) => id === item || id.includes(item)));
  if (matched) return matched.Icon;
  const text = `${id} ${phase?.name || ''} ${phase?.title || ''}`.toLowerCase();
  if (text.includes('judge') || text.includes('评委') || text.includes('点评')) return CircleHelp;
  if (text.includes('mvp') || text.includes('最佳')) return Star;
  if (text.includes('cross') || text.includes('attack') || text.includes('clash') || text.includes('攻辩') || text.includes('交锋')) return Swords;
  if (text.includes('free') || text.includes('自由')) return Users;
  if (text.includes('open') || text.includes('立论') || text.includes('开场')) return Landmark;
  if (text.includes('post') || text.includes('result') || text.includes('赛后') || text.includes('结果')) return Award;
  return MessageSquareText;
}

// ─── Report / share helpers ────────────────────────────

export function getShareReport(game: GameState): DebateShareReport {
  if (game?.shareReport) {
    const playerMap = new Map((game.players || []).map((player) => [Number(player.id), player]));
    const withPlayerAvatar = (players: Player[] = []): Player[] => players.map((player) => {
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

export function sortReportPlayers(players: Player[]): Player[] {
  return [...players].sort((a, b) => (Number(a.sideIndex) || 0) - (Number(b.sideIndex) || 0));
}

export function formatReportNames(players: Player[] = []): string {
  return players.map((player) => player.nickname || player.name || `${player.id}号`).filter(Boolean).join(' / ');
}

export function extractClientJudgeComments(phases: DebatePhase[], players: Player[]): { judgeId: string; judgeName: string; text: string }[] {
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

export function extractClientHighlights(phases: DebatePhase[], players: Player[]): { playerId: string; speaker: string; side: string; text: string }[] {
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

export function getMvpVoteTargetMap(game: GameState): Map<number, string> {
  const mvpPhase = (game.phases || []).find((phase) => phase.id === 'mvp');
  const votes: DebateVote[] = Array.isArray(mvpPhase?.votes) ? mvpPhase!.votes! : [];
  const result = new Map<number, string>();
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

export function getDebateNarration(event: GameEvent): string {
  if (event?.type === 'workflow-event') return event.message || (event.phase as Record<string, unknown>)?.stageSummary as string || '';
  if (event?.type === 'workflow-completed') return event.message || '';
  if (event?.type === 'speech') return (event.speech as Record<string, unknown>)?.text as string || '';
  return event?.message || event?.narration || '';
}

// ─── Topic / replay ────────────────────────────────────

export function normalizeTopicDraft(topic: Partial<DebateTopic> | null | undefined): DebateTopic {
  return {
    title: String(topic?.title || DEFAULT_DEBATE_TOPIC.title).trim(),
    proPosition: String(topic?.proPosition || DEFAULT_DEBATE_TOPIC.proPosition).trim(),
    conPosition: String(topic?.conPosition || DEFAULT_DEBATE_TOPIC.conPosition).trim()
  };
}

export function formatReplayOption(item: Record<string, unknown>): string {
  const time = item.savedAt ? new Date(item.savedAt as string).toLocaleString('zh-CN', { hour12: false }) : '';
  const title = (item.title || item.id || '历史对局') as string;
  return time ? `${time}｜${title}` : title;
}

export function createReplayOptionFromGame(game: GameState): Record<string, unknown> {
  return {
    id: game?.id,
    filename: game?.id,
    savedAt: game?.createdAt,
    title: game?.topic?.title || game?.event?.name || game?.id,
    topic: game?.topic,
    players: game?.players || []
  };
}

export function getReplaySetup(options: Record<string, unknown>[] = [], replayId = ''): { topic: DebateTopic; players: Player[]; playerIds: number[]; teams: DebateTeamDraft } | null {
  if (!replayId) return null;
  const replay = options.find((item) => (item.filename || item.id) === replayId || item.id === replayId);
  if (!replay) return null;
  const players = Array.isArray(replay.players) ? replay.players as Player[] : [];
  const playerIds = uniquePlayerIds(players.map((player) => player.id)).slice(0, 12);
  if (!replay.topic || playerIds.length < 8) return null;
  return {
    topic: normalizeTopicDraft(replay.topic as DebateTopic),
    players,
    playerIds,
    teams: createDebateTeamsFromPlayers(players)
  };
}

// ─── Team management ───────────────────────────────────

export function createDebateTeamsFromPlayers(players: Player[] = []): DebateTeamDraft {
  const sorted = [...players].sort((a, b) => {
    const sideOrder: Record<string, number> = { pro: 0, con: 1, judge: 2 };
    const sideDiff = (sideOrder[a.side || ''] ?? 9) - (sideOrder[b.side || ''] ?? 9);
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
    proCaptainId: proIds.includes(Number(proCaptain?.id)) ? Number(proCaptain!.id) : null,
    conCaptainId: conIds.includes(Number(conCaptain?.id)) ? Number(conCaptain!.id) : null
  };
}

export function hasDebateCaptains(players: Player[] = []): boolean {
  return players.some((player) => player.debateRole === 'captain');
}

export function createDefaultDebateTeams(_playerIds: (number | string)[] = []): DebateTeamDraft {
  return {
    proIds: [],
    conIds: [],
    judgeIds: [],
    proCaptainId: null,
    conCaptainId: null
  };
}

export function normalizeDebateTeamDraft(value: Partial<DebateTeamDraft> | null, playerIds: (number | string)[] = []): DebateTeamDraft {
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
      ? Number(value!.proCaptainId)
      : hasExplicitProCaptain ? null : proIds[0] || null;
  const conCaptainId = hasExplicitConCaptain && value?.conCaptainId == null
    ? null
    : conIds.includes(Number(value?.conCaptainId))
      ? Number(value!.conCaptainId)
      : hasExplicitConCaptain ? null : conIds[0] || null;
  return {
    proIds,
    conIds,
    judgeIds,
    proCaptainId,
    conCaptainId
  };
}

export function normalizeRandomizedDebateTeams(value: Partial<DebateTeamDraft>): DebateTeamDraft {
  const playerIds = uniquePlayerIds([
    ...(value.proIds || []),
    ...(value.conIds || []),
    ...(value.judgeIds || [])
  ]);
  if (playerIds.length < 8) throw new Error('随机分配结果不完整');
  return normalizeDebateTeamDraft(value, playerIds);
}

export function resolveDebateRosterPlayerIds(
  rosterPlayerIds: (number | string)[] = [],
  teams: Partial<DebateTeamDraft> = {},
  fallbackPlayerIds: (number | string)[] = [],
): number[] {
  const roster = uniquePlayerIds(rosterPlayerIds).slice(0, 12);
  if (roster.length >= 8) return roster;
  const assigned = uniquePlayerIds([
    ...(teams.proIds || []),
    ...(teams.conIds || []),
    ...(teams.judgeIds || []),
  ]);
  return assigned.length >= 8
      ? uniquePlayerIds([...assigned, ...fallbackPlayerIds]).slice(0, 12)
      : uniquePlayerIds(fallbackPlayerIds);
}

export function getDebateSelectablePlayers(players: Player[] = [], defaultHostId?: number): Player[] {
  return defaultHostId
    ? players.filter((player) => Number(player.id) !== Number(defaultHostId))
    : players;
}

function normalizeDebateSlots(ids: (number | null | undefined)[] = [], size = 0, selectedSet = new Set<number>(), usedSet = new Set<number | null>()): (number | null)[] {
  const used = new Set(usedSet);
  return Array.from({ length: size }).map((_, index) => {
    const id = Number(ids[index]);
    if (!id || !selectedSet.has(id) || used.has(id)) return null;
    used.add(id);
    return id;
  });
}

export function getOrderedDebatePlayerIds(teams: DebateTeamDraft, playerIds: (number | string)[] = []): number[] {
  const selectedIds = uniquePlayerIds(playerIds).slice(0, 12);
  const selectedSet = new Set(selectedIds);
  const assigned = uniquePlayerIds([...(teams?.proIds || []), ...(teams?.conIds || []), ...(teams?.judgeIds || [])])
    .filter((id) => selectedSet.has(id));
  const missing = selectedIds.filter((id) => !assigned.includes(id));
  return [...assigned, ...missing];
}

export function uniquePlayerIds(value: (number | string | null | undefined)[] = []): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter(Boolean))];
}

export function getDebateTeamKey(side: string): 'proIds' | 'conIds' | 'judgeIds' {
  if (side === 'con') return 'conIds';
  if (side === 'judge') return 'judgeIds';
  return 'proIds';
}

export function findDebateTeamSlot(teams: DebateTeamDraft, playerId: number | string): { side: string; index: number } | null {
  const id = Number(playerId);
  const groups: [string, (number | null)[]][] = [
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

export function removeDebatePlayerIds(ids: (number | null)[], playerId: number | string, targetPlayerId: number | string | null): (number | undefined)[] {
  return ids.map((id) => {
    const value = Number(id);
    if (value === Number(playerId) || value === Number(targetPlayerId)) return undefined;
    return value;
  });
}

// ─── Player labels ─────────────────────────────────────

export function getDebatePlayerLabel(players: Player[], playerId: number | string): string {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  if (!player) return `${playerId}号`;
  if (player.side === 'judge') return '评委';
  const sidePlayers = players.filter((item) => item.side === player.side);
  const index = sidePlayers.findIndex((item) => Number(item.id) === Number(playerId));
  const sideLabel = player.side === 'pro' ? '正方' : '反方';
  return `${sideLabel}${toChineseOrdinal(index + 1)}辩`;
}

export function getDebateSpeakerLabel(players: Player[], playerId: number | string): string {
  const player = players.find((item) => Number(item.id) === Number(playerId));
  const roleLabel = getDebatePlayerLabel(players, playerId);
  if (!player) return roleLabel;
  return `${roleLabel}·${player.nickname || player.name || `${player.id}号`}`;
}

export function getDebateIdentityDescription(player: Player): string {
  if (player.side === 'judge') return '本局评委，负责从论点清晰度、反驳质量、团队协作和表达感染力判断胜负，并参与最佳选手评选。';
  const side = player.side === 'pro' ? '正方' : '反方';
  const role = player.debateRole === 'captain' ? '队长' : '辩手';
  const position = player.position || player.sideLabel || side;
  return `本局立场：${position}。身份：${side}${role}，需要围绕本方观点推进论证、反驳对方并配合队友。`;
}

export function toChineseOrdinal(value: number): string {
  return ['零', '一', '二', '三', '四'][value] || String(value);
}

// ─── Import system ─────────────────────────────────────

export function normalizeImportedDebateGame(raw: Record<string, unknown>, _filename = 'imported-debate.json', libraryPlayers: Player[] = []): GameState {
  if (raw?.type === 'debate' && Array.isArray(raw.players) && (Array.isArray(raw.phases) || Array.isArray(raw.rounds))) {
    const players = (raw.players as Record<string, unknown>[]).map((player) => ({
      ...player,
      avatar: getImportedAvatar(player) || (player as Record<string, unknown>).avatar || ''
    }));
    return {
      ...raw,
      id: raw.id || `imported-debate-${Date.now()}`,
      mode: 'real',
      topic: normalizeTopicDraft(raw.topic as DebateTopic),
      players: players as unknown as Player[],
      phases: Array.isArray(raw.phases) ? raw.phases as DebatePhase[] : getPhasesFromImportedRounds(raw.rounds as Record<string, unknown>[]),
      createdAt: raw.createdAt || new Date().toISOString()
    } as unknown as GameState;
  }
  if (raw?.type !== 'ai_debate_match' || !Array.isArray(raw.segments)) {
    throw new Error('暂不支持此文件格式，请导入 ai_debate_match 或项目导出的 debate JSON。');
  }

  const topic: DebateTopic = {
    title: ((raw.metadata as Record<string, unknown>)?.topic || (raw.metadata as Record<string, unknown>)?.title || '导入 AI 辩论赛') as string,
    proPosition: ((raw.positions as Record<string, unknown>)?.affirmative || (raw.teams as Record<string, unknown>)?.affirmative && ((raw.teams as Record<string, unknown>).affirmative as Record<string, unknown>)?.position || '正方立场') as string,
    conPosition: ((raw.positions as Record<string, unknown>)?.negative || (raw.teams as Record<string, unknown>)?.negative && ((raw.teams as Record<string, unknown>).negative as Record<string, unknown>)?.position || '反方立场') as string
  };
  const { players, externalToInternalId, nameToInternalId } = createImportedPlayers(raw, libraryPlayers);
  const result = extractImportedResult(raw, externalToInternalId, nameToInternalId);
  const phases = createImportedPhases(raw, externalToInternalId, players, result);
  const game: GameState = {
    id: `imported-debate-${Date.now()}`,
    type: 'debate',
    mode: 'real',
    topic,
    players,
    phases,
    rounds: phases.map((phase, index) => ({ number: index + 1, phase: phase.id, title: phase.name, speeches: phase.speeches || [] })),
    winner: result.winner,
    winReason: result.winReason,
    mvp: result.mvpId ? publicImportedPlayer(players.find((player) => Number(player.id) === Number(result.mvpId))) as Player : null,
    createdAt: new Date().toISOString()
  };
  game.shareReport = createImportedShareReport(game);
  return game;
}

interface ImportedEntry {
  externalId: string;
  name: string;
  nickname: string;
  avatar: string;
  side: string;
  sideIndex: number | null;
  role: string;
  persona: string;
  isCaptain?: boolean;
}

function createImportedPlayers(raw: Record<string, unknown>, libraryPlayers: Player[] = []): { players: Player[]; externalToInternalId: Map<string, number>; nameToInternalId: Map<string, number> } {
  const teams = raw.teams as Record<string, Record<string, unknown[]>> | undefined;
  const entries: ImportedEntry[] = [
    ...normalizeImportedTeamMembers(teams?.affirmative?.members, 'pro'),
    ...normalizeImportedTeamMembers(teams?.negative?.members, 'con'),
    ...normalizeImportedTeamMembers(teams?.judges?.members, 'judge')
  ];
  const matcher = createPlayerLibraryMatcher(libraryPlayers);
  const seen = new Set<string>();
  const players: Player[] = [];
  const externalToInternalId = new Map<string, number>();
  const nameToInternalId = new Map<string, number>();
  const addPlayer = (entry: ImportedEntry): void => {
    if (!entry.externalId || seen.has(entry.externalId)) return;
    seen.add(entry.externalId);
    const libraryPlayer = matcher.find(entry);
    const id = libraryPlayer?.id || getNextImportedPlayerId(players, libraryPlayers);
    const player = mergeImportedPlayer(libraryPlayer, entry, id);
    players.push(player);
    externalToInternalId.set(entry.externalId, id);
    nameToInternalId.set(normalizeImportedName(entry.externalId), id);
    nameToInternalId.set(normalizeImportedName(entry.name), id);
    nameToInternalId.set(normalizeImportedName(player.nickname || ''), id);
    nameToInternalId.set(normalizeImportedName(player.name || ''), id);
  };

  entries.forEach(addPlayer);

  const speakerMap = raw.speakerMap as Record<string, Record<string, unknown>> | undefined;
  Object.entries(speakerMap || {}).forEach(([externalId, speaker]) => {
    if (externalToInternalId.has(externalId) || speaker?.side === 'neutral') return;
    const side = normalizeImportedSide(speaker?.side as string);
    if (side === 'host') return;
    addPlayer({
      externalId,
      name: (speaker?.nickname || speaker?.name || externalId) as string,
      nickname: (speaker?.nickname || speaker?.name || externalId) as string,
      avatar: getImportedAvatar(speaker),
      side,
      sideIndex: side === 'judge' ? null : players.filter((item) => item.side === side).length,
      role: (speaker?.role || '') as string,
      persona: ''
    });
  });

  (raw.segments as Record<string, unknown>[]).flatMap(flattenImportedSegmentItems).forEach((item) => {
    const externalId = String(item.speakerId || item.judgeId || '');
    if (!externalId || externalId === 'host' || externalToInternalId.has(externalId) || players.length >= 12) return;
    const side = item.judgeId || item.scores ? 'judge' : normalizeImportedSide(item.side as string);
    if (side === 'host') return;
    addPlayer({
      externalId,
      name: (item.nickname || item.name || externalId) as string,
      nickname: (item.nickname || item.name || externalId) as string,
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

function normalizeImportedTeamMembers(members: unknown[] = [], side: string): ImportedEntry[] {
  if (!Array.isArray(members)) return [];
  return members.map((member: unknown, index) => {
    const m = member as Record<string, unknown>;
    return {
      externalId: String(m.id || `${side}-${index + 1}`),
      name: (m.nickname || m.name || m.id || `${side}-${index + 1}`) as string,
      nickname: (m.nickname || m.name || m.id || `${side}-${index + 1}`) as string,
      avatar: getImportedAvatar(m),
      role: (m.role || '') as string,
      persona: (m.persona || '') as string,
      side,
      sideIndex: side === 'judge' ? null : index,
      isCaptain: Boolean(m.isCaptain || m.captain || /captain|队长/i.test(String(m.role || '')))
    };
  });
}

interface PlayerMatcher {
  find(entry: Partial<ImportedEntry>): Player | null;
}

function createPlayerLibraryMatcher(libraryPlayers: Player[] = []): PlayerMatcher {
  const byId = new Map<string, Player>();
  const byName = new Map<string, Player>();
  libraryPlayers.forEach((player) => {
    byId.set(String(player.id), player);
    getPlayerMatchKeys(player).forEach((key) => {
      if (key && !byName.has(key)) byName.set(key, player);
    });
  });
  return {
    find(entry: Partial<ImportedEntry>): Player | null {
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

function getPlayerMatchKeys(value: Record<string, unknown> | Player = {}): string[] {
  const v = value as Record<string, unknown>;
  return [
    v.nickname,
    v.name,
    v.externalId,
    v.id,
    getKnownPlayerAlias(String(v.nickname || v.name || v.externalId || v.id || ''))
  ].map(normalizePlayerMatchKey).filter(Boolean) as string[];
}

function getKnownPlayerAlias(value: string): string {
  const key = String(value || '').trim().toLowerCase();
  const aliases: Record<string, string> = {
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

function normalizePlayerMatchKey(value: unknown): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[·._-]+/g, '');
}

function mergeImportedPlayer(libraryPlayer: Player | null, entry: ImportedEntry, id: number): Player {
  const sideLabel = entry.side === 'pro' ? '正方' : entry.side === 'con' ? '反方' : '评委席';
  const debateRole = entry.side === 'judge' ? 'judge' as const : entry.isCaptain ? 'captain' as const : 'debater' as const;

  return {
    ...(libraryPlayer || {}),
    id,
    name: libraryPlayer?.name || libraryPlayer?.nickname || entry.name,
    nickname: libraryPlayer?.nickname || libraryPlayer?.name || entry.nickname || entry.name,
    avatar: libraryPlayer?.avatar || entry.avatar || '',
    provider: libraryPlayer?.provider || 'imported',
    model: libraryPlayer?.model || 'imported-match',
    sex: libraryPlayer?.sex || '未知',
    personality: libraryPlayer?.personality || entry.persona || '',
    side: entry.side as Player['side'],
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

function getNextImportedPlayerId(players: Player[], libraryPlayers: Player[]): number {
  const used = new Set([
    ...players.map((player) => Number(player.id)),
    ...libraryPlayers.map((player) => Number(player.id)).filter(Number.isFinite)
  ]);
  let next = 1001;
  while (used.has(next)) next += 1;
  return next;
}

interface ImportedResult {
  winner: string | null;
  mvpId: number | string | null;
  winReason: string;
}

function createImportedPhases(raw: Record<string, unknown>, externalToInternalId: Map<string, number>, players: Player[], result: ImportedResult): DebatePhase[] {
  const phases: DebatePhase[] = [];
  (raw.segments as Record<string, unknown>[]).forEach((segment) => {
    const phaseId = mapImportedPhaseId(segment.type || segment.id);
    if (!phaseId) return;
    const speeches = flattenImportedSegmentItems(segment)
      .map((item, index) => createImportedSpeech(item, phaseId, externalToInternalId, players, index))
      .filter(Boolean) as DebateSpeech[];
    if (!speeches.length && phaseId !== 'mvp') return;
    phases.push({
      id: phaseId,
      name: mapImportedPhaseName(phaseId, segment.title as string),
      summary: (segment.title as string) || mapImportedPhaseName(phaseId),
      speeches,
      votes: []
    });
  });

  const judgePhase = phases.find((phase) => phase.id === 'judges');
  const mvpVotes = extractImportedMvpVotes(raw, externalToInternalId, result.mvpId);
  if (mvpVotes.length) {
    const mvpPhase: DebatePhase = {
      id: 'mvp',
      name: '最佳辩手评选',
      summary: '导入对局最佳辩手评选结果。',
      speeches: [],
      votes: mvpVotes as DebateVote[]
    };
    const insertAt = judgePhase ? phases.indexOf(judgePhase) + 1 : phases.length;
    phases.splice(insertAt, 0, mvpPhase);
  }
  return phases;
}

function flattenImportedSegmentItems(segment: Record<string, unknown>): Record<string, unknown>[] {
  const direct = Array.isArray(segment.items) ? segment.items as Record<string, unknown>[] : [];
  const nested = Array.isArray(segment.rounds)
    ? (segment.rounds as Record<string, unknown>[]).flatMap((round) => Array.isArray(round.items) ? round.items as Record<string, unknown>[] : [])
    : [];
  return [...direct, ...nested];
}

function createImportedSpeech(item: Record<string, unknown>, phaseId: string, externalToInternalId: Map<string, number>, players: Player[], index: number): DebateSpeech | null {
  const speakerId = String(item.speakerId || item.judgeId || 'host');
  const playerId = externalToInternalId.get(speakerId) || speakerId;
  const player = players.find((candidate) => Number(candidate.id) === Number(playerId));
  const side = player?.side || normalizeImportedSide(item.side as string) || 'host';
  const text = String(item.text || '').trim();
  if (!text) return null;
  return {
    id: (item.id as string) || `${phaseId}-${index + 1}`,
    phaseId,
    kind: phaseId === 'judges' ? 'judge-review' : side === 'host' ? 'host' : phaseId,
    playerId: String(playerId),
    side,
    debateRole: player?.debateRole || (side === 'host' ? 'host' : 'debater'),
    speakerLabel: player ? getDebatePlayerLabel(players, player.id) : '主持人',
    text,
    targetId: null
  };
}

function extractImportedResult(raw: Record<string, unknown>, externalToInternalId: Map<string, number>, nameToInternalId: Map<string, number>): ImportedResult {
  const resultItem = (raw.segments as Record<string, unknown>[]).flatMap(flattenImportedSegmentItems).find((item) => item.result)?.result as Record<string, unknown> || {};
  const winner = resultItem.winner === 'affirmative' ? 'pro' : resultItem.winner === 'negative' ? 'con' : resultItem.winner === 'draw' ? 'draw' : null;
  const mvpId = externalToInternalId.get(String(resultItem.bestDebater || '')) || nameToInternalId.get(normalizeImportedName(resultItem.bestDebater as string)) || null;
  const winReason = (resultItem.winnerName as string) || (winner === 'pro' ? '正方获得更高综合评分。' : winner === 'con' ? '反方获得更高综合评分。' : '');
  return { winner, mvpId, winReason };
}

function extractImportedMvpVotes(raw: Record<string, unknown>, externalToInternalId: Map<string, number>, fallbackMvpId: number | string | null): { voterId: string | number; target: string | number; reason: string }[] {
  const judgeItems = (raw.segments as Record<string, unknown>[])
    .filter((segment) => mapImportedPhaseId(segment.type || segment.id) === 'judges')
    .flatMap(flattenImportedSegmentItems);
  const votes = judgeItems.map((item) => {
    const voterId = externalToInternalId.get(String(item.speakerId || item.judgeId || ''));
    const target = externalToInternalId.get(String(item.bestDebater || '')) || fallbackMvpId;
    if (!voterId || !target) return null;
    return { voterId, target, reason: String(item.text || '').slice(0, 80) };
  }).filter(Boolean) as { voterId: number; target: number | string; reason: string }[];
  return votes.length ? votes : fallbackMvpId ? [{ voterId: 'host', target: fallbackMvpId, reason: '导入对局结果指定。' }] : [];
}

function extractImportedShareComments(phases: DebatePhase[]): { judgeId: string; judgeName: string; text: string }[] {
  const judgePhase = phases.find((phase) => phase.id === 'judges');
  return (judgePhase?.speeches || []).map((speech) => ({
    judgeId: speech.playerId,
    judgeName: speech.speakerLabel || '评委',
    text: String(speech.text || '').slice(0, 120)
  })).slice(0, 3);
}

function createImportedShareReport(game: GameState): DebateShareReport {
  return {
    topic: game.topic!.title,
    proPosition: game.topic!.proPosition,
    conPosition: game.topic!.conPosition,
    proLineup: (game.players || []).filter((player) => player.side === 'pro'),
    conLineup: (game.players || []).filter((player) => player.side === 'con'),
    judges: (game.players || []).filter((player) => player.side === 'judge'),
    winner: game.winner || null,
    winnerLabel: game.winner === 'pro' ? '正方胜出' : game.winner === 'con' ? '反方胜出' : game.winner === 'draw' ? '双方平局' : '待公布',
    winReason: game.winReason || '',
    mvp: game.mvp || null,
    highlights: extractClientHighlights(game.phases || [], game.players || []),
    judgeComments: extractImportedShareComments(game.phases || []),
    generatedAt: game.createdAt || ''
  };
}

function publicImportedPlayer(player: Player | undefined): Partial<Player> | null {
  return player ? { id: player.id, nickname: player.nickname, name: player.name, avatar: getPlayerAvatar(player), avatarUrl: getPlayerAvatar(player), side: player.side, sideLabel: player.sideLabel } : null;
}

function getImportedAvatar(value: Record<string, unknown> = {}): string {
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

function getPhasesFromImportedRounds(rounds: Record<string, unknown>[] = []): DebatePhase[] {
  if (!Array.isArray(rounds)) return [];
  return rounds.map((round, index) => ({
    id: (round.phase || round.id || `round-${index + 1}`) as string,
    name: (round.title || round.name || `第 ${index + 1} 环节`) as string,
    summary: (round.summary || '') as string,
    speeches: Array.isArray(round.speeches) ? round.speeches as DebateSpeech[] : [],
    votes: Array.isArray(round.votes) ? round.votes as DebateVote[] : []
  }));
}

function mapImportedPhaseId(value: unknown): string | null {
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

function mapImportedPhaseName(phaseId: string, fallback = ''): string {
  const names: Record<string, string> = {
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

function normalizeImportedSide(value: unknown): string {
  const side = String(value || '').toLowerCase();
  if (side === 'affirmative' || side === 'pro') return 'pro';
  if (side === 'negative' || side === 'con') return 'con';
  if (side === 'judge') return 'judge';
  return 'host';
}

function normalizeImportedName(value: unknown): string {
  return String(value || '').trim().toLowerCase();
}

function sanitizeImportedPhaseId(value: string): string {
  const text = String(value || '').trim().toLowerCase();
  const safe = text
    .replace(/[^a-z0-9一-龥_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return safe || `custom-phase-${Date.now()}`;
}
