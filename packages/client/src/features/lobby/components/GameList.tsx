import type { GameCatalogItem } from '@battle/shared';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import { GAMES_WITH_TOPIC } from '../constants';
import { GameIcon } from './GameIcon';
import './GameList.css';

type CardStyle = CSSProperties & Record<'--i', number>;

/** 卡片进场排在头图各元素之后（头图占 0–4 档） */
const FIRST_CARD_STEP = 5;

const cardStyle = (index: number): CardStyle => ({ '--i': FIRST_CARD_STEP + index });

function playersLabel(game: GameCatalogItem): string {
  const players = game.players.min === game.players.max ? `${game.players.min} 人` : `${game.players.min}–${game.players.max} 人`;
  return game.variants.length ? `${players} · ${game.variants.length} 个板子` : players;
}

/** 游戏入口：横向卡片，图标 + 说明 + 标签 + 开始；悬停 / 键盘聚焦时上浮、扫光、图标亮起强调色 */
export function GameList({ games }: { readonly games: readonly GameCatalogItem[] }) {
  return (
    <ul className="game-list">
      {games.map((game, index) => (
        <li key={game.key} className="game-card ui-fade-up" data-game={game.key} style={cardStyle(index)}>
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
