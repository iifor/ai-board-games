import React from 'react';
import { X } from 'lucide-react';
import { getConsensusTypeName, getMistPlayers, getWinnerName } from '../utils/gameState';

export function InfoModal({ title, eyebrow = 'INFO', children, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="history-modal framed-panel" role="dialog" aria-modal="true" aria-labelledby="info-title">
        <button className="modal-close" onClick={onClose} aria-label="关闭弹窗"><X size={20} /></button>
        <p className="eyebrow">{eyebrow}</p>
        <h2 id="info-title">{title}</h2>
        <div className="history-scroll">{children}</div>
      </section>
    </div>
  );
}

export function ConfirmResetModal({ onCancel, onConfirm }) {
  return (
    <InfoModal title="确认切换" eyebrow="RESET MATCH" onClose={onCancel}>
      <article className="history-item">
        <p>切换模式，会重置本局比赛。</p>
        <div className="modal-actions">
          <button className="start-game-button" onClick={onCancel}>取消</button>
          <button className="start-game-button next-game-button" onClick={onConfirm}>确认</button>
        </div>
      </article>
    </InfoModal>
  );
}

export function CurrentGameHistory({ events }) {
  if (!events.length) return <p className="empty-discussion">本局暂无历史记录。</p>;
  return events.map((event, index) => (
    <article className="history-item" key={`${event.type}-${index}`}>
      <div className="history-head">
        <strong>{event.title}</strong>
        <time>#{index + 1}</time>
      </div>
      <p>{describeEvent(event)}</p>
    </article>
  ));
}

export function StageInfo({ event }) {
  return (
    <article className="history-item">
      <div className="history-head">
        <strong>{event?.title || '当前阶段'}</strong>
      </div>
      <p>{describeEvent(event)}</p>
    </article>
  );
}

export function EventBackground({ game }) {
  const event = game?.event;
  return (
    <article className="history-item background-item">
      <div className="history-head">
        <strong>{event?.name || '事件背景'}</strong>
        <time>{event?.version || 'v3.2'}</time>
      </div>
      <p>{event?.background || '暂无事件背景。'}</p>
      {event?.terms && (
        <p>
          本局称呼：
          {event.terms.investigators} / {event.terms.mist}；
          目标人物为{event.terms.keyFigure}，掩护者为{event.terms.cover}。
        </p>
      )}
    </article>
  );
}

function describeEvent(event) {
  if (!event) return '暂无阶段信息。';
  const round = event.roundData;
  if (event.type === 'host-message' || event.type === 'speech-log') {
    return `${event.message?.title || '记录'}：${event.message?.text || ''}`;
  }
  if (event.type === 'round') return `第 ${round.number} 轮议题：${round.question.premise || ''} A「${round.question.a}」对 B「${round.question.b}」。`;
  if (event.type === 'vote') return `投票结果：A ${round.tally.A} 票，B ${round.tally.B} 票；${getConsensusTypeName(round.consensusType)}。`;
  if (event.type === 'clue') {
    const clue = round.clue ? `${round.clue.title}：${round.clue.text}` : '本轮未获得新线索';
    const appraisal = round.appraisal ? `鉴定报告：${round.appraisal}` : '鉴定报告：无';
    const noise = round.noise ? `迷雾噪音：${round.noise}` : '无迷雾噪音';
    return `${clue}；${appraisal}；${noise}。`;
  }
  if (event.type === 'speech') return `${event.speech.playerId}号发言：${event.speech.text}`;
  if (event.type === 'suspicion') {
    const votes = Object.entries(round.suspicionVotes || {}).map(([from, to]) => `${from}号投${to}号`).join('、') || '暂无风险标记投票';
    return `${votes}；风险标记：${round.markedSuspects?.join('、') || '无'}号。`;
  }
  if (event.type === 'exclusion') {
    const votes = Object.entries(round.exclusionVotes || {}).map(([from, to]) => `${from}号投${to}号`).join('、') || '暂无权限冻结投票';
    const excluded = round.excluded?.length ? `；权限冻结：${round.excluded.map((item) => `${item.id}号`).join('、')}` : '；无人被权限冻结';
    return `${votes}${excluded}。`;
  }
  if (event.type === 'final') {
    const votes = Object.entries(round.finalAccusationVotes || {}).map(([from, to]) => `${from}号指认${to}号`).join('、') || '暂无最终指认';
    return `${votes}；最高票：${round.finalTargets?.join('、') || '无'}号。`;
  }
  if (event.type === 'end') {
    const game = event.game;
    const winner = getWinnerName(game?.winner);
    const mistPlayers = game ? getMistPlayers(game).join('、') : '暂无';
    return `胜负结算：${winner}获胜。${game?.winReason || ''} 迷雾方：${mistPlayers || '暂无'}。`;
  }
  return event.title || '暂无阶段信息。';
}
