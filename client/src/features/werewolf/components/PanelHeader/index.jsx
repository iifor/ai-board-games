import React from 'react';
import './index.css';

export function PanelHeader({ icon, title }) {
  return <div className="werewolf-panel-title">{icon}<strong>{title}</strong></div>;
}
