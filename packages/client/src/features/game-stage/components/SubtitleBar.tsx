import type { AudienceView } from '@battle/shared';
import { Avatar } from '../../../components/Avatar';
import { HOST_POSTER } from '../../../utils/posters';
import { useSegmentState } from '../hooks/useSegmentState';
import { describeEvent } from '../playback/describe';
import type { SegmentControl } from '../playback/segment';
import type { StreamItem } from '../types';
import { KIND_LABELS, seatOf } from '../utils';
import { SubtitleProgress } from './SubtitleProgress';
import './SubtitleBar.css';

interface SubtitleBarProps {
  readonly item: StreamItem | null;
  readonly view: AudienceView | null;
  /** 当前这段的播放控制；有值时显示进度条 */
  readonly control?: SegmentControl | null | undefined;
}

/**
 * 底部字幕栏：说话人头像与名字 + 当前事件的文本 + 播放进度。
 * 外层常驻，是舞台上唯一的礼貌级 live region（读屏只播报字幕）；内层每个事件重新进场
 */
export function SubtitleBar({ item, view, control = null }: SubtitleBarProps) {
  const { progress } = useSegmentState(control);
  const display = item ? describeEvent(item.event) : null;
  if (!item || !display?.text) {
    return <div className="subtitle-bar glass-panel is-idle" aria-live="polite" aria-atomic="true">等待下一段内容…</div>;
  }
  const seat = seatOf(view, display.speaker);
  const name = seat ? seat.name : '主持人';
  const kind = KIND_LABELS[item.event.kind];
  return (
    <div className="subtitle-bar glass-panel" data-kind={item.event.kind} aria-live="polite" aria-atomic="true">
      <div key={item.event.seq} className="subtitle-inner">
        <div className="subtitle-speaker">
          {seat ? <Avatar className="subtitle-avatar" name={seat.name} avatar={seat.avatar} /> : <Avatar className="subtitle-avatar" name={name} src={HOST_POSTER} />}
          <span>
            <small>{seat ? `${kind} · ${seat.seat} 号` : kind}</small>
            <strong>{name}</strong>
          </span>
        </div>
        <div className="subtitle-body">
          <p>{display.text}</p>
          <SubtitleProgress progress={progress} />
        </div>
      </div>
    </div>
  );
}
