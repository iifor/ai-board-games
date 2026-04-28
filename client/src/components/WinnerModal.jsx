import React from 'react';
import { X } from 'lucide-react';
import { getChaosPlayers, getWinnerName } from '../utils/gameState';

export function WinnerModal({ game, onClose }) {
  if (!game?.winner || !game.rounds?.length) return null;

  const winnerName = getWinnerName(game.winner);
  const chaosPlayers = getChaosPlayers(game);

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="winner-modal framed-panel" role="dialog" aria-modal="true" aria-labelledby="winner-title">
        <button className="modal-close" onClick={onClose} aria-label="关闭结算弹窗"><X size={20} /></button>
        <p className="eyebrow">GAME SETTLEMENT</p>
        <h2 id="winner-title">恭喜{winnerName}获胜</h2>
        <div className="identity-reveal">
          <strong>身份公布</strong>
          <p>破坏者是{chaosPlayers.length ? chaosPlayers.join('、') : '暂无'}。</p>
        </div>
        <div className="modal-actions">
          <button className="start-game-button" onClick={onClose}>返回棋盘</button>
        </div>
      </section>
    </div>
  );
}
