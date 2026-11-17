import type { AudienceView, MatchSummaryDto } from '@battle/shared';
import type { StreamConnection } from '../types';
import { liveBadge, matchMode, stageStatus } from '../hudStatus';
import './StageHud.css';

interface StageHudProps {
  readonly summary: MatchSummaryDto;
  readonly view: AudienceView | null;
  readonly connection: StreamConnection;
  readonly ended: boolean;
  readonly replay?: boolean;
}

/** 顶部直播条：游戏与板子、LIVE 状态、当前进度（狼人杀只报昼夜） */
export function StageHud({ summary, view, connection, ended, replay = summary.status === 'completed' }: StageHudProps) {
  const live = liveBadge(connection, ended, replay);
  const mode = matchMode(summary, view);
  const status = stageStatus(view);
  return (
    <header className="stage-hud glass-panel" aria-label="对局状态">
      <div className="stage-hud-identity">
        {mode && <span className="hud-label">{mode}</span>}
        <strong>{summary.importTitle ?? summary.gameTitle}</strong>
      </div>
      <div className={`stage-hud-live ${live.className}`}>
        <i aria-hidden="true" />
        <b>{ended && summary.importTitle ? '回放结束' : live.label}</b>
      </div>
      <p key={status} className="stage-hud-status">{status}</p>
    </header>
  );
}
