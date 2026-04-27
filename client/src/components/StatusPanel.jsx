import React from 'react';
import { BookOpen, Target, UserRound, Users } from 'lucide-react';
import { buildExileCards, classNames } from '../utils/gameState';
import { PanelTitle } from './PanelTitle';

export function StatusPanel({ game, round, showRoles }) {
  const consensusSuccess = game.rounds.filter((item) => item.consensus).length;
  const consensusFail = game.rounds.filter((item) => item.votes && Object.keys(item.votes).length && !item.consensus).length;
  const aliveCount = game.players.filter((player) => !player.eliminatedRound || player.eliminatedRound >= round.number).length;

  return (
    <aside className="right-panel">
      <section className="framed-panel status-card">
        <PanelTitle title="游戏状态" />
        <StatusRow icon={<Target size={24} />} label="当前累计">
          <span className="green">共识成功 {consensusSuccess} 次</span>
          <span className="red">共识失败 {consensusFail} 次</span>
        </StatusRow>
        <StatusRow icon={<UserRound size={24} />} label="当前存活"><strong>{aliveCount}</strong><span>人</span></StatusRow>
        <StatusRow icon={<Users size={24} />} label="角色信息">
          <span>{showRoles ? '身份已公开' : '守序方 ? / 破坏者 ?'}</span>
        </StatusRow>
      </section>

      <section className="framed-panel exile-panel">
        <PanelTitle title={`放逐投票（本轮可投票人数：${round.aliveIds.length}人）`} compact />
        <div className="exile-cards">
          {buildExileCards(round).map((card, index) => (
            <article key={card.id} className={classNames('exile-card', index === 1 && 'lead')}>
              <strong>{card.id}号</strong><span>得票数</span><b>{card.count}</b><em>票</em>
              <p>{card.voters.length ? card.voters.map((id) => `${id}号`).join('、') : '暂无投票'}</p>
            </article>
          ))}
        </div>
        <p className="exile-note">{round.eliminated ? `${round.eliminated.id}号被放逐` : '需要最高票且非平票才会放逐'}</p>
      </section>

      <section className="framed-panel rules-card">
        <h3><BookOpen size={19} />Lite 规则提醒</h3>
        <p>三轮打满后结算共识胜负；</p>
        <p>若破坏者全灭则守序方立即胜利；</p>
        <p>若破坏者人数大于守序方人数则破坏者立即胜利。</p>
      </section>
    </aside>
  );
}

function StatusRow({ icon, label, children }) {
  return <div className="status-row"><div className="status-icon">{icon}</div><span>{label}</span><div>{children}</div></div>;
}
