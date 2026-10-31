import './StatusView.css';

interface StatusViewProps {
  readonly kind: 'loading' | 'error' | 'empty';
  readonly message?: string;
  readonly onRetry?: () => void;
}

const DEFAULT_MESSAGES: Readonly<Record<StatusViewProps['kind'], string>> = {
  loading: '加载中…',
  error: '加载失败',
  empty: '暂无内容',
};

/** 统一的加载中 / 出错 / 空状态 */
export function StatusView({ kind, message, onRetry }: StatusViewProps) {
  return (
    <div className={`status-view status-view-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <p>{message ?? DEFAULT_MESSAGES[kind]}</p>
      {onRetry ? (
        <button type="button" className="button" onClick={onRetry}>
          重试
        </button>
      ) : null}
    </div>
  );
}
