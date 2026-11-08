import type { PublicPlayerDto, VariantRoleItem } from '@battle/shared';
import { Avatar } from '../../../components/Avatar';
import { debatePosition } from '../utils';
import './PlayerPicker.css';

interface PlayerPickerProps {
  readonly players: readonly PublicPlayerDto[];
  readonly selected: readonly number[];
  readonly groups?: readonly VariantRoleItem[] | undefined;
  readonly onToggle: (id: number) => void;
  /** 头像容器登记（飞入座位动效的起点） */
  readonly registerSource?: ((playerId: number, element: HTMLElement | null) => void) | undefined;
}

/** 选人：按点击顺序就座，卡片上显示座位号与海报 */
export function PlayerPicker({ players, selected, groups, onToggle, registerSource }: PlayerPickerProps) {
  const seats = groups?.flatMap((group) => Array.from({ length: group.count }, (_, index) => ({
    team: group.team, label: group.name + (debatePosition(group, index) || ` ${index + 1}`),
  })));
  return (
    <ul className="player-picker">
      {players.map((player, index) => {
        const seat = selected.indexOf(player.id) + 1;
        const assignment = seats?.[seat - 1];
        return (
          <li key={player.id} className="ui-fade-up" style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}>
            <button type="button" className={`player-option ${seat ? 'player-option-selected' : ''}`} aria-pressed={seat > 0} onClick={() => onToggle(player.id)}>
              <span className="player-option-seat" data-team={assignment?.team} key={seat} aria-hidden={!seat}>{assignment?.label ?? (seat || '+')}</span>
              <span className="player-option-figure" ref={(element) => registerSource?.(player.id, element)}>
                <Avatar className="player-option-portrait" variant="poster" name={player.name} avatar={player.avatar} />
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
