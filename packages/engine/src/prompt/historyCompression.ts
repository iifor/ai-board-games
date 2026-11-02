import type { LogEntry } from '../runtime/types';

/** 已经过可见性过滤并渲染成文本的一条历史记录 */
export interface HistoryLine {
  readonly text: string;
  readonly round: number;
  readonly kind: LogEntry['kind'];
}

/** 旧轮次里被省略的记录种类：发言正文（公开发言、队内密谈、遗言……）；播报、投票、出局等结构性记录保留 */
const COMPRESSIBLE: ReadonlySet<LogEntry['kind']> = new Set(['speech']);

export function omissionMarker(round: number, count: number): string {
  return `（第 ${round} 轮的 ${count} 条发言已省略）`;
}

/**
 * 按轮次压缩：最近 fullRounds 轮（含当前轮）完整保留；更早的轮次去掉发言正文，
 * 在该轮第一条被省略的发言处放一条省略标记。输出只取决于输入，确定性。
 */
export function compressOlderRounds(lines: readonly HistoryLine[], currentRound: number, fullRounds: number): string[] {
  const oldestFull = currentRound - fullRounds + 1;
  const omitted = new Map<number, number>();
  for (const line of lines) {
    if (line.round < oldestFull && COMPRESSIBLE.has(line.kind)) omitted.set(line.round, (omitted.get(line.round) ?? 0) + 1);
  }
  const marked = new Set<number>();
  return lines.flatMap((line) => {
    const count = omitted.get(line.round);
    if (count === undefined || !COMPRESSIBLE.has(line.kind)) return [line.text];
    if (marked.has(line.round)) return [];
    marked.add(line.round);
    return [omissionMarker(line.round, count)];
  });
}
