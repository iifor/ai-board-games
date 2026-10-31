import type { GameCatalogItem } from '@battle/shared';
import { Link } from 'react-router';
import './GameList.css';

export function GameList({ games }: { readonly games: readonly GameCatalogItem[] }) {
  return (
    <ul className="game-list">
      {games.map((game) => (
        <li key={game.key} className="game-card card">
          <h2>{game.title}</h2>
          <p>{game.description}</p>
          <span className="game-card-meta">
            {game.players.min === game.players.max ? `${game.players.min} 人` : `${game.players.min}–${game.players.max} 人`}
            {game.variants.length ? ` · ${game.variants.length} 个板子` : ''}
          </span>
          <Link className="button button-primary" to={`/play/${game.key}`}>开始</Link>
        </li>
      ))}
    </ul>
  );
}
