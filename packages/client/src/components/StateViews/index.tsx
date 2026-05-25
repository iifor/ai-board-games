import './index.css';

export function LoadingView() {
  return (
    <main className="state-view">
      <div className="ornate-card">
        <p className="eyebrow">AI 桌游平台</p>
        <h1>正在生成对局</h1>
        <p>Express 后端正在准备玩家、议题和投票记录。</p>
      </div>
    </main>
  );
}

interface ErrorViewProps {
  message?: string;
  onRetry: () => void;
}

export function ErrorView({ message, onRetry }: ErrorViewProps) {
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
