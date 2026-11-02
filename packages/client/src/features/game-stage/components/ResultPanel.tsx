import type { AudienceView, GameResult, MatchSummaryDto } from '@battle/shared';
import { useRef } from 'react';
import { Link } from 'react-router';
import { Avatar } from '../../../components/Avatar';
import { useDialogFocus } from '../../../hooks/useDialogFocus';
import { rematchStateOf } from '../../lobby';
import { ResultRoster } from './ResultRoster';
import './ResultPanel.css';

interface ResultPanelProps {
  readonly result: GameResult;
  readonly view: AudienceView | null;
  /** 有对局概要时显示"同样阵容再来一局 / 从头回放 / 返回大厅" */
  readonly summary?: MatchSummaryDto | undefined;
  readonly onReplay?: (() => void) | undefined;
  /** 关闭结果卡（关闭按钮或 Escape）；关闭后舞台保持终局状态，可再打开 */
  readonly onClose?: (() => void) | undefined;
}

/** 终局：覆盖整个舞台的结果对话框——MVP 立绘、胜方与摘要、阵容揭示、下一步操作；打开时焦点移入，关闭时焦点还回 */
export function ResultPanel({ result, view, summary, onReplay, onClose }: ResultPanelProps) {
  const dialogRef = useRef<HTMLElement | null>(null);
  useDialogFocus(dialogRef, onClose);
  const mvp = result.mvp === null ? null : view?.seats.find((seat) => seat.seat === result.mvp);
  return (
    <section ref={dialogRef} className="result-panel" role="dialog" aria-modal="true" aria-labelledby="result-winner" tabIndex={-1}>
      <div className={`result-card glass-panel ${mvp ? 'has-mvp' : ''}`}>
        {onClose ? <button type="button" className="result-close" aria-label="关闭结果" onClick={onClose}>×</button> : null}
        {mvp ? (
          <div className="result-mvp-block">
            <span className="hud-label">MVP</span>
            <Avatar className="result-mvp-avatar" shape="figure" name={mvp.name} avatar={mvp.avatar} />
            <p className="result-mvp">MVP：{mvp.label}</p>
            {mvp.roleName ? <span className="ui-pill ui-pill-brand">{mvp.roleName}</span> : null}
          </div>
        ) : null}
        <div className="result-body">
          <span className="hud-label">对局结束</span>
          <h2 id="result-winner">{result.winnerLabel}</h2>
          <p>{result.summary}</p>
          {view ? <ResultRoster view={view} result={result} /> : null}
          {summary ? (
            <div className="result-actions">
              <Link className="button button-primary" to={`/play/${summary.gameKey}`} state={rematchStateOf(summary)}>同样阵容再来一局</Link>
              {onReplay ? <button type="button" className="button" onClick={onReplay}>从头回放</button> : null}
              <Link className="button" to="/">返回大厅</Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
