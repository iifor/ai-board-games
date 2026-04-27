import React from 'react';
import { X } from 'lucide-react';
import { getWinnerName } from '../utils/gameState';

export function HistoryModal({ logs, loading, error, onClose }) {
  return (
    <div className="modal-backdrop" role="presentation">
      <section className="history-modal framed-panel" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <button className="modal-close" onClick={onClose} aria-label="关闭历史弹窗"><X size={20} /></button>
        <p className="eyebrow">MATCH HISTORY</p>
        <h2 id="history-title">历史对局</h2>
        <div className="history-scroll">
          {loading && <p className="empty-discussion">正在读取历史对局...</p>}
          {error && <p className="stream-message">{error}</p>}
          {!loading && !error && !logs.length && <p className="empty-discussion">暂无历史 AI 对局。</p>}
          {!loading && !error && logs.map((record, index) => (
            <article className="history-item" key={record.filename || index}>
              <div className="history-head">
                <strong>{record.game?.id || `对局 ${index + 1}`}</strong>
                <time>{formatTime(record.savedAt)}</time>
              </div>
              <p>胜利阵营：{getWinnerName(record.game?.winner)}</p>
              <p>玩家：{(record.game?.players || []).map((player) => `${player.nickname || player.name || player.id}(${player.role || '未知'})`).join('、')}</p>
              <p>轮次：{(record.game?.rounds || []).map((round) => `第${round.number}轮 A${round.tally?.A || 0}/B${round.tally?.B || 0} ${round.consensus ? '共识成功' : '共识失败'}`).join('；')}</p>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
}

function formatTime(value) {
  if (!value) return '-';
  return new Date(value).toLocaleString();
}
