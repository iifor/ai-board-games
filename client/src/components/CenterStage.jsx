import React from 'react';
import { BadgeCheck, ChevronLeft, ChevronRight, MessageCircle, Pause, Play } from 'lucide-react';
import { PanelTitle } from './PanelTitle';

export function RealStartPanel({ status, message, onStart }) {
  return (
    <section className="center-stage start-stage framed-panel">
      <div className="start-content">
        <p className="eyebrow">REAL AI MODE</p>
        <h2>{status === 'streaming' ? '游戏生成中...' : '游戏即将开始...'}</h2>
        <p>{message || '点击开始后，后端会调度多个 AI 玩家并通过推送消息逐步渲染。'}</p>
        <button className="start-game-button" onClick={onStart} disabled={status === 'streaming'}>
          {status === 'streaming' ? <Pause size={22} /> : <Play size={22} />}
          {status === 'streaming' ? 'AI 正在行动' : '开始游戏'}
        </button>
      </div>
    </section>
  );
}

export function CenterStage({ round, speeches, step, timelineLength, setStep, autoPlay, setAutoPlay, mockMode, streamMessage }) {
  return (
    <section className="center-stage">
      <PanelTitle title="本轮议题" large />
      <QuestionDuel round={round} />
      <VoteResult round={round} />
      <DiscussionLog round={round} speeches={speeches} mockMode={mockMode} streamMessage={streamMessage} />
      {mockMode && (
        <div className="inline-stepper">
          <button onClick={() => setStep(Math.max(0, step - 1))}><ChevronLeft size={18} />上一步</button>
          <button className="blue-button" onClick={() => setAutoPlay(!autoPlay)}>
            {autoPlay ? <Pause size={18} /> : <Play size={18} />}
            {autoPlay ? '暂停播放' : '自动播放'}
          </button>
          <button onClick={() => setStep(Math.min(timelineLength - 1, step + 1))}>下一步<ChevronRight size={18} /></button>
        </div>
      )}
    </section>
  );
}

function QuestionDuel({ round }) {
  return (
    <section className="question-duel">
      <div className="choice-card choice-a"><span>A</span><strong>{round.question.a}</strong></div>
      <div className="vs-ring">Vs</div>
      <div className="choice-card choice-b"><span>B</span><strong>{round.question.b}</strong></div>
    </section>
  );
}

function VoteResult({ round }) {
  const total = Math.max(1, round.aliveIds.length);
  const aPercent = Math.round((round.tally.A / total) * 100);
  const bPercent = 100 - aPercent;
  const hasVotes = Object.keys(round.votes || {}).length > 0;

  return (
    <section className="vote-result framed-panel">
      <div className="vote-count side-a"><span>A 票数</span><strong>{round.tally.A}</strong><em>票</em></div>
      <div className="consensus-result">
        <PanelTitle title="本轮共识投票结果" compact />
        <strong className={round.consensus ? 'success' : 'failed'}>
          本轮共识：{hasVotes ? (round.consensus ? '成功' : '失败') : '等待'}
          {round.consensus && <BadgeCheck size={28} />}
        </strong>
        <p>共识阈值：{round.threshold} 票（{round.aliveIds.length}人局需{round.threshold}票）</p>
        <div className="result-bars"><i style={{ width: `${aPercent}%` }} /><b style={{ width: `${bPercent}%` }} /></div>
      </div>
      <div className="vote-count side-b"><span>B 票数</span><strong>{round.tally.B}</strong><em>票</em></div>
    </section>
  );
}

function DiscussionLog({ round, speeches, mockMode, streamMessage }) {
  return (
    <section className="discussion framed-panel">
      <PanelTitle title="自由讨论" compact />
      <div className="discussion-scroll">
        {streamMessage && <p className="stream-message">{streamMessage}</p>}
        {speeches.length ? speeches.map((speech, index) => (
          <article className="chat-line" key={`${speech.playerId}-${index}`}>
            <span className={`chat-id id-${speech.playerId}`}>{speech.playerId}</span>
            <strong>{speech.playerId}号：</strong>
            <p>{speech.text}</p>
            <time>20:{String(15 + Math.min(index, 44)).padStart(2, '0')}</time>
          </article>
        )) : <p className="empty-discussion">第 {round.number} 轮尚未进入发言。</p>}
      </div>
      {mockMode && (
        <div className="chat-input">
          <MessageCircle size={19} />
          <span>输入你的发言内容（Enter 发送）</span>
          <em>0/60</em>
          <button>发送</button>
        </div>
      )}
    </section>
  );
}
