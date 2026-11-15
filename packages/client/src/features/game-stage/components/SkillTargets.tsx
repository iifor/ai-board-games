import { SKILL_ART } from '../animation/skillArt';
import { resultPosition, skillRecipients } from '../animation/skillPlan';
import type { SeatAnchor, SkillCue } from '../animation/skillTypes';
import type { SeatAnchors } from '../hooks/useSeatAnchors';
import { SkillRelease } from './SkillRelease';

function Glyph({ kind }: { readonly kind: SkillCue['kind'] }) {
  return <svg viewBox="0 0 48 48" aria-hidden="true"><path d={SKILL_ART[kind][1]} /></svg>;
}

function Target({ cue, seat, at, bounds }: { readonly cue: SkillCue; readonly seat: number; readonly at: SeatAnchor; readonly bounds: SeatAnchors }) {
  const labelWidth = bounds.width < 650 ? 112 : 190;
  const position = resultPosition(at, bounds, labelWidth);
  const text = cue.route === 'area' ? null : cue.feedback ?? (cue.stage === 'cast' ? cue.title : null);
  return <>
    <div className="skill-target" data-target={seat} style={{ left: at.x, top: at.y, width: at.width, height: at.height }}>
      <div className="skill-impact" data-motion="impact">
        <span className="skill-aura" /><span className="skill-scan" />
        <span className="skill-emblem"><Glyph kind={cue.kind} /></span>
        {cue.kind === 'blade' && <span className="skill-claws"><i /><i /><i /></span>}
        {cue.kind === 'blast' && <span className="skill-cracks">✧</span>}
      </div>
      {Array.from({ length: 8 }, (_, i) => <i key={i} className="skill-particle" data-motion="particle"
        data-dx={Math.cos(i * Math.PI / 4) * at.width * .6}
        data-dy={cue.kind === 'heal' ? -at.height * (.35 + i * .05) : Math.sin(i * Math.PI / 4) * at.height * .55} />)}
    </div>
    {text && <div className="skill-result-anchor" data-side={position.x >= at.x ? 'right' : 'left'} style={{ left: position.x, top: position.y, width: labelWidth }}>
      <span className="skill-result" data-motion="result" data-tone={cue.tone} data-result-for={seat}>{text}</span>
    </div>}
  </>;
}

export function SkillTargets({ cue, anchors }: { readonly cue: SkillCue; readonly anchors: SeatAnchors }) {
  const sources = cue.sources ?? (cue.actor === null ? [] : [cue.actor]);
  const targets = skillRecipients(cue);
  return <>
    {cue.thaw && <SkillRelease seats={cue.thaw} anchors={anchors} />}
    {sources.map((seat) => {
      const at = anchors.seats.get(seat);
      return at && <div key={`s${seat}`} className="skill-source" data-source={seat} style={{ left: at.x, top: at.y }}>
        <span data-motion="source"><Glyph kind={cue.kind} /></span>
      </div>;
    })}
    {targets.map((seat) => {
      const at = anchors.seats.get(seat);
      return at && <Target key={seat} cue={cue} seat={seat} at={at} bounds={anchors} />;
    })}
    {!targets.length && cue.actor === null && <div className="skill-wide-wave" data-motion="wave" />}
    {(!targets.length || cue.route === 'area') && cue.feedback && <div className="skill-global-result"><span data-motion="result">{cue.route === 'area' && targets.length ? '范围结果 · ' : ''}{cue.feedback}</span></div>}
  </>;
}
