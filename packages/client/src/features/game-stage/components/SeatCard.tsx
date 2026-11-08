import type { AudienceSeat } from '@battle/shared';
import { Avatar } from '../../../components/Avatar';
import { RingSeatFigure } from './RingSeatFigure';
import { SeatSpotlight } from './SeatSpotlight';
import type { SeatSelectHandler } from '../types';
import './SeatCard.css';
import './SeatCardButton.css';
import { SKILL_ART } from '../animation/skillArt';
import type { SkillKind } from '../animation/skillCatalog';
import type { CSSProperties } from 'react';
import './SeatSignals.css';

interface SeatCardProps {
  readonly cue?: SkillKind | undefined;
  readonly cueSeq?: number | undefined;
  readonly acting?: boolean;
  readonly seat: AudienceSeat;
  readonly speaking: boolean;
  /** 夜晚未行动的存活玩家使用较暗的立绘。 */
  readonly asleep?: boolean | undefined;
  readonly badges?: readonly string[];
  /** stack：头像在上名字在下（环形布局）；row：横向（对垒布局） */
  readonly variant?: 'row' | 'stack';
  /** 悬浮或键盘聚焦时显示座位资料。 */
  readonly onSelect?: SeatSelectHandler | undefined;
  /** 当前显示资料的座位。 */
  readonly selected?: boolean | undefined;
}

/**
 * 座位卡片：海报头像、名字、身份（可见时）、存活状态；正在发言时亮起光环，夜晚闭眼，出局后盖"出局"戳。
 * 鼠标悬浮与键盘聚焦可以预览座位资料。
 */
export function SeatCard({ seat, speaking, asleep = false, badges = [], variant = 'row', onSelect, selected = false, cue, cueSeq, acting }: SeatCardProps) {
  const classes = ['seat-card', `seat-card-${variant}`, 'seat-card-trigger', speaking ? 'seat-card-speaking' : '', asleep ? 'seat-card-asleep' : '', seat.alive ? '' : 'seat-card-out', selected ? 'is-selected' : '']
    .filter(Boolean)
    .join(' ');
  const onRing = variant === 'stack';
  return (
    <span
      role="group"
      tabIndex={onSelect ? 0 : undefined}
      className={classes}
      aria-label={speaking ? `${seat.label}，正在发言` : seat.label}
      data-team={seat.team ?? undefined}
      data-seat-trigger={seat.seat}
      data-effect-target={cue}
      data-acting={acting || undefined}
      style={cue ? { '--fx-color': SKILL_ART[cue][0] } as CSSProperties : undefined}
      aria-details={selected ? 'seat-profile' : undefined}
      onPointerEnter={(event) => { if (event.pointerType !== 'touch') onSelect?.(seat.seat, event.currentTarget); }}
      onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) onSelect?.(seat.seat, event.currentTarget); }}
    >
      {onRing && speaking && <SeatSpotlight />}
      {onRing ? (
        <RingSeatFigure seat={seat} badges={badges} />
      ) : (
        <>
          <Avatar className="seat-card-avatar" variant="portrait" name={seat.name} avatar={seat.avatar} fallback={String(seat.seat)}>
            <b className="seat-card-no">{seat.seat}</b>
          </Avatar>
          <span className="seat-card-body">
            <strong><span>{seat.name}</span></strong>
            <span className="seat-card-role">
              {seat.roleName ?? '身份未知'}{seat.position === null ? '' : ` · ${seat.position}号位`}
            </span>
            {badges.length ? <span className="seat-card-badges">{badges.map((badge) => <em key={badge} className="ui-pill">{badge}</em>)}</span> : null}
          </span>
        </>
      )}
      {speaking && !onRing && <span className="seat-mic" aria-hidden="true"><i /><i /><i /></span>}
      {cue && <span key={cueSeq} className="seat-impact" data-effect={cue} aria-label="技能目标" />}
      {seat.alive ? null : <span className="seat-card-stamp" aria-label="出局">出局</span>}
    </span>
  );
}
