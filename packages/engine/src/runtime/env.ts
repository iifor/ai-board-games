import type { EndReason, StageEvent } from '@battle/shared';
import type { CompiledGame } from '../compiler/compile';
import type { PhaseResult, RuleContext } from '../spec/context';
import type { PhaseSpec } from '../spec/phases';
import { cloneJson, deepFreeze } from '../utils/json';
import { audienceCanSee } from '../visibility/channels';
import { audienceMode, buildAudienceView } from '../visibility/audienceView';
import { createRng, deriveSeed } from './rng';
import { SeatQuery } from './seats';
import { fireEvent } from './triggers';
import type { AiRequest, EngineSnapshot, LogDraft, LogEntry, Seat } from './types';

export interface Emitted {
  readonly log: LogEntry[];
  readonly stageEvents: StageEvent[];
  readonly aiRequests: AiRequest[];
}

/** 单次推进的执行环境：持有可变的工作快照，并收集本次产出的日志、舞台事件与 AI 请求 */
export class ExecEnv {
  constructor(
    readonly game: CompiledGame,
    readonly s: EngineSnapshot,
    readonly out: Emitted,
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
      params: s.params,
      seats: new SeatQuery(s.seats),
      round: s.round,
      phaseId: s.cursor.phaseId,
      results: Object.freeze({ ...s.results }),
      result,
      endReason,
      trigger: s.activeTrigger,
      random: (label: string) => createRng(deriveSeed(s.seed, `${scope}:${label}`)),
    };
  }

  phaseState<T>(): T {
    return this.s.cursor.phaseState as T;
  }

  setPhaseState<T>(value: T): void {
    this.s.cursor.phaseState = value;
  }

  log(draft: LogDraft): LogEntry {
    const { s } = this;
    const entry = {
      ...draft,
      channel: draft.channel ?? 'public',
      seq: s.log.length + 1,
      round: s.round,
      phaseId: s.cursor.phaseId,
    } as LogEntry;
    s.log.push(entry);
    this.out.log.push(entry);
    if (entry.kind !== 'fallback' && audienceCanSee(entry.channel, audienceMode(this.game))) {
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

  /** 淘汰座位并派发 seat_eliminated 事件；cause 是给触发器判断用的机器可读原因 */
  eliminate(seatNo: number, reason: string, cause: string = reason): void {
    const target = this.seat(seatNo);
    if (!target.alive) throw new Error(`座位 ${seatNo} 已经出局，不能再次淘汰`);
    this.s.seats = deepFreeze(this.s.seats.map((seat) => (seat.seat === seatNo ? { ...seat, alive: false } : seat)));
    this.log({ kind: 'seat_eliminated', seat: seatNo, reason });
    fireEvent(this, { kind: 'seat_eliminated', seat: seatNo, cause, reason });
  }
}
