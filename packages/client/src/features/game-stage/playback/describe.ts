import type { StageEvent } from '@battle/shared';

export interface EventDisplay {
  /** 说话的座位；主持播报为 null */
  readonly speaker: number | null;
  /** 字幕与朗读的文本；纯状态事件为 null */
  readonly text: string | null;
}

function voteSummary(event: Extract<StageEvent, { kind: 'vote_tallied' }>): string {
  const rows = event.tally.map((row) => `${row.target}号 ${row.votes} 票`).join('，') || '无人投票';
  if (event.outcome === null) return `${event.title}：${rows}，平票，进入复投`;
  if (event.outcome.kind === 'none') return `${event.title}：${rows}，无人当选`;
  return `${event.title}：${rows}，${event.outcome.seat}号当选${event.outcome.byTieBreak ? '（平票随机）' : ''}`;
}

/** 舞台事件 → 字幕内容；与服务端的语音合成选择同样的文本 */
export function describeEvent(event: StageEvent): EventDisplay {
  switch (event.kind) {
    case 'speech':
      return { speaker: event.seat, text: event.text };
    case 'judgement':
      return { speaker: event.seat, text: `${event.verdictLabel}。${event.comment}` };
    case 'narration':
    case 'revealed':
      return { speaker: null, text: event.text };
    case 'action':
      return { speaker: event.seat, text: event.text };
    case 'vote_tallied':
      return { speaker: null, text: voteSummary(event) };
    case 'seat_eliminated':
      return { speaker: null, text: `${event.seat}号出局（${event.reason}）` };
    case 'phase_started':
      return { speaker: null, text: event.title };
    case 'game_over':
      return { speaker: null, text: event.result.summary };
    case 'fallback':
      return { speaker: null, text: null };
  }
}

/** 没有音频时的展示时长：按字数估算（不封顶，长发言静音时也要展示完），倍速缩短 */
export function displayDuration(text: string | null, speed: number): number {
  const base = text ? Math.max(900, text.length * 160) : 400;
  return Math.round(base / speed);
}

/** 需要朗读的事件（阶段标题、计票等只展示不朗读） */
export function shouldSpeak(event: StageEvent): boolean {
  return ['speech', 'judgement', 'narration', 'revealed', 'game_over'].includes(event.kind);
}
