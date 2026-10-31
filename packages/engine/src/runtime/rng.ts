import { hashLabel } from '../utils/hash';

export interface Rng {
  /** [0, 1) */
  next(): number;
  /** [0, maxExclusive) 的整数 */
  int(maxExclusive: number): number;
  pick<T>(items: readonly T[]): T;
  shuffle<T>(items: readonly T[]): T[];
}

/** 由主种子与标签派生子种子：不同标签的序列互不影响，与调用顺序无关 */
export function deriveSeed(seed: number, label: string): number {
  const mixed = Math.imul((seed >>> 0) ^ hashLabel(label), 0x9e3779b1);
  return (mixed ^ hashLabel(`${label}#${seed >>> 0}`)) >>> 0;
}

/** splitmix32 */
export function createRng(seed: number): Rng {
  let state = seed >>> 0;

  const next = (): number => {
    state = (state + 0x9e3779b9) >>> 0;
    let z = state;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
    z = (z ^ (z >>> 16)) >>> 0;
    return z / 4294967296;
  };

  const int = (maxExclusive: number): number => {
    if (!Number.isInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError(`Rng.int 需要正整数上界，收到 ${maxExclusive}`);
    }
    return Math.floor(next() * maxExclusive);
  };

  const pick = <T>(items: readonly T[]): T => {
    const item = items[int(items.length)];
    if (item === undefined) throw new RangeError('Rng.pick 不能从空列表中选取');
    return item;
  };

  const shuffle = <T>(items: readonly T[]): T[] => {
    const result = [...items];
    for (let i = result.length - 1; i > 0; i -= 1) {
      const j = int(i + 1);
      const current = result[i] as T;
      result[i] = result[j] as T;
      result[j] = current;
    }
    return result;
  };

  return { next, int, pick, shuffle };
}
