import type { CSSProperties, ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
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
      // 女巫解药：用了解药 → ✅ 图标，不用 → ❌ 图标
      return badge.use
        ? <CheckCircle2 size={32} />
        : <XCircle size={32} />;

    case 'poison':
      // 女巫毒药：用了 → 展示目标序号，不用 → ❌ 图标
      return badge.use
        ? <b>{badge.targetLabel}</b>
        : <XCircle size={32} />;

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
