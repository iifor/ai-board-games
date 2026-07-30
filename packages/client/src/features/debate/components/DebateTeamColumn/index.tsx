import React from 'react';
import { Shield, Users } from 'lucide-react';
import { classNames } from '../../../../utils/classNames';
import { CaptainDragToken } from '../CaptainDragToken';
import { DraggableDebatePlayer } from '../DraggableDebatePlayer';
import './index.css';
import type { Player } from '../../../../types';

interface DebateTeamColumnProps {
  title: string;
  tone: 'pro' | 'con' | 'judge';
  ids: (number | null)[];
  slots: number;
  labelPrefix: string;
  getPlayer: (id: number | null) => Player | undefined;
  captainId?: number | null;
  onCaptainDrop?: (side: string, playerId: number) => void;
  onDrop: (event: React.DragEvent, side: string, index: number) => void;
  disabled?: boolean;
  captainEnabled?: boolean;
  selectedPlayerId?: number | null;
  onPlayerSelect?: (id: number) => void;
  onSlotClick?: (side: string, index: number) => void;
}

export function DebateTeamColumn({ title, tone, ids, slots, labelPrefix, getPlayer, captainId, onCaptainDrop, onDrop, disabled = false, captainEnabled = true, selectedPlayerId = null, onPlayerSelect, onSlotClick }: DebateTeamColumnProps) {
  const Icon = tone === 'judge' ? Users : Shield;
  return (
    <div className={`debate-team-column ${tone}`}>
      <h3>
        <Icon size={22} />
        {title}
        {tone !== 'judge' && captainEnabled && <CaptainDragToken tone={tone} disabled={disabled} />}
      </h3>
      <div className="team-slot-list">
        {Array.from({ length: slots > 4 ? 4 : slots }).map((_, index) => {
          const player = getPlayer(ids[index]);
          return (
            <div
              className={classNames('team-drop-slot', player && 'filled', disabled && 'locked')}
              key={`${tone}-${index}`}
              onDragOver={(event) => {
                if (!disabled) event.preventDefault();
              }}
              onDrop={(event) => !disabled && onDrop(event, tone, index)}
            >
              <span className="team-slot-label">{labelPrefix} {index + 1}{tone === 'judge' ? '' : '辩'}</span>
              {player ? (
                <DraggableDebatePlayer
                  player={player}
                  compact
                  tone={tone}
                  isCaptain={captainEnabled && Number(captainId) === Number(player.id)}
                  onCaptainDrop={onCaptainDrop}
                  disabled={disabled}
                  selected={Number(selectedPlayerId) === Number(player.id)}
                  onClick={() => {
                    if (selectedPlayerId && Number(selectedPlayerId) !== Number(player.id)) {
                      onSlotClick?.(tone, index);
                      return;
                    }
                    onPlayerSelect?.(player.id);
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="team-slot-empty"
                  disabled={disabled || !selectedPlayerId}
                  onClick={() => onSlotClick?.(tone, index)}
                >
                  {selectedPlayerId ? '+ 安排到此处' : '+ 先选择选手'}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
