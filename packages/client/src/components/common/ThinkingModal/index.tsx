import type { Player } from '../../../types';
import './index.css';

interface ThinkingModalProps {
  visible: boolean;
  player?: Player | null;
  thinking?: string;
}

export function ThinkingModal({ visible, player, thinking = '' }: ThinkingModalProps) {
  if (!visible) return null;

  const name = player?.nickname || player?.name || `${player?.id || ''}号`;
  const isWaiting = !thinking;

  return (
    <div className="thinking-backdrop" role="presentation">
      <div className="thinking-dialog" role="dialog" aria-modal="true" aria-label={`${name}正在思考`}>
        <div className="thinking-header">
          <span />
          <strong>{name} 推理中</strong>
        </div>
        {isWaiting ? (
          <p className="thinking-waiting">正在分析赛况...</p>
        ) : (
          <div className="thinking-body">
            <pre className="thinking-text">{thinking}</pre>
          </div>
        )}
      </div>
    </div>
  );
}
