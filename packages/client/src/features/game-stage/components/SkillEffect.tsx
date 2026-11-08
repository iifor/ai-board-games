import type { CSSProperties } from 'react';
import type { SkillCue } from '../animation/skillCue';
import { SKILL_ART } from '../animation/skillArt';
import './SkillEffect.css';

export function SkillEffect({ cue, rate = 1 }: { readonly cue: SkillCue; readonly rate?: number }) {
  const [color, path] = SKILL_ART[cue.kind];
  const targets = cue.targets.filter(n => n !== cue.actor);
  const involved = [cue.actor === null ? null : `${cue.actor} 号`, targets.length ? targets.map(n => `${n} 号`).join('、') : null].filter(Boolean);
  return <div className="skill-effect" data-effect={cue.kind} style={{ '--fx-color': color, '--fx-time': `${590 / rate}ms` } as CSSProperties}>
    <div className="skill-emblem" aria-hidden="true">
      <i className="skill-wave" /><svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>
    </div>
    <strong>{cue.title}</strong>
    {involved.length > 0 && <span className="skill-seats">{involved.join(' → ')}</span>}
  </div>;
}
