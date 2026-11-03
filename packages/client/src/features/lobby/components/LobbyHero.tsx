import { formatMatchTitle, type GameCatalogItem, type MatchSummaryDto } from '@battle/shared';
import type { CSSProperties } from 'react';
import { Link } from 'react-router';
import type { AsyncState } from '../../../hooks/useAsync';
import { formatDateTime, formatWinner } from '../../../utils/format';
import { useParallax } from '../hooks/useParallax';
import './LobbyHero.css';

type StepStyle = CSSProperties & Record<'--i', number>;

interface LobbyHeroProps {
  readonly primaryGame: GameCatalogItem | null;
  readonly history: AsyncState<readonly MatchSummaryDto[]>;
}

/** 头图右下角的条幅：最近一局 / 还没有对局 / 加载中 / 加载失败，失败不能冒充"没有对局" */
function stripOf(history: LobbyHeroProps['history'], latest: MatchSummaryDto | null): { readonly text: string; readonly action: string } {
  if (latest) return { text: `最近一局 · ${formatMatchTitle(latest)}`, action: '回放 →' };
  if (history.status === 'loading') return { text: '最近对局加载中…', action: '去开一局 →' };
  if (history.status === 'error') return { text: '最近对局暂时拉不到', action: '去开一局 →' };
  return { text: '还没有完成的对局', action: '去开一局 →' };
}

const step = (index: number): StepStyle => ({ '--i': index });

/** 大厅头图区：标题、文案、入口按钮依次进场，右侧是最近一局的入口（有最近一局时显示胜方与时间；背景随指针轻微视差） */
export function LobbyHero({ primaryGame, history }: LobbyHeroProps) {
  const latest = history.status === 'ready' ? (history.data[0] ?? null) : null;
  const strip = stripOf(history, latest);
  const parallax = useParallax(8);
  return (
    <>
      <div className="lobby-backdrop" aria-hidden="true" />
      <section className="lobby-hero">
        <div className="lobby-hero-copy">
          <span className="hud-label ui-fade-up" style={step(0)}>AI Battle Arena</span>
          <h1 className="ui-fade-up" style={step(1)}>让 AI 玩家同台对战</h1>
          <p className="ui-fade-up" style={step(2)}>挑一种玩法、选好 AI 玩家，剩下的交给它们。你只管当观众：看它们发言、投票、互相试探，每一局都能回放。</p>
          <div className="lobby-hero-actions ui-fade-up" style={step(3)}>
            {primaryGame ? <Link className="button button-primary" to={`/play/${primaryGame.key}`}>开一局{primaryGame.title.replace(/^AI\s*/, '')}</Link> : null}
            {latest ? <Link className="button" to={`/matches/${latest.id}`}>看最近一局</Link> : null}
          </div>
        </div>
        <Link
          className="lobby-hero-visual ui-fade-up"
          style={step(2)}
          to={latest ? `/matches/${latest.id}` : '/history'}
          data-game={latest?.gameKey}
          onPointerMove={parallax.onPointerMove}
          onPointerLeave={parallax.onPointerLeave}
        >
          <img src="/stage/werewolf-night.png" alt="" />
          <span className="lobby-hero-strip">
            <span className="lobby-hero-strip-text">
              <span className="lobby-hero-strip-title"><i aria-hidden="true" />{strip.text}</span>
              {latest ? (
                <span className="lobby-hero-strip-meta">
                  <span className="ui-pill ui-pill-accent">{formatWinner(latest)}</span>
                  <time dateTime={latest.createdAt}>{formatDateTime(latest.createdAt)}</time>
                </span>
              ) : null}
            </span>
            <b className="lobby-hero-strip-cta">{strip.action}</b>
          </span>
        </Link>
      </section>
    </>
  );
}
