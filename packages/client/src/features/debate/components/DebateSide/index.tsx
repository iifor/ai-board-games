import { DebateFlag } from '../DebateFlag';
import { DebateSeat } from '../DebateSeat';
import { toChineseOrdinal } from '../../utils';
import './index.css';
import type { Player } from '../../../../types';

interface DebateSideProps {
  title: string;
  position?: string;
  players: Player[];
  tone: 'pro' | 'con';
  mvpId?: number | null;
  currentSpeakerId: string | null;
  onPlayerSelect: (player: Player) => void;
  mvpVoteTargets?: Map<number, string>;
}

export function DebateSide({ title, position, players, tone, mvpId, currentSpeakerId, onPlayerSelect, mvpVoteTargets }: DebateSideProps) {
  const seats = Array.from({ length: 4 }).map((_, index) => players[index] || null);
  return (
    <aside className={`debate-side ${tone}`}>
      <header>
        <DebateFlag tone={tone} label={title.slice(0, 1)} />
        <span>{position || (tone === 'pro' ? '等待正方观点' : '等待反方观点')}</span>
      </header>
      <div className="debate-seat-list">
        {seats.map((player, index) => (
          <DebateSeat
            player={player}
            slotLabel={`${title}${toChineseOrdinal(index + 1)}辩`}
            key={player?.id || `${tone}-empty-${index}`}
            currentSpeakerId={currentSpeakerId}
            onPlayerSelect={onPlayerSelect}
            tone={tone}
            index={index}
            mvpVoteTarget={mvpVoteTargets?.get(Number(player?.id))}
            isMvp={Number(player?.id) === Number(mvpId)}
          />
        ))}
      </div>
    </aside>
  );
}
