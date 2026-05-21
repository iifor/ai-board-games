import React from 'react';
import { DraggableDebatePlayer } from '../DraggableDebatePlayer';
import './index.css';

export function DebatePlayerPool({ players, disabled, onDrop }) {
  return (
    <section
      className="debate-player-pool"
      onDragOver={(event) => !disabled && event.preventDefault()}
      onDrop={onDrop}
    >
      <div className="player-pool-head">
        <strong>观众席（{players.length}名）</strong>
        <span>拖入正方、反方或评委席才会参与本局；从比赛席拖回这里则移出本局。</span>
      </div>
      <div className="player-pool-list">
        {players.map((player) => (
          <DraggableDebatePlayer player={player} key={player.id} />
        ))}
        {!players.length && <em className="player-pool-empty">观众席为空</em>}
      </div>
    </section>
  );
}
