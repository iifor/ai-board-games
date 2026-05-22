import React from 'react';
import './index.css';

export function NightOverlay({ active }) {
  if (!active) return null;

  return (
    <div className="werewolf-night-overlay" aria-hidden="true">
      <span />
      <span />
    </div>
  );
}
