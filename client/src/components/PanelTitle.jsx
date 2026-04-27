import React from 'react';
import { classNames } from '../utils/gameState';

export function PanelTitle({ title, large = false, compact = false }) {
  return (
    <div className={classNames('panel-title', large && 'large', compact && 'compact')}>
      <i />
      <h2>{title}</h2>
      <i />
    </div>
  );
}
