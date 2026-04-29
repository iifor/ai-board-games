import React from 'react';
import { Bot, Boxes, UsersRound, WandSparkles } from 'lucide-react';

const features = [
  { icon: UsersRound, title: '多人对局', subtitle: '随时匹配' },
  { icon: Bot, title: 'AI陪玩', subtitle: '智能伙伴' },
  { icon: WandSparkles, title: 'AI主持', subtitle: '规则讲解' },
  { icon: Boxes, title: '热门聚合', subtitle: '一站体验' }
];

export function HomePage({ onStart }) {
  return (
    <main className="landing-page">
      <section className="landing-copy">
        <h1>AI桌游平台</h1>
        <p>热门桌游，一键开局 | AI陪玩，随时开桌</p>

        <div className="landing-features" aria-label="平台特色">
          {features.map(({ icon: Icon, title, subtitle }) => (
            <article className="feature-tile" key={title}>
              <Icon size={34} />
              <strong>{title}</strong>
              <span>{subtitle}</span>
            </article>
          ))}
        </div>

        <button className="neon-button landing-start" onClick={onStart}>
          立即开始
          <span>›</span>
        </button>
      </section>

      <section className="landing-board" aria-hidden="true">
        <div className="holo-card room-list">
          <strong>房间列表</strong>
          <p>思思泥鸭 · 9/18</p>
          <p>洛克泥鸭 · 9/14</p>
          <p>泥鹿限时 · 9/36</p>
        </div>
        <div className="holo-card quick-match">
          <strong>快速匹配</strong>
          <div className="match-ring"><UsersRound size={46} /></div>
        </div>
        <div className="holo-host">
          <Bot size={86} />
        </div>
        <div className="holo-card host-panel">
          <strong>AI主持中</strong>
          <div className="wave-line" />
          <p>回合 2/10</p>
          <p>行动阶段</p>
        </div>
      </section>
    </main>
  );
}
