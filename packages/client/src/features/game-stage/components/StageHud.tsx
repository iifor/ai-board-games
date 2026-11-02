import type { AudienceView, MatchSummaryDto } from '@battle/shared';
import { roundLabel } from '../utils';
import './StageHud.css';

interface StageHudProps {
  readonly summary: MatchSummaryDto;
  readonly view: AudienceView | null;
  readonly connected: boolean;
  readonly ended: boolean;
}

/** 顶部直播条：游戏与板子、LIVE 状态、当前阶段 */
export function StageHud({ summary, view, connected, ended }: StageHudProps) {
  const live = connected && !ended;
  const status = view?.phase ? `${roundLabel(view)} · ${view.phase.title}` : view?.status === 'completed' ? '对局已结束' : '准备中';
  return (
    <header className="stage-hud glass-panel" aria-label="对局状态">
      <div className="stage-hud-identity">
        <span className="hud-label">{summary.variantName ?? '对局'}</span>
        <strong>{summary.gameTitle}</strong>
      </div>
      <div className={`stage-hud-live ${ended ? 'is-ended' : live ? 'is-live' : ''}`}>
        <i aria-hidden="true" />
        <b>{ended ? '已结束' : live ? 'LIVE' : '连接中'}</b>
      </div>
      <p key={status} className="stage-hud-status">{status}</p>
    </header>
  );
}
