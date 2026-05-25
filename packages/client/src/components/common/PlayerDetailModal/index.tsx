import type { Player } from '../../../types';
import { BaseModal, PlayerAvatar } from '../BaseModal';
import { getPlayerDisplayName } from '../../../utils/player';

interface PlayerDetailField {
  label: string;
  value?: string;
}

interface PlayerDetailModalProps {
  player?: Player | null;
  title?: string;
  subtitle?: string;
  fields?: PlayerDetailField[];
  onClose?: () => void;
  backdropClassName?: string;
  dialogClassName?: string;
  closeClassName?: string;
}

export function PlayerDetailModal({
  player,
  title,
  subtitle,
  fields = [],
  onClose,
  backdropClassName = 'player-detail-backdrop',
  dialogClassName = 'player-detail-modal',
  closeClassName = 'player-detail-close'
}: PlayerDetailModalProps) {
  if (!player) return null;
  const displayTitle = title || getPlayerDisplayName(player);
  return (
    <BaseModal
      onClose={onClose}
      backdropClassName={backdropClassName}
      dialogClassName={dialogClassName}
      closeClassName={closeClassName}
      ariaLabel={`${displayTitle}信息`}
    >
      <div className="player-detail-head">
        <PlayerAvatar player={player} className="player-detail-avatar" fallback={displayTitle} />
        <div>
          <h3>{displayTitle}</h3>
          {subtitle && <p>{subtitle}</p>}
        </div>
      </div>
      <dl>
        {fields.filter((field) => field && field.label).map((field) => (
          <div key={field.label}>
            <dt>{field.label}</dt>
            <dd>{field.value || '-'}</dd>
          </div>
        ))}
      </dl>
    </BaseModal>
  );
}
