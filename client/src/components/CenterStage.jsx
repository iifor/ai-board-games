import React from 'react';
import { BadgeCheck, Pause, Play } from 'lucide-react';
import { PanelTitle } from './PanelTitle';
import { getConsensusTypeName } from '../utils/gameState';

export function RealStartPanel({ status, message, onStart }) {
  return (
    <section className="center-stage start-stage framed-panel">
      <div className="start-content">
        <p className="eyebrow">REAL AI MODE</p>
        <h2>{status === 'streaming' ? '游戏生成中...' : '游戏即将开始...'}</h2>
        <p>{message || '点击开始后，后端会调度 AI 玩家；前端播报完成后才会通知后端进入下一步。'}</p>
        <button className="start-game-button" onClick={onStart} disabled={status === 'streaming'}>
          {status === 'streaming' ? <Pause size={22} /> : <Play size={22} />}
          {status === 'streaming' ? 'AI 正在行动' : '开始游戏'}
        </button>
      </div>
    </section>
  );
}

export function CenterStage({ game, round, speeches, streamMessage }) {
  return (
    <section className="center-stage">
      <PanelTitle title={game.event?.name || '迷雾调查'} large />
      <RoundCompactBar round={round} />
      <DiscussionLog round={round} speeches={speeches} players={game.players || []} streamMessage={streamMessage} />
    </section>
  );
}

function RoundCompactBar({ round }) {
  const total = Math.max(1, round.aliveIds.length);
  const aPercent = Math.round((round.tally.A / total) * 100);
  const bPercent = 100 - aPercent;
  const hasVotes = Object.keys(round.votes || {}).length > 0;

  return (
    <section className="round-compact framed-panel">
      <div className="round-question">
        <p>{round.question.premise || '主持人要求在两个调查方向中选择其一。'}</p>
        <div>
          <span>A {round.question.a}</span>
          <span>B {round.question.b}</span>
        </div>
      </div>
      <div className="round-vote-mini">
        <strong className={round.consensus ? 'success' : 'failed'}>
          {hasVotes ? getConsensusTypeName(round.consensusType) : '等待投票'}
          {round.consensus && <BadgeCheck size={18} />}
        </strong>
        <em>A {round.tally.A} / B {round.tally.B}</em>
        <div className="result-bars"><i style={{ width: `${aPercent}%` }} /><b style={{ width: `${bPercent}%` }} /></div>
      </div>
    </section>
  );
}

function DiscussionLog({ round, speeches, players, streamMessage }) {
  const playerNumbers = new Map(players.map((player, index) => [Number(player.id), index + 1]));

  return (
    <section className="discussion framed-panel">
      <PanelTitle title="自由讨论" compact />
      <div className="discussion-scroll">
        {streamMessage && <p className="stream-message">{streamMessage}</p>}
        {speeches.length ? speeches.map((speech, index) => {
          const displayNumber = playerNumbers.get(Number(speech.playerId)) || speech.playerId;
          return (
            <article className={`chat-line ${speech.type === 'host' ? 'host-line' : ''}`} key={`${speech.playerId}-${index}`}>
              <span className={`chat-id id-${displayNumber}`}>{speech.type === 'host' ? '主' : displayNumber}</span>
              <strong>{speech.type === 'host' ? '主持人：' : `${displayNumber}号：`}</strong>
              <p>{speech.text}</p>
              <time>20:{String(15 + Math.min(index, 44)).padStart(2, '0')}</time>
            </article>
          );
        }) : <p className="empty-discussion">第 {round.number} 轮尚未进入发言。</p>}
      </div>
    </section>
  );
}
