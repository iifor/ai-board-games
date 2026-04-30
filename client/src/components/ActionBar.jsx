import React from 'react';
import { FileText, History, Pause, Play, RotateCcw } from 'lucide-react';

export function ActionBar({ paused, onHistory, onTogglePause, onBackground, onNextSentence }) {
  return (
    <footer className="action-bar">
      <button onClick={onHistory}><History size={30} />查看历史</button>
      <button onClick={onBackground}><FileText size={30} />事件背景</button>
      <button className="gold-action" onClick={onTogglePause}>
        {paused ? <Play size={34} /> : <Pause size={34} />}
        {paused ? '继续' : '暂停'}
      </button>
      <button className="blue-action" onClick={onNextSentence}>
        <RotateCcw size={34} />下一局
        <small>重新开始一局后端调度</small>
      </button>
    </footer>
  );
}
