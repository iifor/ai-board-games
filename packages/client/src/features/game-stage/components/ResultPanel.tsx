import type { AudienceView, GameResult } from '@battle/shared';
import { initialsOf, resolvePoster } from '../../../utils/posters';
import './ResultPanel.css';

/** 终局：覆盖整个舞台的结果卡，胜方、摘要与 MVP 立绘 */
export function ResultPanel({ result, view }: { readonly result: GameResult; readonly view: AudienceView | null }) {
  const mvp = result.mvp === null ? null : view?.seats.find((seat) => seat.seat === result.mvp);
  const poster = mvp ? resolvePoster(mvp.name, mvp.avatar, 'cutout') : null;
  return (
    <section className="result-panel" aria-label="对局结果">
      <div className="result-card glass-panel">
        <span className="hud-label">对局结束</span>
        <h2>{result.winnerLabel}</h2>
        <p>{result.summary}</p>
        {mvp ? (
          <div className="result-mvp-block">
            <span className="result-mvp-avatar" aria-hidden="true">{poster ? <img src={poster} alt="" /> : initialsOf(mvp.name)}</span>
            <p className="result-mvp">MVP：{mvp.label}</p>
          </div>
        ) : null}
      </div>
    </section>
  );
}
