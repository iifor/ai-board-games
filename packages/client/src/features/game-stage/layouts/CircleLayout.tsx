import { useMemo, useRef, type CSSProperties } from 'react';
import { useElementSize } from '../../../hooks/useElementSize';
import { planFlight, type FlightPlan, type VoteFlight } from '../animation/ballotFlight';
import { BallotFlight } from '../components/BallotFlight';
import { SeatCard } from '../components/SeatCard';
import { SignupEffect } from '../components/SheriffSignup';
import { isAsleep } from '../utils';
import { fitRingBox, ringGeometry, seatAnchors, speechBox, type RingGeometry, type RingSize } from './ringGeometry';
import type { LayoutProps } from './types';
import './CircleLayout.css';

/** 立绘、座号与名牌的设计尺寸，同时用于碰撞检查与动效落点。 */
const SEAT_CARD: RingSize = { width: 144, height: 184 };
/** 量到容器尺寸之前（首帧、静态渲染）按这个比例摆放 */
const FALLBACK_BOX: RingSize = { width: 1320, height: 600 };

type RingVar = '--seat-scale' | '--ring-card-w' | '--ring-card-h' | '--ring-w' | '--ring-h' | '--speech-w' | '--speech-h';
type RingStyle = CSSProperties & Partial<Record<RingVar, string | number>>;

const percent = (value: number | undefined, total: number) => `${((value ?? 0) / total) * 100}%`;

function flightPlanOf(vote: VoteFlight | null, seats: readonly number[], geometry: RingGeometry, box: RingSize): FlightPlan | null {
  if (!vote || vote.timing.totalMs === 0) return null;
  const anchors = seatAnchors(seats, geometry);
  return planFlight(vote.ballots, vote.abstained, (seat) => anchors.get(seat) ?? null, { x: box.width / 2, y: box.height / 2 }, vote.timing);
}

/**
 * 环形布局：座位绕圆桌一圈（1 号在正上方，顺时针，按弧长等分），圆桌中央留给舞台内容。
 * 圆桌盒子由量到的舞台尺寸算出（高度占满、宽度按比例且不超过舞台，写进 --ring-w / --ring-h），
 * 椭圆半径再由盒子、座位数与卡片尺寸算出，放不下时整体缩小卡片。
 * 警长标记来自 view.extra；夜晚未行动的座位闭眼；计票时选票在座位之间飞行
 */
export function CircleLayout({ view, speaking, center, badges, period = 'day', vote = null, cue, cueSeq, signup, onSeatSelect, selectedSeat = null }: LayoutProps) {
  const sheriff = typeof view.extra.sheriff === 'number' ? view.extra.sheriff : null;
  const arenaRef = useRef<HTMLDivElement | null>(null);
  const arena = useElementSize(arenaRef);
  const box = useMemo(() => (arena ? fitRingBox(arena, 2.2) : FALLBACK_BOX), [arena]);
  const count = view.seats.length;
  const figureScale = Math.max(1, Math.min(1.5, box.height / 750));
  const geometry = useMemo(() => ringGeometry(count, box, {
    width: SEAT_CARD.width * figureScale, height: SEAT_CARD.height * figureScale,
  }, { minScale: 0.5 }), [count, box, figureScale]);
  const seatNumbers = useMemo(() => view.seats.map((seat) => seat.seat), [view.seats]);
  const flight = useMemo(() => flightPlanOf(vote, seatNumbers, geometry, box), [vote, seatNumbers, geometry, box]);
  const speech = speechBox(box, geometry);
  const ringStyle: RingStyle = {
    '--speech-w': `${speech.width}px`,
    '--speech-h': `${speech.height}px`,
    '--seat-scale': geometry.scale * figureScale,
    '--ring-card-w': `${geometry.card.width}px`,
    '--ring-card-h': `${geometry.card.height}px`,
    ...(arena ? { '--ring-w': `${box.width}px`, '--ring-h': `${box.height}px` } : {}),
  };
  return (
    <div className="circle-layout" ref={arenaRef}>
      <div className="circle-ring" style={ringStyle}>
        <div className="circle-table" aria-hidden="true" />
        {view.seats.map((seat, index) => {
          const position = geometry.seats[index];
          const seatBadges = [...(seat.seat === sheriff ? ['警长'] : []), ...(badges?.[seat.seat] ?? [])];
          return (
            <div key={seat.seat} className="circle-seat" data-seat={seat.seat} style={{ left: percent(position?.x, box.width), top: percent(position?.y, box.height) }}>
              <div className="circle-seat-card ui-fade-up" style={signup?.seat === seat.seat ? { position: 'relative', '--signup-duration': `${400 / signup.rate}ms` } as CSSProperties : undefined}>
                <SeatCard seat={seat} speaking={seat.seat === speaking} asleep={isAsleep(seat, speaking, period) && cue?.actor !== seat.seat && !cue?.targets.includes(seat.seat)} badges={seatBadges} variant="stack" onSelect={onSeatSelect} selected={seat.seat === selectedSeat}
                  cue={cue?.targets.includes(seat.seat) ? cue.kind : undefined} cueSeq={cueSeq} acting={cue?.actor === seat.seat} />
                {signup?.seat === seat.seat && <SignupEffect key={signup.seq} choice={signup} />}
              </div>
            </div>
          );
        })}
        <div className="circle-center">
          {center}
        </div>
        {vote && flight ? <BallotFlight key={vote.seq} plan={flight} /> : null}
      </div>
    </div>
  );
}
