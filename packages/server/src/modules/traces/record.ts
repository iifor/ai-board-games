import type { TraceMark } from '@battle/shared';
import type { Transaction } from 'kysely';
import type { Database } from '../../db/schema';

export function boundary(kind: 'control' | 'failure', label: string, data: unknown,
  cursor: { round: number; cursor: { phaseId: string | null; visit: number } }): TraceMark {
  return { kind, label, data, round: cursor.round, phaseId: cursor.cursor.phaseId, visit: cursor.cursor.visit, seat: null, seq: null, requestIds: [] };
}

/** 调用者已锁定对局行。同一推进的节点按引擎产生顺序随状态、任务、事件原子提交。 */
export async function recordTrace(trx: Transaction<Database>, match: { id: string; traceDeleted: boolean }, inputRequestId: string | null, marks: readonly TraceMark[]) {
  if (match.traceDeleted) return;
  // 大型同步阶段也必须低于 PostgreSQL 的绑定参数上限。
  for (let start = 0; start < marks.length; start += 500) {
    const rows = marks.slice(start, start + 500).map((mark) => ({
      ...mark, matchId: match.id, inputRequestId, requestIds: JSON.stringify(mark.requestIds), data: JSON.stringify(mark.data),
    }));
    await trx.insertInto('matchTraceNodes').values(rows).execute();
  }
}
