import React from 'react';
import { X } from 'lucide-react';
import { getRoleName, getWinnerName } from '../utils/gameState';

export function WinnerModal({ game, onClose }) {
  if (!game?.winner || !game.rounds?.length) return null;

  const winnerName = getWinnerName(game.winner);
  const keyFigure = game.players.find((player) => player.role === 'keyFigure');
  const mistPlayers = game.players
    .map((player, index) => ({ ...player, displayNumber: index + 1 }))
    .filter((player) => player.role === 'keyFigure' || player.role === 'cover')
    .map((player) => `${player.nickname || player.name || `${player.displayNumber}号`}（${getRoleName(player.role, player.roleLabel)}，${player.displayNumber}号）`);
  const keyFigureNumber = keyFigure ? game.players.findIndex((player) => player.id === keyFigure.id) + 1 : null;

  return (
    <div className="modal-backdrop" role="presentation">
      <section className="winner-modal framed-panel" role="dialog" aria-modal="true" aria-labelledby="winner-title">
        <button className="modal-close" onClick={onClose} aria-label="关闭结算弹窗"><X size={20} /></button>
        <p className="eyebrow">游戏结算</p>
        <h2 id="winner-title">恭喜{winnerName}获胜</h2>
        <p>{game.winReason}</p>
        <div className="identity-reveal">
          <strong>身份公布</strong>
          <p>违规操作者是{keyFigure ? `${keyFigure.nickname || keyFigure.name}（${keyFigureNumber}号）` : '暂无'}。</p>
          <p>迷雾方：{mistPlayers.length ? mistPlayers.join('、') : '暂无'}。</p>
          <p>{game.players.map((player, index) => `${index + 1}号 ${getRoleName(player.role, player.roleLabel)}`).join('；')}</p>
          {game.event?.truth && <p>事件真相：{game.event.truth}</p>}
        </div>
        <div className="modal-actions">
          <button className="start-game-button" onClick={onClose}>返回棋盘</button>
        </div>
      </section>
    </div>
  );
}
