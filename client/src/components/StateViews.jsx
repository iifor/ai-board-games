import React from 'react';

export function LoadingView() {
  return (
    <main className="state-view">
      <div className="ornate-card">
        <p className="eyebrow">Consensus Mist</p>
        <h1>正在生成对局</h1>
        <p>Express 后端正在准备玩家、议题和投票记录。</p>
      </div>
    </main>
  );
}

export function ErrorView({ message, onRetry }) {
  return (
    <main className="state-view">
      <div className="ornate-card">
        <p className="eyebrow">API Error</p>
        <h1>后端暂时没有响应</h1>
        <p>{message || '请确认已经执行 npm.cmd run dev。'}</p>
        <button className="gold-button" onClick={onRetry}>重试</button>
      </div>
    </main>
  );
}
