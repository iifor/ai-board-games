import type { AudienceView, GameResult } from '@battle/shared';
import { rosterByTeam } from '../utils';
import './ResultRoster.css';

interface ResultRosterProps {
  readonly view: AudienceView;
  readonly result: GameResult;
}

/** 终局阵容：按阵营分组揭示身份，获胜阵营高亮，出局者置灰 */
export function ResultRoster({ view, result }: ResultRosterProps) {
  const groups = rosterByTeam(view);
  if (!groups.length) return null;
  return (
    <div className="result-roster" style={{ gridTemplateColumns: `repeat(${Math.min(groups.length, 4)}, minmax(0, 1fr))` }}>
      {groups.map((group) => (
        <section key={group.team ?? 'unknown'} className={`result-roster-team ${group.team === result.winner ? 'is-winner' : ''}`} data-team={group.team ?? ''}>
          <h3>{group.label}{group.team === result.winner ? ' · 获胜' : ''}</h3>
          <ul>
            {group.seats.map((seat) => (
              <li key={seat.seat} className={seat.alive ? '' : 'is-out'}>
                <strong>{seat.seat} {seat.name}</strong>
                <span>{seat.roleName ?? '未知'}{seat.alive ? '' : ' · 出局'}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
