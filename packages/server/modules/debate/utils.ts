import { hashText } from '../../services/ai/promptComposer';
import { syncMissingPublicMemory } from '../game-memory';
import { TOPICS } from './constants';
import type { DebateTopic } from './constants';
import { buildShareReport } from './report';

interface DebatePlayer {
  id: number;
  name: string;
  nickname: string;
  avatar: string;
  avatarUrl?: string;
  provider?: string;
  model?: string;
  voicePackageId?: string | null;
  sex?: string;
  personality?: string;
  side: 'pro' | 'con' | 'judge';
  sideIndex: number | null;
  sideLabel: string;
  debateRole: 'captain' | 'debater' | 'judge';
  debateRoleLabel: string;
  role?: string;
  roleLabel?: string;
  alive?: boolean;
  excluded?: boolean;
  speeches?: SpeechEntry[];
  messages?: Array<{ role: string; content: string }>;
  [key: string]: unknown;
}

interface SpeechEntry {
  phaseId: string;
  kind: string;
  playerId: number;
  side: string;
  debateRole: string;
  speakerLabel: string;
  text: string;
  targetId?: number | null;
  thinking?: string;
}

interface DebatePhase {
  id: string;
  name: string;
  limit: number;
  speeches: SpeechEntry[];
  votes: Array<{ voterId: number; target: number }>;
  summary: string;
  stageSummary: string;
}

interface DebateHost {
  id?: number;
  name?: string;
  nickname?: string;
  avatar?: string;
  avatarUrl?: string;
  provider?: string;
  model?: string;
  voicePackageId?: string | null;
}

interface MemoryEntry {
  id: string;
  scope?: string;
  targetSide?: string;
  type: string;
  text: string;
  order: number;
}

interface DebateSetup {
  players: DebatePlayer[];
  proCaptainId: number | null;
  conCaptainId: number | null;
}

interface DebateTeamsConfig {
  proIds?: number[];
  conIds?: number[];
  judgeIds?: number[];
  captainEnabled?: boolean;
  proCaptainId?: number;
  conCaptainId?: number;
}

interface DebateConfig {
  players: Array<{ id: number; [key: string]: unknown }>;
  topic?: DebateTopic;
  debateTeams?: DebateTeamsConfig;
  host?: DebateHost;
  [key: string]: unknown;
}

interface SerializedGame {
  id: string;
  gameType: string;
  type: string;
  mode: string;
  topic: DebateTopic;
  event: Record<string, unknown>;
  host: Record<string, unknown>;
  players: Array<Record<string, unknown>>;
  phases: DebatePhase[];
  rounds: Array<Record<string, unknown>>;
  mvp: Record<string, unknown> | null;
  winner: string | null;
  winReason: string;
  fallbackAudit: unknown[];
  shareReport: Record<string, unknown>;
  createdAt: string;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function choose<T>(items: T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

function normalizeTopic(input: unknown): DebateTopic | null {
  const obj = input as Record<string, unknown> | null | undefined;
  const title = String(obj?.title || '').trim();
  const proPosition = String(obj?.proPosition || '').trim();
  const conPosition = String(obj?.conPosition || '').trim();
  if (!title || !proPosition || !conPosition) return null;
  return { title, proPosition, conPosition };
}

function uniqueValidIds(value: unknown, playerMap: Map<number, unknown>): number[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => playerMap.has(id)))];
}

function normalizeDebateTeams(
  value: DebateTeamsConfig | undefined,
  playerMap: Map<number, DebatePlayer>
): { pro: number[]; con: number[]; judges: number[]; proCaptainId: number | null; conCaptainId: number | null } | null {
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
    conCaptainId: captainEnabled && con.includes(Number(value.conCaptainId)) ? Number(value.conCaptainId) : captainEnabled ? con[0] : null,
  };
}

function getConfiguredDebateSetup(config: DebateConfig): DebateSetup {
  const playerMap = new Map(config.players.map((player) => [Number(player.id), player as unknown as DebatePlayer]));
  const teamConfig = normalizeDebateTeams(config.debateTeams, playerMap as Map<number, DebatePlayer>);
  if (!teamConfig) {
    const players = shuffle(config.players as unknown as DebatePlayer[]).slice(0, Math.min(12, Math.max(8, config.players.length)));
    return { players, proCaptainId: players[0]?.id ?? null, conCaptainId: players[4]?.id ?? null };
  }
  return {
    players: [...teamConfig.pro, ...teamConfig.con, ...teamConfig.judges].map((id) => playerMap.get(Number(id))).filter(Boolean) as DebatePlayer[],
    proCaptainId: teamConfig.proCaptainId,
    conCaptainId: teamConfig.conCaptainId,
  };
}

function createDebateMemoryEntry(entry: Omit<MemoryEntry, 'scope'> & { scope?: string }): MemoryEntry {
  return { scope: 'public', ...entry };
}

function collectDebateMemoryEntries(state: { phases: DebatePhase[] }): MemoryEntry[] {
  const entries: MemoryEntry[] = [];
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
          order: baseOrder + index,
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
        order: baseOrder + 100 + index,
      }));
    });
    if ((phase.votes || []).length) {
      entries.push(createDebateMemoryEntry({ id: `debate:${phase.id}:votes`, type: 'vote', text: `${phase.name}投票：${phase.votes.map((vote) => `${vote.voterId}投${vote.target}`).join('、')}。`, order: baseOrder + 900 }));
    }
  });
  return entries;
}

function syncDebateMemory(agent: DebatePlayer, state: { phases: DebatePhase[] }): unknown[] {
  return syncMissingPublicMemory(agent as never, collectDebateMemoryEntries(state));
}

function publicDebateLog(phases: DebatePhase[]): string {
  const summaries = phases.filter((phase) => phase.stageSummary).map((phase) => `${phase.name}摘要：${phase.stageSummary}`);
  const recent = phases.flatMap((phase) => phase.speeches.map((speech) => `${phase.name}｜${speech.speakerLabel || '发言'}：${speech.text}`)).slice(-6);
  return [...summaries.slice(-5), ...recent].join('\n');
}

function debaterAt(agents: DebatePlayer[], side: string, index: number): DebatePlayer | null {
  return agents.filter((agent) => agent.side === side)[index] || null;
}

function cleanText(value: unknown): string {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function publicPlayer(agent: DebatePlayer | null | undefined): Record<string, unknown> | null {
  return agent ? { id: agent.id, nickname: agent.nickname, avatar: agent.avatar, voicePackageId: agent.voicePackageId, side: agent.side, sideLabel: agent.sideLabel } : null;
}

function publicDebateHost(host: DebateHost = {}): Record<string, unknown> {
  return {
    id: host.id || 0, name: host.name || host.nickname || '主持人',
    nickname: host.nickname || host.name || '主持人', avatar: host.avatar || '',
    avatarUrl: host.avatarUrl || host.avatar || '', provider: host.provider || '',
    model: host.model || '', voicePackageId: host.voicePackageId || null,
  };
}

function buildAgentHash(systemPrompt: string): string {
  return hashText(systemPrompt);
}

function serializeGame({
  gameId, mode, topic, agents, phases, host = null, winner = null, mvp = null, winReason = '', fallbackAudit = [],
}: {
  gameId: string;
  mode: string;
  topic: DebateTopic;
  agents: DebatePlayer[];
  phases: DebatePhase[];
  host?: DebateHost | null;
  winner?: string | null;
  mvp?: Record<string, unknown> | null;
  winReason?: string;
  fallbackAudit?: unknown[];
}): SerializedGame {
  const players = agents.map((agent) => ({
    id: agent.id, name: agent.name, nickname: agent.nickname,
    avatar: agent.avatar, avatarUrl: agent.avatarUrl || agent.avatar,
    provider: agent.provider, voicePackageId: agent.voicePackageId,
    model: agent.model, sex: agent.sex || '未知', personality: agent.personality,
    side: agent.side, sideIndex: agent.sideIndex, sideLabel: agent.sideLabel,
    debateRole: agent.debateRole, debateRoleLabel: agent.debateRoleLabel,
    role: agent.side,
    roleLabel: `${agent.sideLabel}${agent.debateRole === 'captain' ? '队长' : agent.debateRole === 'judge' ? '评委' : '选手'}`,
    alive: true, excluded: false,
  }));
  return {
    id: gameId, gameType: 'debate', type: 'debate', mode, topic,
    event: {
      id: 'ai-debate', name: 'AI 辩论赛', version: 'v1.0',
      background: `辩题：${topic.title}\n正方：${topic.proPosition}\n反方：${topic.conPosition}`,
      terms: { investigators: '正方', mist: '反方', keyFigure: '最佳辩手', cover: '评委' },
      truth: '',
    },
    host: publicDebateHost(host),
    players,
    phases,
    rounds: phases.map((phase, index) => ({
      number: index + 1, phase: phase.id, title: phase.name,
      speeches: phase.speeches, aliveIds: agents.map((agent) => agent.id),
      votes: {}, tally: { A: 0, B: 0 },
    })),
    mvp, winner, winReason, fallbackAudit,
    shareReport: buildShareReport({ topic, players: players as unknown as import('./report').ReportPlayer[], phases, winner, mvp: mvp as unknown as import('./report').ReportPlayer, winReason }) as unknown as Record<string, unknown>,
    createdAt: new Date().toISOString(),
  };
}

export {
  TOPICS, shuffle, choose, normalizeTopic, getConfiguredDebateSetup,
  syncDebateMemory, publicDebateLog, debaterAt, cleanText, publicPlayer,
  publicDebateHost, buildAgentHash, serializeGame,
};
export type {
  DebatePlayer, SpeechEntry, DebatePhase, DebateHost, MemoryEntry,
  DebateSetup, DebateConfig, SerializedGame,
};
