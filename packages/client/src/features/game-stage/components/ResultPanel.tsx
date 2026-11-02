import type { AudienceView, GameResult, MatchSummaryDto } from '@battle/shared';
import { Link } from 'react-router';
import { initialsOf, resolvePoster } from '../../../utils/posters';
import { ResultRoster } from './ResultRoster';
import './ResultPanel.css';

interface ResultPanelProps {
  readonly result: GameResult;
  readonly view: AudienceView | null;
  /** 有对局概要时显示"同样阵容再来一局 / 从头回放 / 返回大厅" */
  readonly summary?: MatchSummaryDto | undefined;
  readonly onReplay?: (() => void) | undefined;
}

/** 终局：覆盖整个舞台的结果卡——MVP 立绘、胜方与摘要、阵容揭示、下一步操作 */
export function ResultPanel({ result, view, summary, onReplay }: ResultPanelProps) {
  const mvp = result.mvp === null ? null : view?.seats.find((seat) => seat.seat === result.mvp);
  const poster = mvp ? resolvePoster(mvp.name, mvp.avatar, 'cutout') : null;
  const rematch = summary ? { variant: summary.variantKey, playerIds: summary.seats.flatMap((seat) => (seat.playerId === null ? [] : [seat.playerId])) } : null;
  return (
    <section className="result-panel" aria-label="对局结果">
      <div className={`result-card glass-panel ${mvp ? 'has-mvp' : ''}`}>
        {mvp ? (
          <div className="result-mvp-block">
            <span className="hud-label">MVP</span>
            <span className="result-mvp-avatar" aria-hidden="true">{poster ? <img src={poster} alt="" /> : initialsOf(mvp.name)}</span>
            <p className="result-mvp">MVP：{mvp.label}</p>
            {mvp.roleName ? <span className="result-mvp-role">{mvp.roleName}</span> : null}
          </div>
        ) : null}
        <div className="result-body">
          <span className="hud-label">对局结束</span>
          <h2>{result.winnerLabel}</h2>
          <p>{result.summary}</p>
          {view ? <ResultRoster view={view} result={result} /> : null}
          {summary && rematch ? (
            <div className="result-actions">
              <Link className="button button-primary" to={`/play/${summary.gameKey}`} state={rematch}>同样阵容再来一局</Link>
              {onReplay ? <button type="button" className="button" onClick={onReplay}>从头回放</button> : null}
              <Link className="button" to="/">返回大厅</Link>
            </div>
          ) : null}
        </div>
      </div>
    </section>
  );
}
