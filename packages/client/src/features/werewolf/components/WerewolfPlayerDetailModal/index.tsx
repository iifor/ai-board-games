import { PlayerDetailModal } from '../../../../components/common/PlayerDetailModal';
import type { Player } from '../../../../types';
import { ROLE_NAMES } from '../../constants';
import { getRoleDescription } from '../../utils';

interface WerewolfPlayerDetailModalProps {
  player: Player;
  roleVisible: boolean;
  onClose: () => void;
}

export function WerewolfPlayerDetailModal({
  player,
  roleVisible,
  onClose,
}: WerewolfPlayerDetailModalProps) {
  const roleText = roleVisible
    ? (ROLE_NAMES[player.roleLabel || '']
      || player.roleLabel
      || ROLE_NAMES[player.role || '']
      || '未知身份')
    : '';
  const fields = [
    ...(roleVisible
      ? [
        { label: '本局身份', value: roleText },
        { label: '身份说明', value: getRoleDescription(player, true) },
      ]
      : []),
    ...(player.alive === undefined
      ? []
      : [{
        label: '状态',
        value: player.alive
          ? '存活'
          : `${player.deathReason || '出局'}${player.deathDay ? ` · 第 ${player.deathDay} 天` : ''}`,
      }]),
  ];

  return <PlayerDetailModal player={player} fields={fields} onClose={onClose} />;
}
