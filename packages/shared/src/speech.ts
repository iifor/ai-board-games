import type { StageEvent } from './stage';

/** 朗读内容：文本与发声座位（主持播报为 null） */
export interface SpeechContent {
  readonly text: string;
  readonly seat: number | null;
}

/**
 * 哪些舞台事件要朗读、读什么：服务端据此合成语音，客户端据此决定是否朗读与朗读文本，两边只认这一处。
 * 评委点评连同判定一起读；行动（开枪、自爆……）与播报、揭示、终局总结由主持人声音读；
 * 阶段标题、计票、出局提示、兜底记录只展示不朗读。
 */
export function speechOf(event: StageEvent): SpeechContent | null {
  switch (event.kind) {
    case 'speech':
      return { text: event.text, seat: event.seat };
    case 'judgement':
      return { text: `${event.verdictLabel}。${event.comment}`, seat: event.seat };
    case 'narration':
    case 'revealed':
    case 'action':
      return { text: event.text, seat: null };
    case 'game_over':
      return { text: event.result.summary, seat: null };
    default:
      return null;
  }
}
