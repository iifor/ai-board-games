import React, { useEffect, useRef, useState } from 'react';
import './index.css';

const LOOKAHEAD = 4;

export function SpeechSubtitle({ speech }) {
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

  if (!speech?.text) return null;

  const boundaries = speech.wordBoundaries;

  if (boundaries?.length) {
    const currentIndex = findCurrentBoundaryIndex(boundaries, elapsed);
    const start = currentIndex;
    const end = Math.min(boundaries.length, start + LOOKAHEAD + 1);
    const visible = boundaries.slice(start, end);

    return (
      <aside className="speech-subtitle" aria-live="polite">
        {visible.map((wb, i) => {
          const globalIndex = start + i;
          const isActive = globalIndex === currentIndex;
          return (
            <span
              key={globalIndex}
              className={`speech-subtitle__word${isActive ? ' is-active' : ' is-next'}`}
            >
              {wb.text}
            </span>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="speech-subtitle speech-subtitle--fallback" aria-live="polite">
      {speech.text}
    </aside>
  );
}

function findCurrentBoundaryIndex(boundaries, elapsedMs) {
  let latest = 0;
  for (let i = 0; i < boundaries.length; i++) {
    if (boundaries[i].offset <= elapsedMs) latest = i;
    else break;
  }
  return latest;
}
