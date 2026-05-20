import React from 'react';
import { Crown, GripVertical } from 'lucide-react';
import { classNames } from '../../../utils/classNames';
import './DraggableDebatePlayer.css';

export function DraggableDebatePlayer({ player, compact = false, tone = '', isCaptain = false, onCaptainDrop, disabled = false }) {
  const name = player.nickname || player.name || `${player.id}号`;
  const allowCaptainDrop = tone === 'pro' || tone === 'con';
  return (
    <div
      className={classNames('drag-player-card', compact && 'compact', isCaptain && 'captain', disabled && 'locked')}
      draggable={!disabled}
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
    </div>
  );
}
