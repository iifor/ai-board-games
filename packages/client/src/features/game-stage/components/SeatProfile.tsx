import type { AudienceSeat } from '@battle/shared';
import { Avatar } from '../../../components/Avatar';
import type { SeatSpeech } from '../types';
import { KIND_LABELS, teamLabel } from '../utils';
import './SeatPopover.css';

interface SeatProfileProps {
  readonly seat: AudienceSeat;
  /** 这个座位已播放的公开发言与判定（utils 的 speechesOfSeat） */
  readonly speeches: readonly SeatSpeech[];
  /** 名字元素的 id，供外层容器用 aria-labelledby 引用 */
  readonly nameId: string;
}

/** 座位资料：大头像、名字、座位、观众可见的身份 / 阵营、存活状态，以及本局的公开发言与判定。桌面弹层与手机抽屉共用 */
export function SeatProfile({ seat, speeches, nameId }: SeatProfileProps) {
  return (
    <>
      <header className="seat-popover-head">
        <Avatar className="seat-popover-avatar" variant="portrait" name={seat.appearanceName ?? seat.name} avatar={seat.avatar} fallback={String(seat.seat)}>
          <b className="seat-popover-no">{seat.seat}</b>
        </Avatar>
        <div className="seat-popover-identity">
          <strong id={nameId}>{seat.name}</strong>
          {seat.modelKey && seat.modelKey !== seat.name && <small className="seat-popover-model">{seat.modelKey}</small>}
          <span className="seat-popover-meta">
            <em className="ui-pill ui-pill-soft">{seat.seat} 号{seat.position === null ? '' : ` · ${seat.position}号位`}</em>
            <em className="ui-pill ui-pill-accent">{seat.roleName ?? '身份未知'}</em>
            {seat.team ? <em className="ui-pill seat-popover-team">{teamLabel(seat.team)}</em> : null}
            <em className={`ui-pill ${seat.alive ? 'ui-pill-outline' : 'seat-popover-out'}`}>{seat.alive ? '存活' : '出局'}</em>
          </span>
        </div>
      </header>
      <div className="seat-popover-details" role="group" aria-label={seat.persona ? '人设与本局发言' : '本局发言'} tabIndex={0}>
        {seat.persona && <p className="seat-popover-persona">{seat.persona}</p>}
        <ol className="seat-popover-speeches">
          {speeches.map((speech) => (
            <li key={speech.seq} className={`seat-popover-${speech.kind}`}>
              <small>{speech.title} · {KIND_LABELS[speech.kind]}</small>
              <p>{speech.text}</p>
            </li>
          ))}
          {speeches.length === 0 ? <li className="seat-popover-empty">还没有公开发言</li> : null}
        </ol>
      </div>
    </>
  );
}
