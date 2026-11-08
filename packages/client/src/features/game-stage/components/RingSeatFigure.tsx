import type { AudienceSeat } from '@battle/shared';
import { PlayerFigure } from './PlayerFigure';
import { SignupBadge } from './SheriffSignup';

/** 圆桌座位从上到下显示公开身份、人物、座号站台和自定义名字。 */
export function RingSeatFigure({ seat, badges }: { readonly seat: AudienceSeat; readonly badges: readonly string[] }) {
  const generatedName = `${String(seat.seat).padStart(2, '0')} 号模拟玩家`;
  return <>
    <span className="ring-seat-head">
      {seat.roleName && <span className="ring-seat-role">{seat.roleName}</span>}
      {badges.map((badge) => badge === '上警' ? <SignupBadge key={badge} /> : <em key={badge}>{badge}</em>)}
    </span>
    <span className="seat-figure"><PlayerFigure seat={seat} className="seat-figure-art" /></span>
    <b className="ring-seat-platform">{seat.seat} 号</b>
    {seat.name !== generatedName && <span className="ring-seat-name">{seat.name}</span>}
  </>;
}
