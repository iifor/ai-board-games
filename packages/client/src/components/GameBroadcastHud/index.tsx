import { classNames } from '../../utils/classNames';
import './index.css';

interface GameBroadcastHudProps {
  title: string;
  subtitle: string;
  status: string;
  tone: 'debate' | 'werewolf';
}

export function GameBroadcastHud({ title, subtitle, status, tone }: GameBroadcastHudProps) {
  return (
    <header className={classNames('game-broadcast-hud', `game-broadcast-hud--${tone}`)} aria-label={`${title} broadcast status`}>
      <div className="game-broadcast-hud__identity">
        <span>{subtitle}</span>
        <strong>{title}</strong>
      </div>
      <div className="game-broadcast-hud__live">
        <span aria-hidden="true" />
        <b>LIVE</b>
      </div>
      <p>{status}</p>
    </header>
  );
}
