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
      // 狼人刀口：只展示座位号
      return <b>{badge.targetLabel}</b>;

    case 'antidote':
      return badge.use
        ? '救'
        : '不救';

    case 'poison':
      return badge.use
        ? <b>{badge.targetLabel}</b>
        : '不毒';

    case 'seer':
      // 预言家：只展示查验座位号，C端不展示狼人/好人结果
      return <b>{badge.targetLabel}</b>;

    case 'guard':
      // 守卫：展示守护目标
      return <b>{badge.targetLabel}</b>;

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
