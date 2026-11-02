import type { StreamItem } from '../types';
import './PhaseBanner.css';

/** 进入新阶段时横扫而过的大标题 */
export function PhaseBanner({ item }: { readonly item: StreamItem | null }) {
  const event = item?.event;
  if (!event || event.kind !== 'phase_started') return null;
  const unit = event.view.gameKey === 'werewolf' ? '天' : '轮';
  return (
    <div key={event.seq} className="phase-banner" role="status">
      <span className="hud-label">第 {event.round} {unit}</span>
      <strong>{event.title}</strong>
    </div>
  );
}
