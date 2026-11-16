import type { AudienceView, GameResult } from '@battle/shared';
import type { CSSProperties } from 'react';
import { rosterByTeam, winningSeats } from '../utils';
import './ResultRoster.css';

type RosterStyle = CSSProperties & Record<'--roster-columns' | '--roster-rows', number>;
type RowStyle = CSSProperties & Record<'--i', number>;

interface ResultRosterProps {
  readonly view: AudienceView;
  readonly result: GameResult;
}

/**
 * 终局阵容：按阵营分组揭示身份，整张表逐行错峰揭示（--i 为全表行号），出局者置灰。
 * 获胜按座位判断：整组获胜的阵营在最后一行亮出后扫过一道光；组内只有部分座位获胜（离群的狼、情侣、跟随主人的混血儿）时逐行标出。
 */
export function ResultRoster({ view, result }: ResultRosterProps) {
  const groups = rosterByTeam(view);
  if (!groups.length) return null;
  const winners = winningSeats(view, result);
  const style: RosterStyle = { '--roster-columns': Math.min(groups.length, 4), '--roster-rows': view.seats.length };
  let row = 0;
  return (
    <div className="result-roster" style={style}>
      {groups.map((group) => {
        const wonAll = group.seats.every((seat) => winners.has(seat.seat));
        return (
          <section key={group.team ?? 'unknown'} className={`result-roster-team ${wonAll ? 'is-winner' : ''}`} data-team={group.team ?? ''}>
            <h3>{group.label}{wonAll ? ' · 获胜' : ''}</h3>
            <ul>
              {group.seats.map((seat) => {
                const rowStyle: RowStyle = { '--i': row++ };
                const wonAlone = !wonAll && winners.has(seat.seat);
                const className = [seat.alive ? '' : 'is-out', wonAlone ? 'is-winner' : ''].filter(Boolean).join(' ');
                return (
                  <li key={seat.seat} className={className} style={rowStyle}>
                    <strong>{seat.seat} {seat.name}</strong>
                    <span>{seat.roleName ?? '未知'}{wonAlone ? ' · 获胜' : ''}{seat.alive ? '' : ' · 出局'}</span>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
