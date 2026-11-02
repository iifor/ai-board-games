import type { GameCatalogItem } from '@battle/shared';
import { Link } from 'react-router';
import { GAMES_WITH_TOPIC } from '../constants';
import { GameIcon } from './GameIcon';
import './GameList.css';

function playersLabel(game: GameCatalogItem): string {
  const players = game.players.min === game.players.max ? `${game.players.min} 人` : `${game.players.min}–${game.players.max} 人`;
  return game.variants.length ? `${players} · ${game.variants.length} 个板子` : players;
}

/** 游戏入口：横向卡片，图标 + 说明 + 标签 + 开始 */
export function GameList({ games }: { readonly games: readonly GameCatalogItem[] }) {
  return (
    <ul className="game-list">
      {games.map((game, index) => (
        <li key={game.key} className="game-card ui-fade-up" data-game={game.key} style={{ animationDelay: `${index * 90}ms` }}>
          <span className="game-card-icon"><GameIcon gameKey={game.key} /></span>
          <div className="game-card-body">
            <h2>{game.title}</h2>
            <p>{game.description}</p>
            <div className="game-card-chips">
              <span className="ui-pill ui-pill-accent">{playersLabel(game)}</span>
              {GAMES_WITH_TOPIC.has(game.key) ? <span className="ui-pill ui-pill-outline">可自定义辩题</span> : null}
            </div>
          </div>
          <Link className="button button-primary" to={`/play/${game.key}`}>开始</Link>
        </li>
      ))}
    </ul>
  );
}
