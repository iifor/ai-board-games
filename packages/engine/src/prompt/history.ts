import type { CompiledGame } from '../compiler/compile';
import { seatLabel } from '../runtime/labels';
import type { EngineSnapshot, LogEntry, Seat } from '../runtime/types';
import { entryVisibleTo } from '../visibility/channels';

export const DEFAULT_HISTORY_LIMIT = 120;

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

/** L4：只包含该玩家可见频道的记录，过长时保留最近的部分 */
export function formatHistory(
  game: CompiledGame,
  s: EngineSnapshot,
  viewer: Seat,
  limit = DEFAULT_HISTORY_LIMIT,
): string {
  const lines = s.log
    .filter((entry) => entryVisibleTo(entry, viewer))
    .map((entry) => formatEntry(game, s, entry))
    .filter((line): line is string => line !== null);
  if (lines.length === 0) return '（对局刚开始，还没有任何记录）';
  if (lines.length <= limit) return lines.join('\n');
  const omitted = lines.length - limit;
  return [`（更早的 ${omitted} 条记录已省略）`, ...lines.slice(-limit)].join('\n');
}
