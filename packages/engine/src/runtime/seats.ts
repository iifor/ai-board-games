import type { Seat } from './types';

export type SeatRef = Seat | number;
export type SeatSelection = SeatQuery | Seat | readonly SeatRef[];

function seatNumber(ref: SeatRef): number {
  return typeof ref === 'number' ? ref : ref.seat;
}

/** 只读的座位查询：每个方法返回新的查询，不修改原集合 */
export class SeatQuery {
  readonly #seats: readonly Seat[];

  constructor(seats: readonly Seat[]) {
    this.#seats = seats;
  }

  all(): SeatQuery {
    return this;
  }

  alive(): SeatQuery {
    return this.where((seat) => seat.alive);
  }

  dead(): SeatQuery {
    return this.where((seat) => !seat.alive);
  }

  withRole(...roles: readonly string[]): SeatQuery {
    return this.where((seat) => roles.includes(seat.role));
  }

  inTeam(...teams: readonly string[]): SeatQuery {
    return this.where((seat) => teams.includes(seat.team));
  }

  except(...refs: readonly SeatRef[]): SeatQuery {
    const excluded = new Set(refs.map(seatNumber));
    return this.where((seat) => !excluded.has(seat.seat));
  }

  where(predicate: (seat: Seat) => boolean): SeatQuery {
    return new SeatQuery(this.#seats.filter(predicate));
  }

  /** 取唯一的指定席位；不存在或不唯一都视为 spec 错误 */
  position(position: number): Seat {
    const matches = this.#seats.filter((seat) => seat.position === position);
    const [first] = matches;
    if (matches.length !== 1 || !first) {
      throw new Error(`席位 ${position} 应恰好匹配 1 个座位，实际匹配 ${matches.length} 个`);
    }
    return first;
  }

  find(seatNo: number): Seat | undefined {
    return this.#seats.find((seat) => seat.seat === seatNo);
  }

  get(seatNo: number): Seat {
    const seat = this.find(seatNo);
    if (!seat) throw new Error(`座位 ${seatNo} 不存在于当前查询中`);
    return seat;
  }

  has(seatNo: number): boolean {
    return this.find(seatNo) !== undefined;
  }

  list(): readonly Seat[] {
    return this.#seats;
  }

  ids(): number[] {
    return this.#seats.map((seat) => seat.seat);
  }

  count(): number {
    return this.#seats.length;
  }
}

export function toSeatNumbers(selection: SeatSelection): number[] {
  if (selection instanceof SeatQuery) return selection.ids();
  if (Array.isArray(selection)) return (selection as readonly SeatRef[]).map(seatNumber);
  return [(selection as Seat).seat];
}
