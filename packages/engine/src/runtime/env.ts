import type { EndReason, StageEvent, TraceMark } from '@battle/shared';
import type { CompiledGame } from '../compiler/compile';
import type { PhaseResult, RuleContext } from '../spec/context';
import type { PhaseSpec } from '../spec/phases';
import { cloneJson, deepFreeze } from '../utils/json';
import { audienceCanSee } from '../visibility/channels';
import { audienceMode, buildAudienceView } from '../visibility/audienceView';
import { createRng, deriveSeed } from './rng';
import { SeatQuery } from './seats';
import { fireEvent } from './triggers';
import { variantContext } from './variants';
import type { AiRequest, EngineSnapshot, LogDraft, LogEntry, Seat } from './types';

export interface Emitted {
  readonly log: LogEntry[];
  readonly stageEvents: StageEvent[];
  readonly aiRequests: AiRequest[];
}

/** 单次推进的执行环境：持有可变的工作快照，并收集本次产出的日志、舞台事件与 AI 请求 */
export class ExecEnv {
  acceptedRequestId?: string;
  acceptedOutput?: unknown;
  readonly trace: TraceMark[] = [];
  activeRequestId: string | null = null;

  record(kind: TraceMark['kind'], label: string, data: unknown, links: {
    seat?: number; seq?: number; requestIds?: readonly string[];
  } = {}): void {
    if (!this.collectTrace) return;
    this.trace.push({
      round: this.s.round, phaseId: this.s.cursor.phaseId, visit: this.s.cursor.visit,
      kind, label, data, seat: links.seat ?? null, seq: links.seq ?? null,
      requestIds: links.requestIds ?? (this.activeRequestId ? [this.activeRequestId] : []),
    });
  }
  constructor(
    readonly game: CompiledGame,
    readonly s: EngineSnapshot,
    readonly out: Emitted,
    readonly collectTrace = true,
  ) {}

  phaseId(): string {
    const phaseId = this.s.cursor.phaseId;
    if (phaseId === null) throw new Error('当前没有进行中的阶段');
    return phaseId;
  }

  phase(): PhaseSpec<unknown, unknown> {
    const phaseId = this.phaseId();
    const phase = this.game.spec.phases[phaseId];
    if (!phase) throw new Error(`阶段 "${phaseId}" 不存在`);
    return phase;
  }

  seat(seatNo: number): Seat {
    const seat = this.s.seats.find((item) => item.seat === seatNo);
    if (!seat) throw new Error(`座位 ${seatNo} 不存在`);
    return seat;
  }

  ctx(result: PhaseResult | null = null, endReason: EndReason = 'normal'): RuleContext<unknown, unknown> {
    const { s } = this;
    const scope = `${s.cursor.phaseId ?? 'end'}#${s.cursor.visit}`;
    return {
      state: s.state,
      ...(s.announcementOverrides && { announcementOverrides: s.announcementOverrides }),
      params: s.params,
      seats: new SeatQuery(s.seats),
      round: s.round,
      phaseId: s.cursor.phaseId,
      results: Object.freeze({ ...s.results }),
      result,
      endReason,
      trigger: s.activeTrigger,
      variant: variantContext(this.game, s.variantKey),
      random: (label: string) => createRng(deriveSeed(s.seed, `${scope}:${label}`)),
    };
  }

  phaseState<T>(): T {
    return this.s.cursor.phaseState as T;
  }

  setPhaseState<T>(value: T): void {
    this.s.cursor.phaseState = value;
  }

  log(draft: LogDraft, requestIds?: readonly string[]): LogEntry {
    const { s } = this;
    const entry = {
      ...draft,
      channel: draft.channel ?? 'public',
      seq: s.log.length + 1,
      round: s.round,
      phaseId: s.cursor.phaseId,
    } as LogEntry;
    deepFreeze(entry);
    s.log.push(entry);
    this.out.log.push(entry);
    const visible = entry.kind !== 'fallback' && audienceCanSee(entry.channel, audienceMode(this.game));
    this.record(visible ? 'stage' : 'log', entry.kind, visible ? null : entry, {
      seq: entry.seq, ...('seat' in entry ? { seat: entry.seat } : {}), ...(requestIds ? { requestIds } : {}),
    });
    if (visible) {
      this.out.stageEvents.push({ ...entry, view: buildAudienceView(this.game, s, this.ctx()) });
    }
    return entry;
  }

  /** 规则函数返回的新状态必须符合 state.schema，否则视为规则写错 */
  setState(next: unknown): void {
    const parsed = this.game.spec.state.schema.safeParse(next);
    if (!parsed.success) {
      throw new Error(`规则返回的状态不符合 state.schema：${parsed.error.message}`);
    }
    this.s.state = deepFreeze(cloneJson(parsed.data));
  }

  /** 改变座位的角色或阵营；角色必须已在 spec.roles 中定义 */
  reassign(seatNo: number, change: { readonly role?: string; readonly team?: string }): void {
    const roleSpec = change.role === undefined ? undefined : this.game.spec.roles[change.role];
    if (change.role !== undefined && !roleSpec) throw new Error(`角色 ${change.role} 未定义`);
    const targetBefore = this.seat(seatNo);
    const teamSince = this.s.log.length + 1;
    this.s.seats = deepFreeze(this.s.seats.map((seat) => {
      if (seat.seat !== seatNo) return seat;
      const team = change.team ?? roleSpec?.team ?? seat.team;
      const next = { ...seat, role: change.role ?? seat.role, team };
      return team === seat.team ? next : { ...next, teamSince };
    }));
    const changed = this.seat(seatNo);
    if (audienceMode(this.game) === 'omniscient' && (targetBefore.role !== changed.role || targetBefore.team !== changed.team)) {
      const title = targetBefore.role !== changed.role ? `转为${this.game.spec.roles[changed.role]?.name ?? changed.role}` : '阵营变更';
      this.log({ kind: 'revealed', channel: 'spectator', text: `${seatNo}号 · ${title}`, data: { effect: 'transform', target: seatNo, title } });
    }
  }

  /** 淘汰座位并派发 seat_eliminated 事件；cause 是给触发器判断用的机器可读原因 */
  eliminate(seatNo: number, reason: string, cause: string = reason, requestIds?: readonly string[]): void {
    const target = this.seat(seatNo);
    if (!target.alive) throw new Error(`座位 ${seatNo} 已经出局，不能再次淘汰`);
    this.s.seats = deepFreeze(this.s.seats.map((seat) => (seat.seat === seatNo ? { ...seat, alive: false } : seat)));
    this.log({ kind: 'seat_eliminated', seat: seatNo, reason }, requestIds);
    fireEvent(this, { kind: 'seat_eliminated', seat: seatNo, cause, reason });
  }
}
