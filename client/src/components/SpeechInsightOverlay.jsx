import React from 'react';

export function SpeechInsightOverlay({ speech, players = [] }) {
  const playerId = speech?.playerId;
  const fullText = String(speech?.fullText || speech?.text || '').trim();
  const thinking = String(speech?.thinking || speech?.reasoning || '').trim();
  if (!playerId || !fullText) return null;
  const player = players.find((item) => Number(item.id) === Number(playerId));
  const name = player?.nickname || player?.name || `${playerId}号`;
  return (
    <aside className="speech-insight-overlay" aria-live="polite">
      <div className="speech-insight-card">
        <strong>{name}</strong>
        <p>{fullText}</p>
        {thinking && (
          <details open>
            <summary>思考</summary>
            <p>{thinking}</p>
          </details>
        )}
      </div>
    </aside>
  );
}
