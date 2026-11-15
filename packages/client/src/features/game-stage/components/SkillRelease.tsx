import type { SeatAnchors } from '../hooks/useSeatAnchors';

export function SkillRelease({ seats, anchors }: { readonly seats: readonly number[]; readonly anchors: SeatAnchors }) {
  return <>{seats.map((seat) => {
    const at = anchors.seats.get(seat);
    return at && <span key={seat} className="skill-thaw" data-thaw={seat} style={{ left: at.x, top: at.y }}>
      {Array.from({ length: 6 }, (_, i) => <i key={i} data-motion="particle" data-dx={Math.cos(i * Math.PI / 3) * at.width * .6} data-dy={Math.sin(i * Math.PI / 3) * at.height * .5} />)}
      <b data-motion="result">解冻</b>
    </span>;
  })}</>;
}
