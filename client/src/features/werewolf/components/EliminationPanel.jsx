import React from 'react';
import { Skull } from 'lucide-react';
import { ROLE_NAMES } from '../constants';
import { PanelHeader } from './PanelHeader';
import './EliminationPanel.css';

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
            <strong>玩家 {player.id}</strong>
            <span>{player.roleLabel || ROLE_NAMES[player.role] || ''}</span>
            <em>{player.deathReason || '出局'} · 第 {player.deathDay || '?'} 天</em>
          </article>
        )) : <p>暂无玩家出局。</p>}
      </div>
    </section>
  );
}
