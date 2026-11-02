import type { CompiledGame } from '../compiler/compile';
import { seatLabel } from '../runtime/labels';
import type { EngineSnapshot, LogEntry, Seat } from '../runtime/types';
import { entryVisibleTo } from '../visibility/channels';
import { compressOlderRounds, type HistoryLine } from './historyCompression';

/** 压缩后仍超过此行数时只保留最近的部分：整体上限，防止提示词无限增长 */
export const DEFAULT_HISTORY_LIMIT = 400;
/** 完整保留的最近轮数（含当前轮）；更早的轮次只留结构性记录 */
export const DEFAULT_FULL_ROUNDS = 2;

export interface HistoryOptions {
  readonly fullRounds?: number;
  readonly limit?: number;
}

function labelOf(game: CompiledGame, s: EngineSnapshot, seatNo: number): string {
  const seat = s.seats.find((item) => item.seat === seatNo);
  return seat ? seatLabel(game, seat) : `${seatNo}号`;
}

/** 计票中超出选票的部分即额外票（VotePhase.bonus），如"5号+1" */
function bonusVotes(entry: Extract<LogEntry, { kind: 'vote_tallied' }>): string[] {
  return entry.tally.flatMap((row) => {
    const cast = entry.ballots.filter((ballot) => ballot.target === row.target).reduce((sum, ballot) => sum + ballot.weight, 0);
    return row.votes > cast ? [`${row.target}号+${row.votes - cast}`] : [];
  });
}

/** 日志条目 → 给 AI 看的一行文本；fallback 等运营信息不会出现在这里 */
export function formatEntry(game: CompiledGame, s: EngineSnapshot, entry: LogEntry): string | null {
  const label = (seatNo: number): string => labelOf(game, s, seatNo);
  switch (entry.kind) {
    case 'phase_started':
      return `【${entry.title}】`;
    case 'narration':
      return `主持人：${entry.text}`;
    case 'speech':
      return `${label(entry.seat)}：${entry.text}`;
    case 'action':
      return `${label(entry.seat)}：${entry.text}`;
    case 'vote_tallied': {
      const votes = entry.ballots.map((ballot) => `${ballot.voter}号→${ballot.target}号`);
      const bonus = bonusVotes(entry);
      const extra = bonus.length ? [`额外票：${bonus.join('、')}`] : [];
      const abstained = entry.abstained.length ? [`弃票：${entry.abstained.map((seat) => `${seat}号`).join('、')}`] : [];
      const ballots = [...votes, ...extra, ...abstained].join('，') || '无人投票';
      const outcome = entry.outcome?.kind === 'selected'
        ? `结果：${label(entry.outcome.seat)}`
        : entry.outcome ? '结果：无人当选' : `平票：${entry.tied.map((seat) => `${seat}号`).join('、')}，进入复投`;
      return `${entry.title}投票（${ballots}）${outcome}`;
    }
    case 'judgement':
      return `${label(entry.seat)}：${entry.verdictLabel}。${entry.comment}`;
    case 'seat_eliminated':
      return `${label(entry.seat)}出局（${entry.reason}）`;
    case 'revealed':
      return entry.text;
    case 'game_over':
      return `对局结束：${entry.result.summary}`;
    case 'fallback':
      return null;
  }
}

/**
 * L4：只包含该玩家可见频道的记录（可见性先于压缩）。最近几轮完整保留，更早的轮次省略发言正文、
 * 保留播报 / 投票 / 出局等结构性记录；压缩后仍超过 limit 时只保留最近的部分。
 */
export function formatHistory(game: CompiledGame, s: EngineSnapshot, viewer: Seat, options: HistoryOptions = {}): string {
  const lines = s.log
    .filter((entry) => entryVisibleTo(entry, viewer))
    .flatMap((entry): HistoryLine[] => {
      const text = formatEntry(game, s, entry);
      return text === null ? [] : [{ text, round: entry.round, kind: entry.kind }];
    });
  if (lines.length === 0) return '（对局刚开始，还没有任何记录）';
  const compressed = compressOlderRounds(lines, s.round, options.fullRounds ?? DEFAULT_FULL_ROUNDS);
  const limit = options.limit ?? DEFAULT_HISTORY_LIMIT;
  if (compressed.length <= limit) return compressed.join('\n');
  const omitted = compressed.length - limit;
  return [`（更早的 ${omitted} 条记录已省略）`, ...compressed.slice(-limit)].join('\n');
}
