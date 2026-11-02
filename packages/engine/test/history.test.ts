import { describe, expect, it } from 'vitest';
import { createSnapshot, type EngineSnapshot, type LogDraft, type LogEntry } from '../src';
import { DEFAULT_HISTORY_LIMIT, formatHistory } from '../src/prompt/history';
import { makePlayers, runToEnd } from '../src/testing';
import { agentWith } from './fixtures/agents';
import { chainGame } from './fixtures/chainGame';

// 连锁游戏固定座位：1 号猎手（town）、2 号爆破手（bomb），其余村民（town）
const base = createSnapshot(chainGame, { seed: 1, players: makePlayers(5) });
const seatOf = (seatNo: number) => {
  const seat = base.seats.find((item) => item.seat === seatNo);
  if (!seat) throw new Error(`座位 ${seatNo} 不存在`);
  return seat;
};

/** 每个元素是一轮的记录；seq 连续递增，轮次从 1 开始 */
function logOf(rounds: readonly (readonly LogDraft[])[]): LogEntry[] {
  let seq = 0;
  return rounds.flatMap((drafts, index) => drafts.map((draft) => {
    seq += 1;
    return { ...draft, channel: draft.channel ?? 'public', seq, round: index + 1, phaseId: 'talk' } as LogEntry;
  }));
}

function snapshotWith(log: LogEntry[], round: number): EngineSnapshot {
  return { ...base, round, log };
}

const speech = (seat: number, text: string, channel?: LogEntry['channel']): LogDraft =>
  ({ kind: 'speech', seat, text, ...(channel ? { channel } : {}) });

function roundLog(round: number): LogDraft[] {
  return [
    { kind: 'phase_started', title: '发言' },
    speech(1, `第${round}轮-1号`),
    speech(2, `第${round}轮-2号`),
    { kind: 'narration', text: `第${round}轮播报` },
    { kind: 'seat_eliminated', seat: round, reason: '放逐' },
  ];
}

describe('history compression by round', () => {
  it('keeps the latest two rounds complete and replaces older speech bodies with one marker per round', () => {
    const history = formatHistory(chainGame, snapshotWith(logOf([roundLog(1), roundLog(2), roundLog(3)]), 3), seatOf(1));
    const lines = history.split('\n');
    expect(lines.slice(0, 4)).toEqual(['【发言】', '（第 1 轮的 2 条发言已省略）', '主持人：第1轮播报', '1号 玩家1出局（放逐）']);
    expect(history).not.toContain('第1轮-1号');
    expect(history).toContain('第2轮-1号');
    expect(history).toContain('第3轮-2号');
    expect(lines.filter((line) => line.includes('已省略'))).toHaveLength(1);
  });

  it('applies channel visibility before counting omitted speeches', () => {
    const log = logOf([
      [speech(1, 'a'), speech(2, '密谈-1', 'team:bomb'), speech(3, 'c')],
      [speech(1, 'b')],
      [speech(2, '密谈-3', 'team:bomb')],
    ]);
    const town = formatHistory(chainGame, snapshotWith(log, 3), seatOf(1));
    const bomb = formatHistory(chainGame, snapshotWith(log, 3), seatOf(2));
    expect(town).toContain('（第 1 轮的 2 条发言已省略）');
    expect(town).not.toContain('密谈');
    expect(bomb).toContain('（第 1 轮的 3 条发言已省略）');
    expect(bomb).toContain('密谈-3');
  });

  it('falls back to the overall cap when the compressed history is still too long', () => {
    const noise = Array.from({ length: DEFAULT_HISTORY_LIMIT + 100 }, (_, index): LogDraft => ({ kind: 'narration', text: `播报${index}` }));
    const lines = formatHistory(chainGame, snapshotWith(logOf([noise]), 1), seatOf(1)).split('\n');
    expect(lines[0]).toBe('（更早的 100 条记录已省略）');
    expect(lines).toHaveLength(DEFAULT_HISTORY_LIMIT + 1);
    expect(lines[lines.length - 1]).toBe(`主持人：播报${DEFAULT_HISTORY_LIMIT + 99}`);
    const short = formatHistory(chainGame, snapshotWith(logOf([noise]), 1), seatOf(1), { limit: 10 }).split('\n');
    expect(short).toHaveLength(11);
  });

  it('shows a round-three speaker the first-day structure but not its speeches', () => {
    // 每轮三方平票、无人出局，对局跑满 6 轮；发言正文按轮次编号
    const votes: Record<number, number> = { 1: 3, 2: 3, 3: 4, 4: 1, 5: 1 };
    const run = runToEnd(chainGame, {
      seed: 1,
      playerCount: 5,
      agent: agentWith(chainGame, (request, snapshot) => {
        if (request.phaseId === 'talk') return { output: { speech: `第${snapshot.round}轮-${request.seat}号发言` } };
        if (request.phaseId === 'vote') return { output: { target: votes[request.seat] } };
        return undefined;
      }),
    });
    expect(run.snapshot.result?.endReason).toBe('budget');
    const history = run.requests.find(({ request, snapshot }) => request.phaseId === 'talk' && request.seat === 1 && snapshot.round === 3)?.request.prompt.history ?? '';
    expect(history).toContain('（第 1 轮的 5 条发言已省略）');
    expect(history).not.toContain('第1轮-2号发言');
    expect(history).toContain('第2轮-2号发言');
    expect(history.split('\n').filter((line) => line.startsWith('放逐投票'))).toHaveLength(2);
    expect(history).toBe(formatHistory(chainGame, run.requests.find(({ request, snapshot }) => request.phaseId === 'talk' && request.seat === 1 && snapshot.round === 3)?.snapshot ?? run.snapshot, seatOf(1)));
  });
});
