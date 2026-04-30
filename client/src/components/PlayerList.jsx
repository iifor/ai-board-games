import React, { useState } from 'react';
import { ShieldQuestion } from 'lucide-react';
import { classNames, getRoleName } from '../utils/gameState';
import { PanelTitle } from './PanelTitle';

export function PlayerList({ players, round, showRoles, currentSpeakerId }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);

  return (
    <aside className="left-panel framed-panel">
      <PanelTitle title={`玩家列表（${players.length}人）`} />
      <div className="player-list">
        {players.map((player) => {
          const vote = round.votes[player.id] || '-';
          const isAlive = !player.excluded;
          const roleText = getRoleName(player.role, player.roleLabel);
          const suspicion = Math.min(5, Math.max(1, player.suspicion || player.id % 5));
          const displayName = player.nickname || player.name || `${player.id}号`;

          return (
            <article
              key={player.id}
              className={classNames('player-card', !isAlive && 'eliminated', currentSpeakerId === player.id && 'speaking')}
            >
              <div className="rank-badge">{player.id}</div>
              <button className="portrait-button" onClick={() => setSelectedPlayer(player)} aria-label={`查看${displayName}信息`}>
                <PlayerPortrait player={player} />
                <PlayerInfoCard player={player} canReveal={showRoles} />
              </button>
              <div className="player-info">
                <div className="player-name-row">
                  <strong title={player.name}>{displayName}</strong>
                  <span className={isAlive ? 'alive-pill' : 'dead-pill'}>{isAlive ? '有投票权' : '已冻结'}</span>
                </div>
                <p>本轮投票：{vote}</p>
                <p>{player.marked ? '已获风险标记' : '暂无风险标记'}</p>
                <div className="suspicion-row">
                  <span>嫌疑：</span>
                  {Array.from({ length: 5 }).map((_, index) => (
                    <i key={index} className={index < suspicion ? 'active' : ''} />
                  ))}
                </div>
                <p className={classNames('role-line', showRoles && player.role)}>
                  {showRoles ? roleText : '玩家视角隐藏'}
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
      {selectedPlayer && (
        <div className="player-info-backdrop" role="presentation" onClick={() => setSelectedPlayer(null)}>
          <section className="player-info-modal framed-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="player-info-close" onClick={() => setSelectedPlayer(null)} aria-label="关闭">×</button>
            <PlayerInfoContent player={selectedPlayer} canReveal />
          </section>
        </div>
      )}
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

function PlayerInfoCard({ player, canReveal }) {
  return (
    <div className="player-hover-card">
      <PlayerInfoContent player={player} compact canReveal={canReveal} />
    </div>
  );
}

function PlayerInfoContent({ player, compact = false, canReveal = false }) {
  return (
    <>
      <p className="eyebrow">PLAYER CARD</p>
      <h3>{player.nickname || player.name || `${player.id}号`}（{player.id}号）</h3>
      <dl>
        <div><dt>性别</dt><dd>{player.sex || '未知'}</dd></div>
        <div><dt>角色</dt><dd>{canReveal ? getRoleName(player.role, player.roleLabel) : '玩家视角隐藏'}</dd></div>
        <div><dt>性格</dt><dd>{player.personality || '暂无'}</dd></div>
      </dl>
      {!compact && canReveal && (
        <div className="memory-card-text">
          <strong>本局角色卡</strong>
          <p>{player.memoryCard || '暂无角色卡。'}</p>
        </div>
      )}
      {!compact && !canReveal && <p className="hover-hint">玩家视角下，点击头像后只查看这一位玩家的信息。</p>}
      {compact && <p className="hover-hint">{canReveal ? '点击头像查看本局角色卡' : '点击头像查看这位玩家'}</p>}
    </>
  );
}
