import { MessageCircle, Moon, Sun } from 'lucide-react';
import { buildRoundProgress, formatWerewolfSeatLabel } from '../../utils';
import { PanelHeader } from '../PanelHeader';
import type { Player, WerewolfRound } from '../../../../types';
import './index.css';

interface RoundProgressPanelProps {
  rounds: WerewolfRound[];
  currentRound: WerewolfRound | null;
  players?: Player[];
}

export function RoundProgressPanel({ rounds, currentRound, players = [] }: RoundProgressPanelProps) {
  const items = buildRoundProgress(rounds, currentRound);
  const ghostBrideMessages = (currentRound?.night?.ghostBrideChat || [])
    .filter((message) => String(message.text || '').trim());

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
      {ghostBrideMessages.length ? (
        <section className="werewolf-ghost-chat" aria-label="鬼魂新娘夜聊">
          <header>
            <MessageCircle size={16} />
            <strong>鬼魂新娘夜聊</strong>
          </header>
          <div className="werewolf-ghost-chat__list">
            {ghostBrideMessages.map((message, index) => (
              <article key={`${message.playerId || 'ghost'}-${index}`}>
                <div>
                  <strong>{message.playerId ? formatWerewolfSeatLabel(message.playerId, players) : '鬼魂新娘阵营'}</strong>
                  <span>第 {message.day || currentRound?.day || 1} 天</span>
                </div>
                <p>{message.text}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}
    </section>
  );
}
