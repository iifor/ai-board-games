import type { CSSProperties, ReactNode } from 'react';
import type { NightBadge } from '../../../../types';
import { classNames } from '../../../../utils/classNames';

interface WerewolfNightActionBadgeProps {
  badge: NightBadge;
}

export function WerewolfNightActionBadge({ badge }: WerewolfNightActionBadgeProps) {
  return (
    <span
      className={classNames('werewolf-night-action-badge', badge.kind, badge.theme?.className)}
      style={badge.theme?.style as CSSProperties}
      title={badge.title}
    >
      {renderNightActionBadgeContent(badge)}
    </span>
  );
}

function renderNightActionBadgeContent(badge: NightBadge): ReactNode {
  switch (badge.kind) {
    case 'wolf':
    case 'guard':
    case 'antidote':
    case 'poison':
      return renderActionTarget(badge);
    case 'seer':
      return (
        <>
          {renderActionTarget(badge)}
          {badge.result && <em>{badge.result}</em>}
        </>
      );
    default:
      return renderActionTarget(badge);
  }
}

function renderActionTarget(badge: NightBadge): ReactNode {
  return (
    <>
      {badge.prefix && <b>{badge.prefix}</b>}
      {badge.target && <b>{badge.targetLabel || badge.target}</b>}
      {!badge.target && badge.label && <b>{badge.label}</b>}
    </>
  );
}
