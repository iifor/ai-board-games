import { formatAvatarUrl } from '../../../../utils/avatar';
import { classNames } from '../../../../utils/classNames';
import { ROLE_NAMES } from '../../constants';
import { getRoleDescription } from '../../utils';
import type { Player } from '../../../../types';
import '../../WerewolfGame/index.css';

interface WerewolfPlayerDetailModalProps {
  player: Player;
  roleVisible: boolean;
  onClose: () => void;
}

export function WerewolfPlayerDetailModal({ player, roleVisible, onClose }: WerewolfPlayerDetailModalProps) {
  const roleText = roleVisible ? (ROLE_NAMES[player.roleLabel || ''] || player.roleLabel || ROLE_NAMES[player.role || ''] || '未知身份') : '身份隐藏';
  const dangerRole = roleVisible && (player.role === 'werewolf' || player.faction === 'wolves');
  return (
    <div className="player-detail-backdrop" role="presentation" onClick={onClose}>
      <section className="player-detail-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="player-detail-close" onClick={onClose} aria-label="关闭">×</button>
        <div className="player-detail-head">
          <div className="player-detail-avatar" style={player.avatar ? { backgroundImage: `url("${formatAvatarUrl(player.avatar)}")` } : undefined}>
            {!player.avatar && (player.nickname || player.name || `${player.id}`).slice(0, 1)}
          </div>
          <div>
            <h3>{player.nickname || player.name || `${player.id}号`}</h3>
            <p className={classNames(dangerRole && 'danger')}>{roleText}</p>
          </div>
        </div>
        <dl>
          <div><dt>性格</dt><dd>{player.personality || '暂无'}</dd></div>
          <div><dt>本局身份</dt><dd className={classNames(dangerRole && 'danger')}>{roleText}</dd></div>
          <div><dt>身份说明</dt><dd>{getRoleDescription(player, roleVisible)}</dd></div>
          <div><dt>状态</dt><dd>{player.alive ? '存活' : `${player.deathReason || '出局'} · 第 ${player.deathDay || '?'} 天`}</dd></div>
        </dl>
      </section>
    </div>
  );
}
