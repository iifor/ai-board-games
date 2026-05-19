import React from 'react';
import { Award, Star } from 'lucide-react';

export function DebateResult({ game }) {
  if (!game.winner && !game.mvp) return null;
  const winnerLabel = game.winner === 'pro' ? '正方胜出' : game.winner === 'con' ? '反方胜出' : '双方平局';
  const winnerTone = game.winner === 'con' ? 'con' : game.winner === 'pro' ? 'pro' : 'draw';
  const mvpName = game.mvp?.nickname || game.mvp?.name || (game.mvp?.id ? `${game.mvp.id}号` : '');
  return (
    <section className={`debate-result ${winnerTone}`}>
      <div className="debate-result-summary">
        {game.winner && (
          <div className="result-winner">
            <Award size={30} />
            <strong>{winnerLabel}</strong>
          </div>
        )}
        {game.mvp && (
          <div className="result-mvp">
            <Star size={26} />
            <span>最佳辩手</span>
            <strong>{mvpName}</strong>
          </div>
        )}
      </div>
    </section>
  );
}
