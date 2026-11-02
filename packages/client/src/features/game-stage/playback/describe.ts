import { speechOf, type StageEvent } from '@battle/shared';

export interface EventDisplay {
  /** 说话的座位；主持播报为 null */
  readonly speaker: number | null;
  /** 字幕文本；纯状态事件为 null */
  readonly text: string | null;
}

function voteSummary(event: Extract<StageEvent, { kind: 'vote_tallied' }>): string {
  const rows = event.tally.map((row) => `${row.target}号 ${row.votes} 票`).join('，') || '无人投票';
  if (event.outcome === null) return `${event.title}：${rows}，平票，进入复投`;
  if (event.outcome.kind === 'none') return `${event.title}：${rows}，无人当选`;
  return `${event.title}：${rows}，${event.outcome.seat}号当选${event.outcome.byTieBreak ? '（平票随机）' : ''}`;
}

/** 字幕上的说话人：发言、点评、行动都显示当事座位（行动虽由主持人声音读出，字幕仍归到行动者） */
function speakerOf(event: StageEvent): number | null {
  switch (event.kind) {
    case 'speech':
    case 'judgement':
    case 'action':
      return event.seat;
    default:
      return null;
  }
}

/** 不朗读的事件的字幕：计票摘要、出局提示、阶段标题；兜底记录不上字幕 */
function silentText(event: StageEvent): string | null {
  switch (event.kind) {
    case 'vote_tallied':
      return voteSummary(event);
    case 'seat_eliminated':
      return `${event.seat}号出局（${event.reason}）`;
    case 'phase_started':
      return event.title;
    default:
      return null;
  }
}

/**
 * 舞台事件 → 字幕内容。要朗读的事件（由 @battle/shared 的 speechOf 决定，服务端合成语音用的是同一处）
 * 字幕就是朗读文本；其余事件只上字幕不朗读
 */
export function describeEvent(event: StageEvent): EventDisplay {
  const speech = speechOf(event);
  if (speech) return { speaker: speakerOf(event), text: speech.text };
  return { speaker: null, text: silentText(event) };
}

/** 没有音频时的展示时长：按字数估算（不封顶，长发言静音时也要展示完），倍速缩短 */
export function displayDuration(text: string | null, speed: number): number {
  const base = text ? Math.max(900, text.length * 160) : 400;
  return Math.round(base / speed);
}
