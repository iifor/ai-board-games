import type { AudienceSeat } from '@battle/shared';
import { Avatar } from '../../../components/Avatar';
import { RingSeatFigure } from './RingSeatFigure';
import { SeatSpotlight } from './SeatSpotlight';
import { SeatSkillMarks } from './SeatSkillMarks';
import type { SkillMark } from '../animation/skillTypes';
import type { SeatSelectHandler } from '../types';
import './SeatCard.css';
import './SeatCardButton.css';
import { SKILL_ART } from '../animation/skillArt';
import type { SkillKind } from '../animation/skillCatalog';
import type { CSSProperties } from 'react';
import './SeatSignals.css';
import './SeatCardFigure.css';

interface SeatCardProps {
  readonly cue?: SkillKind | undefined;
  readonly cueSeq?: number | undefined;
  readonly acting?: boolean;
  readonly marks?: readonly SkillMark[];
  readonly seat: AudienceSeat;
  readonly speaking: boolean;
  /** 夜晚未行动的存活玩家使用较暗的立绘。 */
  readonly asleep?: boolean | undefined;
  readonly badges?: readonly string[];
  /** stack：圆桌人物；figure：辩论人物（手机紧凑显示）；row：横向头像。 */
  readonly variant?: 'row' | 'stack' | 'figure';
  readonly roleLabel?: string | undefined;
  /** 悬浮或键盘聚焦时显示座位资料。 */
  readonly onSelect?: SeatSelectHandler | undefined;
  /** 当前显示资料的座位。 */
  readonly selected?: boolean | undefined;
}

/**
 * 座位卡片：海报头像、名字、身份（可见时）、存活状态；正在发言时亮起光环，夜晚闭眼，出局后盖"出局"戳。
 * 鼠标悬浮与键盘聚焦可以预览座位资料。
 */
export function SeatCard({ seat, speaking, asleep = false, badges = [], variant = 'row', onSelect, selected = false, cue, cueSeq, acting, marks = [], roleLabel }: SeatCardProps) {
  const classes = ['seat-card', `seat-card-${variant}`, 'seat-card-trigger', speaking ? 'seat-card-speaking' : '', asleep ? 'seat-card-asleep' : '', seat.alive ? '' : 'seat-card-out', selected ? 'is-selected' : '']
    .filter(Boolean)
    .join(' ');
  const onRing = variant === 'stack';
  const figure = variant !== 'row';
  const identity = <>
    <Avatar className="seat-card-avatar" variant="portrait" name={seat.appearanceName ?? seat.name} avatar={seat.avatar} fallback={String(seat.seat)}>
      <b className="seat-card-no">{seat.seat}</b>
    </Avatar>
    <span className="seat-card-body">
      <strong title={seat.name}><span>{seat.name}</span></strong>
      <span className="seat-card-role">
        {roleLabel ?? `${seat.roleName ?? '身份未知'}${seat.position === null ? '' : ` · ${seat.position}号位`}`}
      </span>
      {badges.length ? <span className="seat-card-badges">{badges.map((badge) => <em key={badge} className="ui-pill">{badge}</em>)}</span> : null}
    </span>
  </>;
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
      {figure && (speaking || acting) && <SeatSpotlight />}
      {onRing && <SeatSkillMarks marks={marks} />}
      {figure ? (
        <>
          <RingSeatFigure seat={seat} badges={badges} roleLabel={roleLabel} />
          {variant === 'figure' && <span className="seat-card-compact">{identity}</span>}
        </>
      ) : (
        identity
      )}
      {speaking && !figure && <span className="seat-mic" aria-hidden="true"><i /><i /><i /></span>}
      {cue && !figure && <span key={cueSeq} className="seat-impact" data-effect={cue} aria-label="技能目标" />}
      {seat.alive ? null : <span className="seat-card-stamp" aria-label="出局">出局</span>}
    </span>
  );
}
