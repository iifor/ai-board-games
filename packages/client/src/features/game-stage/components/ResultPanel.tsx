import type { AudienceView, GameResult } from '@battle/shared';
import './ResultPanel.css';

/** 终局结果：胜方、摘要与 MVP */
export function ResultPanel({ result, view }: { readonly result: GameResult; readonly view: AudienceView | null }) {
  const mvp = result.mvp === null ? null : view?.seats.find((seat) => seat.seat === result.mvp);
  return (
    <section className="result-panel card" aria-label="对局结果">
      <h2>{result.winnerLabel}</h2>
      <p>{result.summary}</p>
      {mvp ? <p className="result-mvp">MVP：{mvp.label}</p> : null}
    </section>
  );
}
