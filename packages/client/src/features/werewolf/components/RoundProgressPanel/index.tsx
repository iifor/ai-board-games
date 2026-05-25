import { Moon, Sun } from 'lucide-react';
import { buildRoundProgress } from '../../utils';
import { PanelHeader } from '../PanelHeader';
import type { WerewolfRound } from '../../../../types';
import './index.css';

interface RoundProgressPanelProps {
  rounds: WerewolfRound[];
  currentRound: WerewolfRound | null;
}

export function RoundProgressPanel({ rounds, currentRound }: RoundProgressPanelProps) {
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
