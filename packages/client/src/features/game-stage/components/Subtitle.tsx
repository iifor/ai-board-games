import type { AudienceView } from '@battle/shared';
import { describeEvent } from '../playback/describe';
import type { StreamItem } from '../types';
import './Subtitle.css';

interface SubtitleProps {
  readonly item: StreamItem | null;
  readonly view: AudienceView | null;
}

/** 当前播放事件的字幕：说话人 + 文本 */
export function Subtitle({ item, view }: SubtitleProps) {
  if (!item) return <div className="subtitle subtitle-idle">等待下一段内容…</div>;
  const { speaker, text } = describeEvent(item.event);
  const seat = speaker === null ? null : view?.seats.find((candidate) => candidate.seat === speaker);
  return (
    <div className="subtitle" aria-live="polite">
      <span className="subtitle-speaker">{seat ? seat.label : '主持人'}</span>
      <p>{text}</p>
    </div>
  );
}
