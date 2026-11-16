import type { AudienceView, MatchSummaryDto, StageEvent } from '@battle/shared';
import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { liveBadge, matchMode, stageStatus } from '../../hudStatus';
import type { StreamConnection } from '../../types';
import './MobileTopBar.css';

interface MobileTopBarProps {
  readonly summary: MatchSummaryDto;
  readonly view: AudienceView | null;
  readonly event: StageEvent | undefined;
  readonly connection: StreamConnection;
  readonly ended: boolean;
  readonly replay: boolean;
  /** "更多"菜单里的内容（观战视角切换） */
  readonly children?: ReactNode;
}

/** 手机顶栏：返回、游戏与板子、直播状态、更多菜单；下一行是当前阶段 */
export function MobileTopBar({ summary, view, event, connection, ended, replay, children }: MobileTopBarProps) {
  const live = liveBadge(connection, ended, replay);
  const mode = matchMode(summary, view);
  const status = stageStatus(view, event);
  return (
    <header className="mobile-topbar" aria-label="对局状态">
      <Link className="mobile-topbar-back" to="/" aria-label="返回大厅">←</Link>
      <div className="mobile-topbar-title">
        <strong>{summary.importTitle ?? summary.gameTitle}</strong>
        {mode ? <small>{mode}</small> : null}
      </div>
      <span className={`mobile-topbar-live ${live.className}`}><i aria-hidden="true" />{ended && summary.importTitle ? '回放结束' : live.label}</span>
      {children ? (
        <details className="mobile-topbar-more">
          <summary aria-label="更多">⋯</summary>
          <div className="mobile-topbar-menu">{children}</div>
        </details>
      ) : null}
      <p key={status} className="mobile-topbar-status">{status}</p>
    </header>
  );
}
