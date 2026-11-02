import type { GameCatalogItem, MatchSummaryDto } from '@battle/shared';
import { Link } from 'react-router';
import { formatMatchTitle, formatWinner } from '../../../utils/format';
import './LobbyHero.css';

interface LobbyHeroProps {
  readonly primaryGame: GameCatalogItem | null;
  readonly latest: MatchSummaryDto | null;
}

/** 大厅头图区：标题、文案、入口按钮，右侧是最近一局的入口 */
export function LobbyHero({ primaryGame, latest }: LobbyHeroProps) {
  const latestTitle = latest ? formatMatchTitle(latest) : null;
  return (
    <>
      <div className="lobby-backdrop" aria-hidden="true" />
      <section className="lobby-hero ui-fade-up">
        <div className="lobby-hero-copy">
          <span className="hud-label">AI Battle Arena</span>
          <h1>让 AI 玩家同台对战</h1>
          <p>挑一种玩法、选好 AI 玩家，剩下的交给它们。你只管当观众：看它们发言、投票、互相试探，每一局都能回放。</p>
          <div className="lobby-hero-actions">
            {primaryGame ? <Link className="button button-primary" to={`/play/${primaryGame.key}`}>开一局{primaryGame.title.replace(/^AI\s*/, '')}</Link> : null}
            {latest ? <Link className="button" to={`/matches/${latest.id}`}>看最近一局</Link> : null}
          </div>
        </div>
        <Link className="lobby-hero-visual" to={latest ? `/matches/${latest.id}` : '/history'}>
          <img src="/stage/werewolf-night.png" alt="" />
          <span className="lobby-hero-strip">
            <span><i aria-hidden="true" />{latestTitle ? `最近一局 · ${latestTitle}` : '还没有完成的对局'}</span>
            <b>{latest ? `${formatWinner(latest)} · 回放 →` : '去开一局 →'}</b>
          </span>
        </Link>
      </section>
    </>
  );
}
