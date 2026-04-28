import React from 'react';
import { X } from 'lucide-react';
import { getChaosPlayers, getWinnerName } from '../utils/gameState';

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

function describeEvent(event) {
  if (!event) return '暂无阶段信息。';
  const round = event.roundData;
  if (event.type === 'round') return `第 ${round.number} 轮议题：A「${round.question.a}」对 B「${round.question.b}」。`;
  if (event.type === 'vote') return `投票结果：A ${round.tally.A} 票，B ${round.tally.B} 票；共识${round.consensus ? '成功' : '失败'}，阈值 ${round.threshold} 票。`;
  if (event.type === 'speech') return `${event.speech.playerId}号发言：${event.speech.text}`;
  if (event.type === 'exile') {
    const votes = Object.entries(round.exileVotes || {}).map(([from, to]) => `${from}号投${to}号`).join('、') || '暂无放逐投票';
    const eliminated = round.eliminated?.id ? `，${round.eliminated.id}号被放逐` : '，本轮无人被放逐';
    return `${votes}${eliminated}。`;
  }
  if (event.type === 'end') {
    const game = event.game;
    const winner = getWinnerName(game?.winner);
    const chaosPlayers = game ? getChaosPlayers(game).join('、') : '暂无';
    const consensusCount = game?.rounds?.filter((item) => item.consensus).length ?? 0;
    return `胜负结算：${winner}获胜。共识成功 ${consensusCount} 次。破坏者是：${chaosPlayers || '暂无'}。`;
  }
  return event.title || '暂无阶段信息。';
}
