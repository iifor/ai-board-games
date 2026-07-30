import { Crown, GripVertical } from 'lucide-react';
import { classNames } from '../../../../utils/classNames';
import './index.css';
import type { Player } from '../../../../types';

interface DraggableDebatePlayerProps {
  player: Player;
  compact?: boolean;
  tone?: string;
  isCaptain?: boolean;
  onCaptainDrop?: (side: string, playerId: number) => void;
  disabled?: boolean;
  selected?: boolean;
  onClick?: () => void;
}

export function DraggableDebatePlayer({ player, compact = false, tone = '', isCaptain = false, onCaptainDrop, disabled = false, selected = false, onClick }: DraggableDebatePlayerProps) {
  const name = player.nickname || player.name || `${player.id}号`;
  const allowCaptainDrop = tone === 'pro' || tone === 'con';
  return (
    <button
      type="button"
      className={classNames('drag-player-card', compact && 'compact', isCaptain && 'captain', selected && 'selected', disabled && 'locked')}
      draggable={!disabled}
      disabled={disabled}
      aria-pressed={selected}
      onClick={onClick}
      onDragOver={(event) => {
        if (disabled) return;
        if (!allowCaptainDrop) return;
        const value = event.dataTransfer.types.includes('text/plain') ? event.dataTransfer.getData('text/plain') : '';
        if (!value || value === `captain:${tone}`) event.preventDefault();
      }}
      onDrop={(event) => {
        if (disabled) return;
        const value = event.dataTransfer.getData('text/plain');
        if (value !== `captain:${tone}`) return;
        event.preventDefault();
        event.stopPropagation();
        onCaptainDrop?.(tone, player.id);
      }}
      onDragStart={(event) => {
        if (disabled) return;
        event.dataTransfer.setData('text/plain', String(player.id));
        event.dataTransfer.effectAllowed = 'move';
      }}
    >
      <span className="drag-player-avatar">{name.slice(0, 1)}</span>
      <strong>{name}</strong>
      {isCaptain && <span className="drag-captain-badge"><Crown size={14} />队长</span>}
      <GripVertical size={18} />
    </button>
  );
}
