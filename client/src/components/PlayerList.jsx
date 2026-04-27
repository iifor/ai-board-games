import React from 'react';
import { ShieldQuestion } from 'lucide-react';
import { classNames } from '../utils/gameState';
import { PanelTitle } from './PanelTitle';

export function PlayerList({ players, round, showRoles, currentSpeakerId }) {
  return (
    <aside className="left-panel framed-panel">
      <PanelTitle title={`玩家列表（${players.length}人）`} />
      <div className="player-list">
        {players.map((player) => {
          const vote = round.votes[player.id] || '-';
          const isAlive = !player.eliminatedRound || player.eliminatedRound >= round.number;
          const roleText = player.role === 'order' ? '守序方' : player.role === 'chaos' ? '破坏者' : '未知';
          const suspicion = Math.min(5, Math.max(1, player.suspicion || player.id % 5));
          const displayName = player.nickname || player.name || `${player.id}号`;

          return (
            <article
              key={player.id}
              className={classNames('player-card', !isAlive && 'eliminated', currentSpeakerId === player.id && 'speaking')}
            >
              <div className="rank-badge">{player.id}</div>
              <PlayerPortrait player={player} />
              <div className="player-info">
                <div className="player-name-row">
                  <strong title={player.name}>{displayName}</strong>
                  <span className={isAlive ? 'alive-pill' : 'dead-pill'}>{isAlive ? '存活' : '已放逐'}</span>
                </div>
                <p>本轮投票：{vote}</p>
                <div className="suspicion-row">
                  <span>嫌疑：</span>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <i key={index} className={index < suspicion ? 'active' : ''} />
                  ))}
                </div>
                <p className={classNames('role-line', showRoles && player.role)}>
                  {showRoles ? roleText : '身份隐藏'}
                </p>
              </div>
            </article>
          );
        })}
      </div>
      <div className="panel-footnote">
        <ShieldQuestion size={15} />
        玩家信息说明
      </div>
    </aside>
  );
}

function PlayerPortrait({ player }) {
  const fallbackInitial = (player.nickname || player.name || `${player.id}`).slice(0, 1);

  if (player.avatar) {
    return (
      <div
        className={`portrait portrait-${player.id} custom-portrait`}
        style={{ backgroundImage: `url("${player.avatar}")` }}
        aria-label={`${player.nickname || player.name}头像`}
      />
    );
  }

  return (
    <div className={`portrait portrait-${player.id} initial-portrait`} aria-label={`${player.nickname || player.name}头像`}>
      {fallbackInitial}
    </div>
  );
}
