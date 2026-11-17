import type { StageEvent } from '@battle/shared';
import type { CompiledGame } from '../compiler/compile';
import { formatEntry, formatHistory } from '../prompt/history';
import type { AiRequest, EngineSnapshot, Seat } from '../runtime/types';
import { audienceMode } from '../visibility/audienceView';
import { entryVisibleTo } from '../visibility/channels';
import { roleVisibleTo } from '../visibility/roles';
import { projectState } from '../visibility/stateProjection';
import type { RecordedRequest, RunRecord } from './harness';

/**
 * 结构性泄露检查：不做文本比对，直接用引擎自己的可见性函数核对每个 AI 请求实际带上的内容。
 * - L4 历史恰好等于引擎对该座位可见日志（entryVisibleTo）的渲染：不可见日志（含投票明细、出局原因、技能目标）
 *   一行都不会混进来，与文本长度无关
 * - 模板上下文里的身份字段只在 roleVisibleTo 允许时非空；队友列表只给 knowsTeammates 的角色
 * - 模板上下文里的 state 与引擎对该座位的投影完全一致
 */

/** 请求在一次 advance 中途发出，录下的快照可能多出该请求之后写入的日志：最多回退这么多条找发出时的前缀 */
const MAX_LOG_LOOKBACK = 64;
const ROLE_FIELDS = ['role', 'roleName', 'team', 'position'] as const;

function canonical(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'undefined';
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, item]) => item !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonical(item)}`).join(',')}}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : null;
}

/** 请求发出时的日志前缀：L4 历史必须恰好等于引擎对该前缀、该座位的渲染 */
function issuedHistoryMatches(game: CompiledGame, s: EngineSnapshot, viewer: Seat, history: string): boolean {
  const floor = Math.max(0, s.log.length - MAX_LOG_LOOKBACK);
  for (let length = s.log.length; length >= floor; length -= 1) {
    if (formatHistory(game, { ...s, log: s.log.slice(0, length) }, viewer) === history) return true;
  }
  return false;
}

/** 历史不等于引擎渲染时的诊断：找出整行出现在历史里的不可见日志（含投票明细、出局原因、技能目标） */
function hiddenLinesInHistory(game: CompiledGame, s: EngineSnapshot, viewer: Seat, history: string): string[] {
  const visibleLines = new Set<string>();
  const hiddenLines: { seq: number; channel: string; text: string }[] = [];
  for (const entry of s.log) {
    const text = formatEntry(game, s, entry);
    if (text === null) continue;
    if (entryVisibleTo(entry, viewer)) visibleLines.add(text);
    else hiddenLines.push({ seq: entry.seq, channel: entry.channel, text });
  }
  const framed = `\n${history}\n`;
  return hiddenLines
    .filter((hidden) => !visibleLines.has(hidden.text) && framed.includes(`\n${hidden.text}\n`))
    .map((hidden) => `不可见日志 #${hidden.seq}（${hidden.channel}）："${hidden.text.slice(0, 60)}"`);
}

function historyProblems(game: CompiledGame, s: EngineSnapshot, viewer: Seat, request: AiRequest): string[] {
  const where = `请求 ${request.id}（${request.seat}号）`;
  const problems: string[] = [];
  if (!issuedHistoryMatches(game, s, viewer, request.prompt.history)) {
    const leaked = hiddenLinesInHistory(game, s, viewer, request.prompt.history);
    problems.push(`${where} 的历史不等于引擎对该座位可见日志的渲染${leaked.length ? `，含${leaked.join('；')}` : ''}`);
  }
  for (const evidence of request.memoryContext?.evidence ?? []) {
    const entry = s.log.find((item) => item.seq === evidence.seq);
    if (!entry || !entryVisibleTo(entry, viewer)) problems.push(`${where} 的记忆摘录引用了不可见日志 #${evidence.seq}`);
  }
  return problems;
}

function seatViewProblems(game: CompiledGame, s: EngineSnapshot, viewer: Seat, where: string, label: string, value: unknown): string[] {
  const view = asRecord(value);
  if (!view || typeof view.seat !== 'number') return [`${where} 的 ${label} 不是座位视图`];
  const target = s.seats.find((seat) => seat.seat === view.seat);
  if (!target) return [`${where} 的 ${label} 指向不存在的 ${String(view.seat)}号`];
  if (roleVisibleTo(game, s, target, viewer)) return [];
  return ROLE_FIELDS.filter((field) => view[field] !== null && view[field] !== undefined)
    .map((field) => `${where} 的 ${label} 暴露了 ${target.seat}号的 ${field}`);
}

function contextProblems(game: CompiledGame, s: EngineSnapshot, viewer: Seat, request: AiRequest): string[] {
  const where = `请求 ${request.id}（${request.seat}号）`;
  const context = request.taskTemplate?.context;
  if (!context) return [`${where} 缺少模板上下文，无法做结构检查`];
  const problems: string[] = [];
  const list = (key: string): unknown[] => (Array.isArray(context[key]) ? (context[key] as unknown[]) : []);
  for (const key of ['seats', 'aliveSeats', 'teammates']) {
    list(key).forEach((item, index) => problems.push(...seatViewProblems(game, s, viewer, where, `${key}[${index}]`, item)));
  }
  const me = asRecord(context.me);
  if (!me || me.seat !== viewer.seat) problems.push(`${where} 的 me 不是请求者本人`);
  const knowsTeammates = Boolean(game.spec.roles[viewer.role]?.knowsTeammates);
  for (const item of list('teammates')) {
    const mate = s.seats.find((seat) => seat.seat === asRecord(item)?.seat);
    if (!knowsTeammates || !mate || mate.team !== viewer.team || mate.seat === viewer.seat) {
      problems.push(`${where} 的 teammates 含不应知道的 ${String(asRecord(item)?.seat)}号`);
    }
  }
  if (canonical(context.state) !== canonical(projectState(game, s.state, viewer))) {
    problems.push(`${where} 的 state 不等于引擎对该座位的投影`);
  }
  if (canonical(context.legalTargets) !== canonical(request.legalTargets ?? [])) {
    problems.push(`${where} 的 legalTargets 与请求不一致`);
  }
  return problems;
}

export function requestStructuralProblems(game: CompiledGame, { request, snapshot }: RecordedRequest): string[] {
  const viewer = snapshot.seats.find((seat) => seat.seat === request.seat);
  if (!viewer) return [`请求 ${request.id} 的座位不存在`];
  return [...historyProblems(game, snapshot, viewer, request), ...contextProblems(game, snapshot, viewer, request)];
}

/** 事件发生时身份是否已被 revealRoles 公开（揭示事件会携带 data.roles） */
export function eventRevealed(run: RunRecord, seq: number): boolean {
  return run.log.some((entry) => entry.kind === 'revealed' && entry.seq <= seq && 'roles' in entry.data);
}

/**
 * 上帝视角的舞台流会推送全部非 host 频道，但服务端据 publicRoles 生成单座位观战流：
 * host 频道不能上舞台，publicRoles 只能含公开角色（或 revealRoles / 终局揭示之后）
 */
export function omniscientStageProblems(game: CompiledGame, run: RunRecord): string[] {
  if (audienceMode(game) !== 'omniscient') return [];
  const problems: string[] = [];
  for (const event of run.stageEvents as readonly StageEvent[]) {
    if (event.channel === 'host') problems.push(`舞台事件 #${event.seq} 来自 host 频道`);
    if (event.view.status === 'completed' || eventRevealed(run, event.seq)) continue;
    for (const seatNo of event.view.publicRoles ?? []) {
      const role = event.view.seats.find((seat) => seat.seat === seatNo)?.role;
      if (!role || !game.spec.roles[role]?.publicRole) problems.push(`舞台事件 #${event.seq} 的 publicRoles 公开了 ${seatNo}号（${role ?? '?'}）`);
    }
  }
  return problems;
}
