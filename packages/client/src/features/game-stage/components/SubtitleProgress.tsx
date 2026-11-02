import { progressFraction, type SegmentProgress } from '../playback/segment';
import './SubtitleProgress.css';

/**
 * 字幕进度条：音频在播时跟随音频元素报告的实际进度；否则按停留时长线性走完（与停留计时器同一口径）。
 * timed 进度用 CSS 动画推进：总时长 = 剩余时长 / 剩余比例，负延迟跳到已完成的位置，倍速改变时重新起算
 */
export function SubtitleProgress({ progress }: { readonly progress: SegmentProgress | null }) {
  if (!progress) return null;
  if (progress.kind === 'measured') {
    return <i className="subtitle-progress is-measured" aria-hidden="true"><b style={{ width: `${progressFraction(progress, 0) * 100}%` }} /></i>;
  }
  const total = progress.fraction >= 1 ? 0 : progress.remainingMs / (1 - progress.fraction);
  const offset = progress.fraction * total;
  return (
    <i className="subtitle-progress is-timed" aria-hidden="true">
      <b key={progress.startedAt} style={{ animationDuration: `${Math.round(total)}ms`, animationDelay: `-${Math.round(offset)}ms` }} />
    </i>
  );
}
