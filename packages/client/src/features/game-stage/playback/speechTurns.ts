import { isPlayerSpeech, speechOf, stripSpeechTags, type PlayerSpeech } from '@battle/shared';
import type { StageEvent } from '@battle/shared';
import type { StreamItem } from '../types';
import { seatOf, speakerLabel } from '../utils';

export { isPlayerSpeech, type PlayerSpeech } from '@battle/shared';

/** 关键操作时说给观众的心里话（观战频道），署名后标明，和公开发言区分开 */
export function withAsideTag(label: string, event: StageEvent): string {
  return event.kind === 'speech' && event.purpose === 'aside' ? `${label} · 心里话` : label;
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
  const text = stripSpeechTags(speechOf(event)!.text);
  const speaker = `${event.seat}号 ${name}`;
  if (event.kind === 'speech' && event.purpose === 'aside') return { prefix: '', speaker: withAsideTag(speakerLabel(event.seat, name), event), body: ` ${text}` };
  // 脚本回放的台词已写入署名，保留原文和判定，只给内嵌的座号、名字着色。
  const debugPrefix = event.kind === 'judgement' ? `${event.verdictLabel}。【调试】` : '【调试】';
  if (name) {
    for (const prefix of [debugPrefix, '']) {
      if (text.startsWith(prefix + speaker)) {
        return { prefix, speaker, body: text.slice(prefix.length + speaker.length) };
      }
    }
  }
  return { prefix: '', speaker: speakerLabel(event.seat, name), body: ` ${text}` };
}
