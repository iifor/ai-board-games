import { StatusView } from '../../../components/StatusView';
import './StageError.css';

interface StageErrorProps {
  readonly message: string;
  /** 自动重连放弃后给出的手动重试；服务端报错导致的终止没有重试 */
  readonly onRetry: (() => void) | null;
}

/** 舞台上方的错误面板：连接中断（可重试）或服务端报错 */
export function StageError({ message, onRetry }: StageErrorProps) {
  return (
    <div className="stage-error glass-panel">
      {onRetry ? <StatusView kind="error" message={message} onRetry={onRetry} /> : <StatusView kind="error" message={message} />}
    </div>
  );
}
