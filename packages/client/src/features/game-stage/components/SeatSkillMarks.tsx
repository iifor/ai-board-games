import type { SkillMark } from '../animation/skillTypes';
import { SKILL_ART } from '../animation/skillArt';
import './SeatSkillMarks.css';

const prominent = (mark: SkillMark) => mark.kind === 'bond' || mark.kind === 'reveal' && /免于放逐/.test(mark.label);
const caption = (mark: SkillMark) => mark.kind === 'reveal' && /免于放逐/.test(mark.label) ? '已翻牌' : mark.label;

export function SeatSkillMarks({ marks }: { readonly marks: readonly SkillMark[] }) {
  if (!marks.length) return null;
  const featured = marks.filter(prominent);
  return <>
    {featured.length > 0 && <span className="seat-skill-backdrops" aria-hidden="true">{featured.map(mark =>
      <svg key={`${mark.kind}:${mark.label}`} className="seat-skill-emblem" data-kind={mark.kind}
        viewBox="0 0 48 48" style={{color:SKILL_ART[mark.kind][0]}}><path d={SKILL_ART[mark.kind][1]} /></svg>
    )}</span>}
    <span className="seat-skill-marks">{marks.map((mark) => <span key={`${mark.kind}:${mark.label}`}
    className="seat-skill-mark" data-prominent={prominent(mark) || undefined} data-kind={mark.kind}
    aria-label={mark.label} title={mark.label} style={{ color: SKILL_ART[mark.kind][0] }}>
    <svg viewBox="0 0 48 48" aria-hidden="true"><path d={SKILL_ART[mark.kind][1]} /></svg>
    {(prominent(mark) || /尾|命/.test(mark.label)) && <b>{caption(mark)}</b>}
  </span>)}</span></>;
}
