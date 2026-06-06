import { countTargets } from './winCheck';

interface SeatItem {
  id: number;
  [key: string]: unknown;
}

interface AgentForLabel {
  roleConfig?: { name?: string } | null;
  roleLabel?: string;
  role?: string;
  [key: string]: unknown;
}

interface RoleConfigForActions {
  rule?: {
    actions?: Array<{ action?: string }>;
  };
  [key: string]: unknown;
}

const ROLE_ACTION_ALIASES: Record<string, string[]> = {
  kill: ['wolf_kill', 'wolf_vote', 'wolf_speech'],
  wolf_kill: ['kill'],
  wolf_vote: ['kill'],
  wolf_speech: ['kill'],
  inspectFaction: ['seer_check'],
  seer_check: ['inspectFaction'],
  save: ['witch_save'],
  witch_save: ['save'],
  poison: ['witch_poison'],
  witch_poison: ['poison'],
  guard: ['guard_protect'],
  guard_protect: ['guard']
};

interface AgentForFallback {
  id: number;
  faction?: string;
  roleConfig?: RoleConfigForActions;
  alive?: boolean;
  [key: string]: unknown;
}

interface WolfSpeech {
  playerId: number;
  text: string;
  [key: string]: unknown;
}

interface DaySpeech {
  source?: string;
  direction?: string;
  startPlayerId?: number;
  playerIds?: number[];
  [key: string]: unknown;
}

interface SheriffElection {
  signedUpIds?: number[];
  speeches?: Array<{ playerId: number; text: string }>;
  withdrawnIds?: number[];
  votes?: Record<string, number | null>;
  runoffSpeeches?: Array<{ playerId: number; text: string }>;
  runoffVotes?: Record<string, number>;
  tally?: Record<string, number>;
  runoffTally?: Record<string, number>;
}

interface HunterShot {
  from: number;
  target: number;
  [key: string]: unknown;
}

interface Exile {
  id: number;
  [key: string]: unknown;
}

interface IdiotReveal {
  id: number;
  [key: string]: unknown;
}

interface LastWords {
  playerId: number;
  text: string;
  [key: string]: unknown;
}

interface Speech {
  playerId: number;
  text: string;
  [key: string]: unknown;
}

interface Round {
  day: number;
  publicSummary?: string;
  sheriffId?: number | null;
  exile?: Exile | null;
  idiotReveal?: IdiotReveal | null;
  hunterShot?: HunterShot | null;
  daySpeech?: DaySpeech | null;
  sheriffElection?: SheriffElection | null;
  speeches?: Speech[];
  votes?: Record<string, number | null>;
  lastWords?: LastWords[];
  nightRevealed?: boolean;
  [key: string]: unknown;
}

interface AgentForPublicLog {
  id: number;
  alive?: boolean;
  [key: string]: unknown;
}

interface MemoryEntry {
  id: string;
  scope: string;
  type: string;
  text: string;
  order: number;
}

interface RoleConfigFull {
  id?: string;
  name?: string;
  faction?: string;
  roleType?: string;
  rule?: Record<string, unknown>;
  [key: string]: unknown;
}

interface ModeConfigForRole {
  roleMap?: Record<string, RoleConfigFull>;
  [key: string]: unknown;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function sortBySeat<T extends SeatItem>(items: T[]): T[] {
  return [...items].sort((a, b) => Number(a.id) - Number(b.id));
}

function rotateFromSeat<T extends SeatItem>(items: T[], startId: number, direction: string = 'clockwise'): T[] {
  const index = items.findIndex((item) => Number(item.id) === Number(startId));
  const ordered = index >= 0 ? [...items.slice(index), ...items.slice(0, index)] : [...items];
  return direction === 'counterclockwise' ? [ordered[0], ...ordered.slice(1).reverse()] : ordered;
}

function getNextAliveId(alive: SeatItem[], afterId: number, direction: string = 'clockwise'): number | undefined {
  const sorted = sortBySeat(alive);
  if (!sorted.length) return undefined;
  if (direction === 'counterclockwise') {
    return [...sorted].reverse().find((item) => Number(item.id) < Number(afterId))?.id
      ?? sorted[sorted.length - 1]?.id;
  }
  return sorted.find((item) => Number(item.id) > Number(afterId))?.id
    ?? sorted[0]?.id;
}

function getClockStartId(alive: Array<{ id: number }>): number {
  const hour = new Date().getHours() % 12 || 12;
  const seatIds = alive.map((agent) => agent.id).sort((a, b) => a - b);
  return seatIds.find((id) => id >= hour) || seatIds[0];
}

function getSeatNumber(playerId: number | string, allPlayers?: Array<{ id: number }>): number {
  if (!allPlayers?.length) return Number(playerId);
  const sorted = [...allPlayers].sort((a, b) => Number(a.id) - Number(b.id));
  const index = sorted.findIndex((p) => Number(p.id) === Number(playerId));
  return index >= 0 ? index + 1 : Number(playerId);
}

function getSheriffSpeechOrder(alive: SeatItem[], sheriffId: number, direction: string = 'clockwise'): SeatItem[] {
  const speakers = sortBySeat(alive).filter((agent) => Number(agent.id) !== Number(sheriffId));
  const sheriff = alive.find((agent) => Number(agent.id) === Number(sheriffId));
  const startId = getNextAliveId(alive, sheriffId, direction);
  const order = rotateFromSeat(speakers, startId!, direction);
  return sheriff ? [...order, sheriff] : order;
}

function getSheriffNightDeathSpeechOrder(alive: SeatItem[], sheriffId: number, deathId: number, direction: string): SeatItem[] {
  const speakers = alive.filter((agent) => Number(agent.id) !== Number(sheriffId));
  const startId = getNextAliveId(speakers, deathId, direction);
  return [...rotateFromSeat(speakers, startId!, direction), alive.find((agent) => Number(agent.id) === Number(sheriffId))].filter(Boolean) as SeatItem[];
}

function getTopCandidateIds(tally: Record<string, number> | null | undefined): number[] {
  const entries = Object.entries(tally || {}).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return [];
  const top = entries[0][1];
  return entries.filter(([, count]) => count === top).map(([id]) => Number(id));
}

async function* prefetchOrderedSpeechTexts<T extends { id: number }>(
  agents: T[],
  loadText: (agent: T) => Promise<string>,
  lookahead: number = 2
): AsyncGenerator<{ agent: T; text: string }> {
  const pending = new Map<number, Promise<{ agent: T; text: string } | { agent: T; error: unknown }>>();
  const preload = (index: number): void => {
    if (index >= agents.length || pending.has(index)) return;
    const agent = agents[index];
    pending.set(index, Promise.resolve()
      .then(() => loadText(agent))
      .then((text) => ({ agent, text }))
      .catch((error) => ({ agent, error })));
  };
  for (let index = 0; index < Math.min(lookahead, agents.length); index += 1) preload(index);
  for (let index = 0; index < agents.length; index += 1) {
    const prepared = await pending.get(index);
    pending.delete(index);
    if (!prepared) continue;
    if ('error' in prepared) throw prepared.error;
    preload(index + lookahead);
    yield prepared as { agent: T; text: string };
  }
}

function buildWolfStrategySummary(wolfChoices: Record<string, number> | null | undefined, wolfTarget: number | null | undefined, agents: AgentForLabel[]): string {
  const choices = Object.entries(wolfChoices || {});
  if (!choices.length || !wolfTarget) return '';
  const target = agents.find((agent) => Number(agent.id) === Number(wolfTarget));
  const targetLabel = target ? `${getSeatNumber(target.id as number, agents as unknown as Array<{ id: number }>)}号${getRoleLabel(target)}` : `${getSeatNumber(wolfTarget!, agents as unknown as Array<{ id: number }>)}号`;
  const focused = choices.every(([, targetId]) => Number(targetId) === Number(wolfTarget));
  return focused ? `狼队统一刀口 ${targetLabel}。` : `狼队刀口分散，最终集中到 ${targetLabel}。`;
}

function getVoteMessage(round: Round, agents?: Array<{ id: number }>): string {
  if (round.idiotReveal) return `发言结束，开始放逐投票。请所有玩家投票。${getSeatNumber(round.idiotReveal.id, agents)}号翻牌为白痴，免除本次放逐并失去投票权。`;
  if (!round.exile) return '发言结束，开始放逐投票。请所有玩家投票。本轮无人被放逐。';
  return `发言结束，开始放逐投票。请所有玩家投票。${getSeatNumber(round.exile.id, agents)}号玩家被放逐出局。`;
}

function buildSheriffVoteMessage(round: Round, runoff: boolean, agents?: Array<{ id: number }>): string {
  if (!runoff) return '退水结束，开始投票。';
  const tally = runoff ? round.sheriffElection?.runoffTally : round.sheriffElection?.tally;
  const topIds = getTopCandidateIds(tally);
  if (!topIds.length) return runoff ? '警长复投无人形成有效票型。' : '警长竞选无人形成有效票型。';
  if (topIds.length > 1) return `${runoff ? '警长复投' : '警长竞选投票'}平票：${topIds.map((id) => `${getSeatNumber(id, agents)}号`).join('、')}。`;
  return `${runoff ? '警长复投' : '警长竞选投票'}最高票为${getSeatNumber(topIds[0], agents)}号。`;
}

function buildSpeechOrderMessage(round: Round, agents?: Array<{ id: number }>): string {
  if (round.daySpeech?.source === 'sheriff') {
    return `警长决定${round.daySpeech.direction === 'counterclockwise' ? '逆时针' : '顺时针'}发言，从${getSeatNumber(round.daySpeech.startPlayerId!, agents)}号开始。`;
  }
  if (round.daySpeech?.source === 'night-death') {
    return `现在${getSeatNumber(round.daySpeech.startPlayerId!, agents)}号开始发言。`;
  }
  const startId = round.daySpeech?.startPlayerId;
  return `从${startId != null ? getSeatNumber(startId, agents) : ''}号开始发言。`;
}

function buildSheriffBadgeMessage(transfer: { action: string; from: number; to?: number }, agents?: Array<{ id: number }>): string {
  if (transfer.action === 'transfer') return `${getSeatNumber(transfer.from, agents)}号警长出局，将警徽移交给${getSeatNumber(transfer.to!, agents)}号。`;
  return `${getSeatNumber(transfer.from, agents)}号警长出局，选择撕掉警徽。`;
}

function buildPublicLog(rounds: Round[], agents: AgentForPublicLog[]): string {
  return rounds.map((round) => [
    `第${round.day}天：${round.publicSummary || ''}`,
    round.sheriffId ? `警长：${getSeatNumber(round.sheriffId, agents)}号` : '',
    round.exile ? `放逐：${getSeatNumber(round.exile.id, agents)}号` : '',
    round.idiotReveal ? `白痴翻牌：${getSeatNumber(round.idiotReveal.id, agents)}号` : '',
    round.hunterShot ? `猎人开枪：${getSeatNumber(round.hunterShot.from, agents)}号带走${getSeatNumber(round.hunterShot.target, agents)}号` : ''
  ].filter(Boolean).join('；')).join('\n') || `存活玩家：${agents.filter((agent) => agent.alive).map((agent) => `${getSeatNumber(agent.id, agents)}号`).join('、')}`;
}

function collectWerewolfPublicMemoryEntries(rounds: Round[] = [], agents: AgentForPublicLog[] = []): MemoryEntry[] {
  const currentRound = rounds.at(-1);
  const entries: MemoryEntry[] = [];
  for (const round of rounds) {
    const day = Number(round.day || 0);
    const baseOrder = day * 100000;
    const current = round === currentRound;
    const summary = buildWerewolfRoundSummary(round, agents);
    if (summary) {
      entries.push(createMemoryEntry(`werewolf:day:${day}:summary:${hashMemoryText(summary)}`, 'summary', summary, baseOrder + 1));
    }

    if (!current) continue;

    if (round.daySpeech?.playerIds?.length) {
      entries.push(createMemoryEntry(
        `werewolf:day:${day}:speech-order`,
        'result',
        `第${day}天白天发言顺序：${formatIds(round.daySpeech.playerIds, agents)}。方向：${round.daySpeech.direction === 'counterclockwise' ? '逆时针' : '顺时针'}。`,
        baseOrder + 50
      ));
    }

    const election = round.sheriffElection;
    if (election) {
      if (Array.isArray(election.signedUpIds) && election.signedUpIds.length) {
        entries.push(createMemoryEntry(
          `werewolf:day:${day}:sheriff-candidates`,
          'result',
          `第${day}天警长竞选上警玩家：${formatIds(election.signedUpIds, agents)}。`,
          baseOrder + 100
        ));
      }
      (election.speeches || []).forEach((speech, index) => {
        entries.push(createMemoryEntry(
          `werewolf:day:${day}:sheriff-speech:${index}:${speech.playerId}`,
          'speech',
          `第${day}天警长竞选发言，${getSeatNumber(speech.playerId, agents)}号：${speech.text}`,
          baseOrder + 110 + index
        ));
      });
      if (Array.isArray(election.withdrawnIds) && election.withdrawnIds.length) {
        entries.push(createMemoryEntry(
          `werewolf:day:${day}:sheriff-withdrawn`,
          'result',
          `第${day}天警长竞选退水玩家：${formatIds(election.withdrawnIds, agents)}。`,
          baseOrder + 180
        ));
      }
      if (election.votes && Object.keys(election.votes).length) {
        entries.push(createMemoryEntry(
          `werewolf:day:${day}:sheriff-votes`,
          'vote',
          `第${day}天警长竞选投票：${formatVotes(election.votes, agents)}。`,
          baseOrder + 190
        ));
      }
      (election.runoffSpeeches || []).forEach((speech, index) => {
        entries.push(createMemoryEntry(
          `werewolf:day:${day}:sheriff-runoff-speech:${index}:${speech.playerId}`,
          'speech',
          `第${day}天警长竞选复投发言，${getSeatNumber(speech.playerId, agents)}号：${speech.text}`,
          baseOrder + 210 + index
        ));
      });
      if (election.runoffVotes && Object.keys(election.runoffVotes).length) {
        entries.push(createMemoryEntry(
          `werewolf:day:${day}:sheriff-runoff-votes`,
          'vote',
          `第${day}天警长竞选复投：${formatVotes(election.runoffVotes, agents)}。`,
          baseOrder + 280
        ));
      }
    }

    (round.lastWords || []).forEach((words, index) => {
      entries.push(createMemoryEntry(
        `werewolf:day:${day}:last-words:${index}:${words.playerId}`,
        'speech',
        `第${day}天遗言，${getSeatNumber(words.playerId, agents)}号：${words.text}`,
        baseOrder + 300 + index
      ));
    });

    (round.speeches || []).forEach((speech, index) => {
      entries.push(createMemoryEntry(
        `werewolf:day:${day}:day-speech:${index}:${speech.playerId}`,
        'speech',
        `第${day}天白天发言，${getSeatNumber(speech.playerId, agents)}号：${speech.text}`,
        baseOrder + 400 + index
      ));
    });

    if (round.votes && Object.keys(round.votes).length) {
      entries.push(createMemoryEntry(
        `werewolf:day:${day}:day-votes`,
        'vote',
        `第${day}天放逐投票：${formatVotes(round.votes, agents)}。`,
        baseOrder + 900
      ));
    }
  }
  return entries;
}

function buildWerewolfRoundSummary(round: Round = {} as Round, agents: AgentForPublicLog[] = []): string {
  const day = Number(round.day || 0);
  const parts: string[] = [];
  if (round.publicSummary) parts.push(round.publicSummary);
  if (round.sheriffId) parts.push(`警长是${getSeatNumber(round.sheriffId, agents)}号`);
  if (round.exile) parts.push(`${getSeatNumber(round.exile.id, agents)}号被放逐`);
  if (round.idiotReveal) parts.push(`${getSeatNumber(round.idiotReveal.id, agents)}号白痴翻牌`);
  if (round.hunterShot) parts.push(`${getSeatNumber(round.hunterShot.from, agents)}号猎人带走${getSeatNumber(round.hunterShot.target, agents)}号`);
  if (!parts.length && day === 1) {
    parts.push(`存活玩家：${agents.filter((agent) => agent.alive).map((agent) => `${getSeatNumber(agent.id, agents)}号`).join('、')}`);
  }
  return parts.length ? `第${day}天摘要：${parts.join('；')}。` : '';
}

function createMemoryEntry(id: string, type: string, text: string, order: number): MemoryEntry {
  return { id, scope: 'public', type, text, order };
}

function formatIds(ids: number[] = [], agents?: Array<{ id: number }>): string {
  return ids.map((id) => `${getSeatNumber(id, agents)}号`).join('、') || '无';
}

function formatVotes(votes: Record<string, number | null> = {}, agents?: Array<{ id: number }>): string {
  return Object.entries(votes)
    .sort(([left], [right]) => getSeatNumber(left, agents) - getSeatNumber(right, agents))
    .map(([playerId, target]) => target == null
      ? `${getSeatNumber(playerId, agents)}号弃票`
      : `${getSeatNumber(playerId, agents)}号投${getSeatNumber(target, agents)}号`)
    .join('、') || '无';
}

function hashMemoryText(value: string): string {
  const text = String(value || '');
  let hash = 0;
  for (let index = 0; index < text.length; index += 1) {
    hash = ((hash << 5) - hash + text.charCodeAt(index)) | 0;
  }
  return Math.abs(hash).toString(36);
}

const ROLE_NAME_FALLBACK: Record<string, string> = {
  werewolf: '狼人', seer: '预言家', witch: '女巫', hunter: '猎人',
  idiot: '白痴', guard: '守卫', villager: '村民'
};

function getRoleConfig(modeConfig: ModeConfigForRole, roleId: string): RoleConfigFull {
  return modeConfig.roleMap?.[roleId] || {
    id: roleId,
    name: ROLE_NAME_FALLBACK[roleId] || roleId,
    faction: roleId === 'werewolf' ? 'wolves' : 'good',
    roleType: roleId === 'werewolf' ? 'wolf' : roleId === 'villager' ? 'villager' : 'god',
    rule: {}
  };
}

function getRoleLabel(agent: AgentForLabel): string {
  return (agent?.roleConfig as { name?: string })?.name || agent?.roleLabel || agent?.role || '未知身份';
}

function getRoleActions(roleConfig: RoleConfigForActions): string[] {
  return Array.isArray(roleConfig?.rule?.actions) ? roleConfig.rule.actions.map((item) => item.action).filter(Boolean) as string[] : [];
}

function hasRoleAction(roleConfig: RoleConfigForActions | null | undefined, action: string): boolean {
  const actions = getRoleActions(roleConfig || {});
  if (actions.includes(action)) return true;
  const aliases = ROLE_ACTION_ALIASES[action] || [];
  return aliases.some((alias) => actions.includes(alias));
}

export {
  shuffle, sortBySeat, rotateFromSeat, getNextAliveId, getClockStartId,
  getSeatNumber,
  getSheriffSpeechOrder, getSheriffNightDeathSpeechOrder, getTopCandidateIds,
  prefetchOrderedSpeechTexts, buildWolfStrategySummary, getVoteMessage,
  buildSheriffVoteMessage, buildSpeechOrderMessage, buildSheriffBadgeMessage,
  buildPublicLog, collectWerewolfPublicMemoryEntries,
  getRoleConfig, getRoleLabel, getRoleActions, hasRoleAction
};

export type {
  SeatItem,
  AgentForLabel,
  RoleConfigForActions,
  Round,
  ModeConfigForRole,
  RoleConfigFull,
  MemoryEntry
};
