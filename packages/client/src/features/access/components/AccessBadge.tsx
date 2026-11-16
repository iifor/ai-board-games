import type { StoredAccess } from '../types';
import { accessSummary } from '../utils';
import './AccessBadge.css';

interface AccessBadgeProps {
  readonly access: StoredAccess;
  readonly onSignOut: () => void;
}

/** 当前使用的身份码持有人与剩余局数，可退出换一个码 */
export function AccessBadge({ access, onSignOut }: AccessBadgeProps) {
  return (
    <div className="access-badge ui-pill" role="status">
      <span>身份码：{accessSummary(access)}</span>
      <button type="button" className="access-badge-exit" onClick={onSignOut}>退出</button>
    </div>
  );
}
