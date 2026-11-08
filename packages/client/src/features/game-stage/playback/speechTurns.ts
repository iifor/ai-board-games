import { speechOf, type StageEvent } from '@battle/shared';
import type { StreamItem } from '../types';
import { seatOf } from '../utils';

export type PlayerSpeech = Extract<StageEvent, { kind: 'speech' | 'judgement' }>;

export function isPlayerSpeech(event: StageEvent | undefined): event is PlayerSpeech {
  return event?.kind === 'speech' || event?.kind === 'judgement';
}

/** 只接受该视角已经播完的段落；暂停时正在展示的那一条也可能已在 played 中。 */
export function speechHistory(played: readonly StreamItem[], beforeSeq: number): PlayerSpeech[] {
  const history: PlayerSpeech[] = [];
  for (const { event } of played) {
    if (event.seq < beforeSeq && isPlayerSpeech(event)) history.push(event);
  }
  return history;
}

export function speechLineParts(event: PlayerSpeech) {
  const name = seatOf(event.view, event.seat)?.name;
  const text = speechOf(event)!.text;
  const speaker = `${event.seat}号 ${name}`;
  // 脚本回放的台词已写入署名，保留原文和判定，只给内嵌的座号、名字着色。
  const debugPrefix = event.kind === 'judgement' ? `${event.verdictLabel}。【调试】` : '【调试】';
  if (name) {
    for (const prefix of [debugPrefix, '']) {
      if (text.startsWith(prefix + speaker)) {
        return { prefix, speaker, body: text.slice(prefix.length + speaker.length) };
      }
    }
  }
  return { prefix: '', speaker: name ? `${event.seat} 号 · ${name}` : `${event.seat} 号`, body: ` ${text}` };
}
