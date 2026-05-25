import React from 'react';
import { Skull } from 'lucide-react';
import { ROLE_NAMES } from '../../constants';
import { formatWerewolfSeatLabel } from '../../werewolfUtils';
import { PanelHeader } from '../PanelHeader';
import './index.css';

export function EliminationPanel({ players, showRoles, visibleRolePlayerId }) {
  const eliminated = players
    .filter((player) => !player.alive)
    .sort((a, b) => Number(b.deathDay || 0) - Number(a.deathDay || 0));

  return (
    <section className="werewolf-panel werewolf-elimination-panel">
      <PanelHeader icon={<Skull size={18} />} title="淘汰记录" />
      <div className="werewolf-elimination-list">
        {eliminated.length ? eliminated.map((player) => (
          <article key={player.id}>
            <Skull size={18} />
            <strong>{formatWerewolfSeatLabel(player.id, players)}</strong>
            <span>{ROLE_NAMES[player.roleLabel] || player.roleLabel || ROLE_NAMES[player.role] || ''}</span>
            <em>{player.deathReason || '出局'} · 第 {player.deathDay || '?'} 天</em>
          </article>
        )) : <p>暂无玩家出局。</p>}
      </div>
    </section>
  );
}
