import type { PublicPlayerDto } from '@battle/shared';
import { Avatar } from '../../../components/Avatar';
import './PlayerPicker.css';

interface PlayerPickerProps {
  readonly players: readonly PublicPlayerDto[];
  readonly selected: readonly number[];
  readonly onToggle: (id: number) => void;
  /** 头像容器登记（飞入座位动效的起点） */
  readonly registerSource?: ((playerId: number, element: HTMLElement | null) => void) | undefined;
}

/** 选人：按点击顺序就座，卡片上显示座位号与海报 */
export function PlayerPicker({ players, selected, onToggle, registerSource }: PlayerPickerProps) {
  return (
    <ul className="player-picker">
      {players.map((player, index) => {
        const seat = selected.indexOf(player.id) + 1;
        return (
          <li key={player.id} className="ui-fade-up" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
            <button type="button" className={`player-option ${seat ? 'player-option-selected' : ''}`} aria-pressed={seat > 0} onClick={() => onToggle(player.id)}>
              <span className="player-option-seat" key={seat}>{seat || '+'}</span>
              <span className="player-option-figure" ref={(element) => registerSource?.(player.id, element)}>
                <Avatar className="player-option-portrait" name={player.name} avatar={player.avatar} />
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
