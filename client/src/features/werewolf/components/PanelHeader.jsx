import React from 'react';

export function PanelHeader({ icon, title }) {
  return <div className="werewolf-panel-title">{icon}<strong>{title}</strong></div>;
}
