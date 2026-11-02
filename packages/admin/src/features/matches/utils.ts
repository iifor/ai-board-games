import type { MatchDetailDto, MatchStatus } from '@battle/shared';
import type { LogEntryDto } from '../../services/matches';

export const STATUS_LABELS: Readonly<Record<MatchStatus, { label: string; color: string }>> = {
  created: { label: '已创建', color: 'default' },
  running: { label: '运行中', color: 'processing' },
  waiting_ai: { label: '等待 AI', color: 'processing' },
  paused: { label: '已暂停', color: 'warning' },
  completed: { label: '已结束', color: 'success' },
  failed: { label: '失败', color: 'error' },
};

export function channelColor(channel: string): string {
  if (channel === 'public') return 'blue';
  if (channel === 'host') return 'red';
  if (channel.startsWith('team:')) return 'purple';
  return 'gold';
}

/** 日志条目的可读内容（后台视角，包含兜底等运营信息） */
export function describeLog(entry: LogEntryDto): string {
  switch (entry.kind) {
    case 'phase_started':
      return `【${entry.title}】`;
    case 'narration':
    case 'revealed':
      return entry.text;
    case 'speech':
      return `${entry.seat}号：${entry.text}`;
    case 'action':
      return `${entry.seat}号 ${entry.text}`;
    case 'vote_tallied': {
      const ballots = entry.ballots.map((ballot) => `${ballot.voter}→${ballot.target}${ballot.weight !== 1 ? `(×${ballot.weight})` : ''}`).join(' ');
      const outcome = entry.outcome === null ? '平票复投' : entry.outcome.kind === 'selected' ? `${entry.outcome.seat}号当选` : '无人当选';
      return `${entry.title}：${ballots || '无人投票'}${entry.abstained.length ? `；弃票 ${entry.abstained.join('、')}` : ''} → ${outcome}`;
    }
    case 'judgement':
      return `${entry.seat}号 ${entry.verdictLabel}：${entry.comment}`;
    case 'seat_eliminated':
      return `${entry.seat}号出局（${entry.reason}）`;
    case 'fallback':
      return `${entry.seat}号兜底：${entry.reason}`;
    case 'game_over':
      return `终局：${entry.result.summary}`;
  }
}

export function isTerminal(status: MatchStatus): boolean {
  return status === 'completed' || status === 'failed';
}

/** 详情里标记"对局有没有往前走"的字段：事件进度与状态 */
export interface ProgressMarker {
  readonly lastSeq: number;
  readonly status: MatchStatus;
}

export const progressMarkerOf = (detail: MatchDetailDto): ProgressMarker => ({ lastSeq: detail.lastSeq, status: detail.status });

/** 事件进度或状态变了，才值得重新拉完整日志与 AI 调用（两者带着六层提示词与原始回复，体积大） */
export function progressChanged(prev: ProgressMarker | null, next: ProgressMarker): boolean {
  return prev === null || prev.lastSeq !== next.lastSeq || prev.status !== next.status;
}
