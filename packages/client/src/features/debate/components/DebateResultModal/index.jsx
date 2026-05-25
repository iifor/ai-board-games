import React, { useEffect, useMemo, useState } from 'react';
import { createDebateResultPoster, downloadResultPoster } from '../../debatePoster';
import { getShareReport } from '../../debateUtils';
import './index.css';

export function DebateResultModal({ game, onNextGame, onReplay }) {
  const report = useMemo(() => getShareReport(game), [game]);
  const [posterUrl, setPosterUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    setPosterUrl('');
    createDebateResultPoster(report)
      .then((url) => {
        if (!cancelled && url) setPosterUrl(url);
      })
      .catch(() => {
        if (!cancelled) setPosterUrl('');
      });
    return () => {
      cancelled = true;
    };
  }, [report]);

  return (
    <div className="debate-result-modal-backdrop" role="presentation">
      <section className="debate-result-modal share-report-modal" role="dialog" aria-modal="true" aria-label="本局比赛结束">
        {posterUrl
          ? <img className="debate-result-poster" src={posterUrl} alt="本局比赛结束战报海报" />
          : <div className="debate-result-poster debate-result-poster-loading" aria-label="正在生成战报海报" />}

        <footer>
          <button type="button" onClick={onReplay}>复盘</button>
          <button type="button" onClick={() => downloadResultPoster(posterUrl, report)} disabled={!posterUrl}>下载海报</button>
          <button type="button" className="primary" onClick={onNextGame}>下一局</button>
        </footer>
      </section>
    </div>
  );
}
