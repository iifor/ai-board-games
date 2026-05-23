import React from 'react';
import { MonitorSpeaker, X } from 'lucide-react';
import { classNames } from '../../../utils/classNames';
import './index.css';

export function HostSeat({ hostPlayer, players, onSelect, onRemove, disabled = false }) {
  function handleDragOver(event) {
    if (disabled) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }

  function handleDrop(event) {
    if (disabled) return;
    event.preventDefault();
    const id = Number(event.dataTransfer.getData('text/plain'));
    if (!id) return;
    const player = players.find((p) => Number(p.id) === id);
    if (player) onSelect?.(player.id);
  }

  return (
    <section
      className={classNames('host-seat', hostPlayer && 'occupied', disabled && 'locked')}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <div className="host-seat-label">
        <MonitorSpeaker size={16} />
        <span>主持人席位</span>
      </div>
      {hostPlayer ? (
        <div className="host-seat-card">
          <span className="host-seat-badge">{hostPlayer.id}</span>
          <strong>{hostPlayer.nickname || hostPlayer.name || `${hostPlayer.id}号`}</strong>
          <small>{hostPlayer.model || ''}</small>
          {!disabled && (
            <button type="button" className="host-seat-remove" onClick={() => onRemove?.()} title="移除主持人">
              <X size={16} />
            </button>
          )}
        </div>
      ) : (
        <div className="host-seat-placeholder">
          <MonitorSpeaker size={20} />
          <span>拖入玩家设为「主持人」</span>
          <small>使用该玩家的模型播报，不拖入则使用系统默认</small>
        </div>
      )}
    </section>
  );
}
