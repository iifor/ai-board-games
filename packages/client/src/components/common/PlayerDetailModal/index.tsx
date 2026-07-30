import type { Player } from '../../../types';
import { BaseModal, PlayerAvatar } from '../BaseModal';
import { resolvePlayerPoster } from '../../PlayerPosterSpotlight/posters';
import { getPlayerDisplayName } from '../../../utils/player';
import './index.css';

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
  const poster = resolvePlayerPoster(player, 'cutout');
  const visibleFields = fields.filter(({ label, value }) => label.trim() && value?.trim());

  return (
    <BaseModal
      onClose={onClose}
      backdropClassName={backdropClassName}
      dialogClassName={dialogClassName}
      closeClassName={closeClassName}
      ariaLabel={`${displayTitle}信息`}
    >
      <div className="player-detail-layout">
        <div className="player-detail-portrait" aria-label={`${displayTitle}人物形象`}>
          <PlayerAvatar player={player} className="player-detail-avatar" fallback={displayTitle} />
          {poster && (
            <img
              className="player-detail-cutout"
              src={poster}
              alt=""
              onError={(event) => {
                event.currentTarget.hidden = true;
              }}
            />
          )}
        </div>
        <div className="player-detail-content">
          <header className="player-detail-head">
            <h3>{displayTitle}</h3>
            {subtitle?.trim() && <p>{subtitle}</p>}
          </header>
          <section className="player-detail-section" aria-labelledby="player-profile-title">
            <h4 id="player-profile-title">玩家资料</h4>
            <dl>
              <div><dt>性别</dt><dd>{player.sex?.trim() || '未设置'}</dd></div>
              <div><dt>性格</dt><dd>{player.personality?.trim() || '未设置'}</dd></div>
            </dl>
          </section>
          {visibleFields.length > 0 && (
            <section className="player-detail-section" aria-labelledby="player-match-title">
              <h4 id="player-match-title">本局信息</h4>
              <dl>
                {visibleFields.map((field) => (
                  <div key={field.label}>
                    <dt>{field.label}</dt>
                    <dd>{field.value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          )}
        </div>
      </div>
    </BaseModal>
  );
}
