import type { AudienceSeat } from '@battle/shared';
import { PlayerFigure } from './PlayerFigure';
import { SignupBadge } from './SheriffSignup';
import './RingSeatFigure.css';

/** 人物席位从上到下显示公开身份/辩位、人物、座号站台和自定义名字。 */
export function RingSeatFigure({ seat, badges, roleLabel }: { readonly seat: AudienceSeat; readonly badges: readonly string[]; readonly roleLabel?: string | undefined }) {
  const generatedName = `${String(seat.seat).padStart(2, '0')} 号模拟玩家`;
  return <>
    <span className="ring-seat-head">
      {(roleLabel ?? seat.roleName) && <span className="ring-seat-role">{roleLabel ?? seat.roleName}</span>}
      {badges.map((badge) => badge === '上警' ? <SignupBadge key={badge} /> : <em key={badge}>{badge}</em>)}
    </span>
    <span className="seat-figure"><PlayerFigure seat={seat} className="seat-figure-art" size="figure" /></span>
    <b className="ring-seat-platform">{seat.seat} 号</b>
    {seat.name !== generatedName && seat.name.replace(/\s/g, '') !== seat.seat + '号' && <span className="ring-seat-name" title={seat.name}>{seat.name}</span>}
  </>;
}
