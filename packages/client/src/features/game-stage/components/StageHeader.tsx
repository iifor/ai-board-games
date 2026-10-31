import type { AudienceView, MatchSummaryDto } from '@battle/shared';
import './StageHeader.css';

interface StageHeaderProps {
  readonly summary: MatchSummaryDto;
  readonly view: AudienceView | null;
  readonly connected: boolean;
  readonly ended: boolean;
}

/** 标题、板子、当前阶段与连接状态 */
export function StageHeader({ summary, view, connected, ended }: StageHeaderProps) {
  const connection = ended ? '已结束' : connected ? '已连接' : '连接中…';
  return (
    <header className="stage-header">
      <div>
        <h1>{summary.gameTitle}{summary.variantName ? ` · ${summary.variantName}` : ''}</h1>
        <p>{view?.phase ? `第 ${view.round} 天 · ${view.phase.title}` : view?.status === 'completed' ? '对局已结束' : '准备中'}</p>
      </div>
      <span className={`stage-connection ${connected && !ended ? 'stage-connection-on' : ''}`}>{connection}</span>
    </header>
  );
}
