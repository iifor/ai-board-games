import React from 'react';
import { getDebateSpeakerLabel } from '../../debateUtils';
import './index.css';

export function DebateSubtitle({ speech, players, maxChars = 50 }) {
  const text = formatDebateSubtitle(speech?.text, maxChars);
  if (!text) return <div className="debate-subtitle empty" aria-hidden="true" />;
  const speaker = speech.speakerLabel || (speech.playerId ? getDebateSpeakerLabel(players, speech.playerId) : '主持人');
  return (
    <div className="debate-subtitle" key={speech.id || `${speech.playerId || 'host'}-${text}`}>
      <p>{text}</p>
    </div>
  );
}

function formatDebateSubtitle(value, maxChars = 50) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}
