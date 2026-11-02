import type { AudienceView } from '@battle/shared';
import { HOST_POSTER, initialsOf, resolvePoster } from '../../../utils/posters';
import { describeEvent } from '../playback/describe';
import type { StreamItem } from '../types';
import { KIND_LABELS, seatOf } from '../utils';
import './SubtitleBar.css';

interface SubtitleBarProps {
  readonly item: StreamItem | null;
  readonly view: AudienceView | null;
  /** 这段内容预计的播放时长；有值时显示进度条 */
  readonly durationMs?: number | null | undefined;
}

/** 底部字幕栏：说话人头像与名字 + 当前事件的文本 + 预计进度；每个事件进场时从下方滑入 */
export function SubtitleBar({ item, view, durationMs = null }: SubtitleBarProps) {
  if (!item) return <div className="subtitle-bar glass-panel is-idle">等待下一段内容…</div>;
  const { speaker, text } = describeEvent(item.event);
  if (!text) return null;
  const seat = seatOf(view, speaker);
  const poster = seat ? resolvePoster(seat.name, seat.avatar, 'cutout') : HOST_POSTER;
  const name = seat ? seat.name : '主持人';
  const kind = KIND_LABELS[item.event.kind];
  return (
    <div key={item.event.seq} className="subtitle-bar glass-panel" data-kind={item.event.kind} aria-live="polite">
      <div className="subtitle-speaker">
        <span className="subtitle-avatar" aria-hidden="true">{poster ? <img src={poster} alt="" /> : initialsOf(name)}</span>
        <span>
          <small>{seat ? `${kind} · ${seat.seat} 号` : kind}</small>
          <strong>{name}</strong>
        </span>
      </div>
      <div className="subtitle-body">
        <p>{text}</p>
        {durationMs ? <i className="subtitle-progress" aria-hidden="true"><b style={{ animationDuration: `${durationMs}ms` }} /></i> : null}
      </div>
    </div>
  );
}
