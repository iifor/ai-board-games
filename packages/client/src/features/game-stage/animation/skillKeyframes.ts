export type MotionPart = 'source' | 'path' | 'impact' | 'result' | 'particle' | 'wave';

export function skillKeyframes(part: MotionPart, resolved: boolean, dx = 0, dy = 0): Keyframe[] {
  if (part === 'path') return [
    { opacity: 0, strokeDashoffset: 1, offset: 0 }, { opacity: .9, strokeDashoffset: 1, offset: .14 },
    { opacity: .9, strokeDashoffset: 0, offset: .52 }, { opacity: 0, strokeDashoffset: 0, offset: .72 }, { opacity: 0, offset: 1 },
  ];
  if (part === 'result') return [
    { opacity: 0, transform: 'translateY(10px)', offset: 0 },
    { opacity: 0, transform: 'translateY(10px)', offset: resolved ? .18 : .58 },
    { opacity: 1, transform: 'translateY(0)', offset: resolved ? .45 : .82 }, { opacity: 1, transform: 'translateY(0)', offset: 1 },
  ];
  if (part === 'particle') return [
    { opacity: 0, transform: 'translate(0, 10px) scale(.2)', offset: 0 },
    { opacity: 0, transform: 'translate(0, 10px) scale(.2)', offset: .4 },
    { opacity: 1, transform: `translate(${dx * .3}px, ${dy * .3}px) scale(1)`, offset: .6 },
    { opacity: 0, transform: `translate(${dx}px, ${dy}px) scale(.2)`, offset: 1 },
  ];
  const start = part === 'source' ? 0 : resolved ? .05 : .4;
  return [
    { opacity: 0, transform: 'scale(.3)', offset: 0 },
    { opacity: 0, transform: 'scale(.3)', offset: start },
    { opacity: part === 'wave' ? .55 : 1, transform: 'scale(1)', offset: start + .2 },
    { opacity: 0, transform: `scale(${part === 'wave' ? 2 : 1.35})`, offset: .95 }, { opacity: 0, offset: 1 },
  ];
}
