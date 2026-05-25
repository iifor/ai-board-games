import type { ReactNode } from 'react';
import './index.css';

interface PanelHeaderProps {
  icon: ReactNode;
  title: string;
}

export function PanelHeader({ icon, title }: PanelHeaderProps) {
  return <div className="werewolf-panel-title">{icon}<strong>{title}</strong></div>;
}
