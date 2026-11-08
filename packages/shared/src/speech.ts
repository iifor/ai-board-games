import type { StageEvent } from './stage';

/** 朗读内容：文本与发声座位（主持播报为 null） */
export interface SpeechContent {
  readonly text: string;
  readonly seat: number | null;
}

/** 上警、退水选择只在座位上展示，不生成逐人播报。 */
export function isSheriffChoice(event: StageEvent | undefined): event is Extract<StageEvent, { kind: 'action' }> & { readonly phaseId: 'sheriff_signup' | 'sheriff_withdraw' } {
  return event?.view.gameKey === 'werewolf' && event.kind === 'action'
    && (event.phaseId === 'sheriff_signup' || event.phaseId === 'sheriff_withdraw');
}

export function isSheriffSignup(event: StageEvent | undefined): event is Extract<StageEvent, { kind: 'action' }> & { readonly phaseId: 'sheriff_signup' } {
  return isSheriffChoice(event) && event.phaseId === 'sheriff_signup';
}

/**
 * 哪些舞台事件要朗读、读什么：服务端据此合成语音，客户端据此决定是否朗读与朗读文本，两边只认这一处。
 * 评委点评连同判定一起读；行动（开枪、自爆……）与播报、揭示、终局总结由主持人声音读；
 * 阶段标题、计票、出局提示、兜底记录、上警和退水选择只展示不朗读。
 */
export function speechOf(event: StageEvent): SpeechContent | null {
  if (isSheriffChoice(event)) return null;
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
