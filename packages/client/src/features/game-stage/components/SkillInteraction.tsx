import { useMemo, useRef, type CSSProperties } from 'react';
import { SKILL_ART } from '../animation/skillArt';
import { skillRoutes } from '../animation/skillPlan';
import type { SkillCue } from '../animation/skillTypes';
import type { SeatAnchors } from '../hooks/useSeatAnchors';
import { useSkillMotion } from '../hooks/useSkillMotion';
import type { SegmentControl } from '../playback/segment';
import { SkillRoutes } from './SkillRoutes';
import { SkillTargets } from './SkillTargets';
import './SkillInteraction.css';
import './SkillImpact.css';

interface Props {
  readonly cue: SkillCue;
  readonly anchors: SeatAnchors;
  readonly control: SegmentControl | null;
}

export function SkillInteraction({ cue, anchors, control }: Props) {
  const root = useRef<HTMLDivElement>(null);
  const routes = useMemo(() => skillRoutes(cue, anchors.seats, { x: anchors.width / 2, y: anchors.height / 2 }), [cue, anchors]);
  useSkillMotion(root, cue, routes, control);
  return <div ref={root} className="skill-interaction" data-skill={cue.kind} data-stage={cue.stage ?? 'cast'}
    data-route-kind={cue.route} aria-hidden="true" style={{ '--skill-color': SKILL_ART[cue.kind][0] } as CSSProperties}>
    <SkillRoutes cue={cue} routes={routes} />
    <SkillTargets cue={cue} anchors={anchors} />
  </div>;
}
