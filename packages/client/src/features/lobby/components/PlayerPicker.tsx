import type { PublicPlayerDto } from '@battle/shared';
import { initialsOf, resolvePoster } from '../../../utils/posters';
import './PlayerPicker.css';

interface PlayerPickerProps {
  readonly players: readonly PublicPlayerDto[];
  readonly selected: readonly number[];
  readonly onToggle: (id: number) => void;
}

/** 选人：按点击顺序就座，卡片上显示座位号与海报 */
export function PlayerPicker({ players, selected, onToggle }: PlayerPickerProps) {
  return (
    <ul className="player-picker">
      {players.map((player, index) => {
        const seat = selected.indexOf(player.id) + 1;
        const poster = resolvePoster(player.name, player.avatar, 'cutout');
        return (
          <li key={player.id} className="ui-fade-up" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
            <button type="button" className={`player-option ${seat ? 'player-option-selected' : ''}`} aria-pressed={seat > 0} onClick={() => onToggle(player.id)}>
              <span className="player-option-seat" key={seat}>{seat || '+'}</span>
              <span className="player-option-portrait" aria-hidden="true">
                {poster ? <img src={poster} alt="" loading="lazy" /> : <b>{initialsOf(player.name)}</b>}
              </span>
              <span className="player-option-name">{player.name}</span>
              {player.persona ? <span className="player-option-persona">{player.persona}</span> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
