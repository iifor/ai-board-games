import { formatMatchTitle, type GameCatalogItem, type MatchSummaryDto } from '@battle/shared';
import { Link } from 'react-router';
import type { AsyncState } from '../../../hooks/useAsync';
import { formatWinner } from '../../../utils/format';
import './LobbyHero.css';

interface LobbyHeroProps {
  readonly primaryGame: GameCatalogItem | null;
  readonly history: AsyncState<readonly MatchSummaryDto[]>;
}

/** 头图右下角的条幅：最近一局 / 还没有对局 / 加载中 / 加载失败，失败不能冒充"没有对局" */
function stripOf(history: LobbyHeroProps['history'], latest: MatchSummaryDto | null): { readonly text: string; readonly action: string } {
  if (latest) return { text: `最近一局 · ${formatMatchTitle(latest)}`, action: `${formatWinner(latest)} · 回放 →` };
  if (history.status === 'loading') return { text: '最近对局加载中…', action: '去开一局 →' };
  if (history.status === 'error') return { text: '最近对局暂时拉不到', action: '去开一局 →' };
  return { text: '还没有完成的对局', action: '去开一局 →' };
}

/** 大厅头图区：标题、文案、入口按钮，右侧是最近一局的入口 */
export function LobbyHero({ primaryGame, history }: LobbyHeroProps) {
  const latest = history.status === 'ready' ? (history.data[0] ?? null) : null;
  const strip = stripOf(history, latest);
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
            <span><i aria-hidden="true" />{strip.text}</span>
            <b>{strip.action}</b>
          </span>
        </Link>
      </section>
    </>
  );
}
