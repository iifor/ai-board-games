import './LobbyHero.css';

interface LobbyHeroProps {
  readonly title: string;
  readonly tagline: string;
}

/** 大厅顶部：背景图 + 标题 */
export function LobbyHero({ title, tagline }: LobbyHeroProps) {
  return (
    <>
      <div className="lobby-backdrop" aria-hidden="true" />
      <header className="lobby-hero ui-fade-up">
        <span className="hud-label">AI Battle Arena</span>
        <h1>{title}</h1>
        <p>{tagline}</p>
      </header>
    </>
  );
}
