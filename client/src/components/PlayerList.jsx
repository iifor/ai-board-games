import React, { useState } from 'react';
import { classNames, getRoleName } from '../utils/gameState';

export function PlayerList({ players, round, showRoles, currentSpeakerId }) {
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const selectedIndex = selectedPlayer ? players.findIndex((player) => player.id === selectedPlayer.id) : -1;

  return (
    <>
      <aside className="left-panel framed-panel">
        <div className="player-list">
          {players.map((player, index) => {
            const vote = round.votes[player.id] || '-';
            const isAlive = !player.excluded;
            const roleText = getRoleName(player.role, player.roleLabel);
            const displayName = player.nickname || player.name || `${index + 1}号`;
            const displayNumber = index + 1;

            return (
              <article
                key={player.id}
                className={classNames('player-card', !isAlive && 'eliminated', currentSpeakerId === player.id && 'speaking')}
              >
                <div className="rank-badge">{displayNumber}</div>
                <button
                  className="portrait-button"
                  onClick={() => setSelectedPlayer(player)}
                  aria-label={`查看${displayName}信息`}
                >
                  <PlayerPortrait player={player} />
                </button>
                <div className="player-info">
                  <div className="player-name-row">
                    <strong title={player.name}>{displayName}</strong>
                    <span className={isAlive ? 'alive-pill' : 'dead-pill'}>{isAlive ? '有投票权' : '已冻结'}</span>
                  </div>
                  <p>本轮投票：{vote}</p>
                  <p>{player.marked ? '已获风险标记' : '暂无风险标记'}</p>
                  <p className={classNames('role-line', showRoles && player.role)}>
                    {showRoles ? roleText : '玩家视角隐藏'}
                  </p>
                </div>
              </article>
            );
          })}
        </div>
      </aside>
      {selectedPlayer && (
        <div className="player-info-backdrop" role="presentation" onClick={() => setSelectedPlayer(null)}>
          <section className="player-info-modal framed-panel" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <button className="player-info-close" onClick={() => setSelectedPlayer(null)} aria-label="关闭">×</button>
            <PlayerInfoContent player={selectedPlayer} displayNumber={selectedIndex + 1} canReveal={showRoles} />
          </section>
        </div>
      )}
    </>
  );
}

function PlayerPortrait({ player }) {
  const fallbackInitial = (player.nickname || player.name || `${player.id}`).slice(0, 1);

  if (player.avatar) {
    return (
      <div
        className={`portrait portrait-${player.id} custom-portrait`}
        style={{ backgroundImage: `url("${formatAvatarUrl(player.avatar)}")` }}
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

function PlayerInfoContent({ player, displayNumber, compact = false, canReveal = false }) {
  const safeNumber = displayNumber || player.id;
  return (
    <>
      <p className="eyebrow">玩家卡片</p>
      <h3>{player.nickname || player.name || `${safeNumber}号`}（{safeNumber}号）</h3>
      <dl>
        <div><dt>性别</dt><dd>{player.sex || '未知'}</dd></div>
        <div><dt>身份</dt><dd>{canReveal ? getRoleName(player.role, player.roleLabel) : '玩家视角隐藏'}</dd></div>
        <div><dt>性格</dt><dd>{player.personality || '暂无'}</dd></div>
      </dl>
      {!compact && canReveal && (
        <div className="memory-card-text">
          <strong>本局角色卡</strong>
          <p>{player.memoryCard || '暂无角色卡。'}</p>
        </div>
      )}
      {!compact && !canReveal && <p className="hover-hint">玩家视角下，只展示这位玩家的公开信息。</p>}
      {compact && <p className="hover-hint">{canReveal ? '点击头像查看本局角色卡' : '点击头像查看这位玩家'}</p>}
    </>
  );
}

function formatAvatarUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^(https?:|data:|blob:)/i.test(url)) return url.replace(/"/g, '%22');
  return encodeURI(url.startsWith('/') ? url : `/${url}`).replace(/"/g, '%22');
}
