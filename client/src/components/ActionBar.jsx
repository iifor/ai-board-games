import React from 'react';
import { ChevronsRight, FileText, History, Pause, Play } from 'lucide-react';

export function ActionBar({ paused, mockMode, onHistory, onTogglePause, onExile, onNextStage }) {
  return (
    <footer className="action-bar">
      <button onClick={onHistory}><History size={30} />查看历史</button>
      <button className="gold-action" onClick={onTogglePause}>
        {paused ? <Play size={34} /> : <Pause size={34} />}
        {paused ? '继续' : '暂停'}
      </button>
      <button onClick={onExile}>
        <FileText size={30} />阶段信息
      </button>
      <button className="blue-action" onClick={onNextStage} disabled={!mockMode}>
        <ChevronsRight size={38} />下一阶段
        <small>{mockMode ? '输出当前阶段信息' : '真实模式由 AI 推送推进'}</small>
      </button>
    </footer>
  );
}
