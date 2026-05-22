import React, { useEffect, useRef, useState } from 'react';
import { getDebateSpeakerLabel } from '../../debateUtils';
import './index.css';

const LOOKAHEAD = 4;

export function DebateSubtitle({ speech, players, maxChars = 50 }) {
  const [elapsed, setElapsed] = useState(0);
  const startTimeRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!speech?.wordBoundaries?.length) return;

    startTimeRef.current = performance.now();
    setElapsed(0);

    const tick = () => {
      setElapsed(performance.now() - startTimeRef.current);
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [speech?.id, speech?.wordBoundaries]);

  const text = formatDebateSubtitle(speech?.text, maxChars);
  if (!text) return <div className="debate-subtitle empty" aria-hidden="true" />;

  const speaker = speech.speakerLabel || (speech.playerId ? getDebateSpeakerLabel(players, speech.playerId) : '主持人');
  const boundaries = speech?.wordBoundaries;

  if (boundaries?.length) {
    const currentIndex = findCurrentBoundaryIndex(boundaries, elapsed);
    const start = currentIndex;
    const end = Math.min(boundaries.length, start + LOOKAHEAD + 1);
    const visible = boundaries.slice(start, end);

    return (
      <div className="debate-subtitle" key={speech.id}>
        <p>
          {visible.map((wb, i) => {
            const globalIndex = start + i;
            const isActive = globalIndex === currentIndex;
            return (
              <span
                key={globalIndex}
                className={`debate-subtitle__word${isActive ? ' is-active' : ' is-next'}`}
              >
                {wb.text}
              </span>
            );
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="debate-subtitle" key={speech.id || `${speech.playerId || 'host'}-${text}`}>
      <p>
        <strong>{speaker}</strong>
        <span>{text}</span>
      </p>
    </div>
  );
}

function formatDebateSubtitle(value, maxChars = 50) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  return text.length > maxChars ? `${text.slice(0, maxChars)}...` : text;
}

function findCurrentBoundaryIndex(boundaries, elapsedMs) {
  let latest = 0;
  for (let i = 0; i < boundaries.length; i++) {
    if (boundaries[i].offset <= elapsedMs) latest = i;
    else break;
  }
  return latest;
}
