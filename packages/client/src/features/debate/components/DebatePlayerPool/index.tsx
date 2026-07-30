import React from 'react';
import { DraggableDebatePlayer } from '../DraggableDebatePlayer';
import './index.css';
import type { Player } from '../../../../types';

interface DebatePlayerPoolProps {
  players: Player[];
  disabled: boolean;
  onDrop: (event: React.DragEvent) => void;
  selectedPlayerId?: number | null;
  onPlayerSelect?: (id: number) => void;
  canReturnSelected?: boolean;
  onReturnSelected?: () => void;
}

export function DebatePlayerPool({ players, disabled, onDrop, selectedPlayerId = null, onPlayerSelect, canReturnSelected = false, onReturnSelected }: DebatePlayerPoolProps) {
  return (
    <section
      className="debate-player-pool"
      onDragOver={(event) => !disabled && event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="player-pool-head">
        <strong>观众席（{players.length}名）</strong>
        <span>点击选手再点辩位，或直接拖拽；从比赛席移回这里则退出本局。</span>
        <button type="button" className="player-pool-return" disabled={disabled || !canReturnSelected} onClick={onReturnSelected}>
          移回观众席
        </button>
      </div>
      <div className="player-pool-list">
        {players.map((player) => (
          <DraggableDebatePlayer
            player={player}
            key={player.id}
            disabled={disabled}
            selected={Number(selectedPlayerId) === Number(player.id)}
            onClick={() => onPlayerSelect?.(player.id)}
          />
        ))}
        {!players.length && <em className="player-pool-empty">观众席为空</em>}
      </div>
    </section>
  );
}
