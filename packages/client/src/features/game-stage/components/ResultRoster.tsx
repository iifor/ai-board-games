import type { AudienceView, GameResult } from '@battle/shared';
import type { CSSProperties } from 'react';
import { rosterByTeam } from '../utils';
import './ResultRoster.css';

type RosterStyle = CSSProperties & Record<'--roster-columns' | '--roster-rows', number>;
type RowStyle = CSSProperties & Record<'--i', number>;

interface ResultRosterProps {
  readonly view: AudienceView;
  readonly result: GameResult;
}

/** 终局阵容：按阵营分组揭示身份，整张表逐行错峰揭示（--i 为全表行号），获胜阵营在最后一行亮出后扫过一道光，出局者置灰 */
export function ResultRoster({ view, result }: ResultRosterProps) {
  const groups = rosterByTeam(view);
  if (!groups.length) return null;
  const style: RosterStyle = { '--roster-columns': Math.min(groups.length, 4), '--roster-rows': view.seats.length };
  let row = 0;
  return (
    <div className="result-roster" style={style}>
      {groups.map((group) => (
        <section key={group.team ?? 'unknown'} className={`result-roster-team ${group.team === result.winner ? 'is-winner' : ''}`} data-team={group.team ?? ''}>
          <h3>{group.label}{group.team === result.winner ? ' · 获胜' : ''}</h3>
          <ul>
            {group.seats.map((seat) => {
              const rowStyle: RowStyle = { '--i': row++ };
              return (
                <li key={seat.seat} className={seat.alive ? '' : 'is-out'} style={rowStyle}>
                  <strong>{seat.seat} {seat.name}</strong>
                  <span>{seat.roleName ?? '未知'}{seat.alive ? '' : ' · 出局'}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
