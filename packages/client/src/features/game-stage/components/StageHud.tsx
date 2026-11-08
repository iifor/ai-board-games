import type { AudienceView, MatchSummaryDto } from '@battle/shared';
import type { StreamConnection } from '../types';
import { roundLabel } from '../utils';
import './StageHud.css';

interface StageHudProps {
  readonly summary: MatchSummaryDto;
  readonly view: AudienceView | null;
  readonly connection: StreamConnection;
  readonly ended: boolean;
  readonly replay?: boolean;
}

/** LIVE 标记的文字与修饰类：已结束 > 连上 > 自动重连已放弃 > 连接中 */
function liveBadge(connection: StreamConnection, ended: boolean, replay: boolean): { readonly label: string; readonly className: string } {
  if (ended) return { label: '已结束', className: 'is-ended' };
  if (connection === 'open' || (connection === 'closed' && replay)) return replay ? { label: '回放', className: 'is-replay' } : { label: 'LIVE', className: 'is-live' };
  if (connection === 'lost') return { label: '连接中断', className: 'is-lost' };
  return { label: '连接中', className: '' };
}

/** 顶部直播条：游戏与板子、LIVE 状态、当前阶段 */
export function StageHud({ summary, view, connection, ended, replay = summary.status === 'completed' }: StageHudProps) {
  const live = liveBadge(connection, ended, replay);
  const phase = view?.phase;
  const mode = summary.variantName ?? (typeof view?.extra.board === 'string' ? view.extra.board : null);
  const title = phase?.title === phase?.id && /^[a-z_]+$/.test(phase?.id ?? '') ? '技能结算' : phase?.title;
  const status = view && title ? `${roundLabel(view)} · ${title}` : view?.status === 'completed' ? '对局已结束' : '准备中';
  return (
    <header className="stage-hud glass-panel" aria-label="对局状态">
      <div className="stage-hud-identity">
        {mode && <span className="hud-label">{mode}</span>}
        <strong>{summary.gameTitle}</strong>
      </div>
      <div className={`stage-hud-live ${live.className}`}>
        <i aria-hidden="true" />
        <b>{live.label}</b>
      </div>
      <p key={status} className="stage-hud-status">{status}</p>
    </header>
  );
}
