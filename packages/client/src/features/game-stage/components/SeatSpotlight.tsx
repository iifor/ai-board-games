import './SeatSpotlight.css';

/** 灯光只装饰发言者原座位，不改变人物尺寸和鼠标悬浮区域。 */
export function SeatSpotlight() {
  return <span className="seat-spotlight" aria-hidden="true">
    <span className="seat-spotlight-beam" />
    <span className="seat-spotlight-floor" />
  </span>;
}
