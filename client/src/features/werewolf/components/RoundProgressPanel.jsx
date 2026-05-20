import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { buildRoundProgress } from '../werewolfUtils';
import { PanelHeader } from './PanelHeader';
import './RoundProgressPanel.css';

export function RoundProgressPanel({ rounds, currentRound }) {
  const items = buildRoundProgress(rounds, currentRound);
  return (
    <section className="werewolf-panel werewolf-progress-panel">
      <PanelHeader icon={<Moon size={18} />} title="回合进程" />
      <div className="werewolf-progress-list">
        {items.length ? items.map((item) => (
          <article className={item.active ? 'active' : ''} key={item.key}>
            {item.phase === 'day' ? <Sun size={19} /> : <Moon size={19} />}
            <span>{item.label}</span>
          </article>
        )) : <p>等待主持人开局。</p>}
      </div>
    </section>
  );
}
