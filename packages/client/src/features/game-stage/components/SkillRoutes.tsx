import { SKILL_ART } from '../animation/skillArt';
import type { SkillRoute } from '../animation/skillPlan';
import type { SkillCue } from '../animation/skillTypes';

export function SkillRoutes({ cue, routes }: { readonly cue: SkillCue; readonly routes: readonly SkillRoute[] }) {
  return <svg className="skill-routes" aria-hidden="true">
    {routes.map((route) => <g key={route.key} data-from={route.from} data-to={route.to}>
      <path className="skill-route-glow" d={route.path} pathLength="1" data-motion="path" />
      <path className="skill-route-core" d={route.path} pathLength="1" data-motion="path" />
      <g className="skill-projectile" data-motion="projectile" data-route={route.key}>
        <rect className="skill-projectile-card" x="-15" y="-20" width="30" height="40" rx="4" />
        <circle r={cue.kind === 'shot' ? 5 : 12} />
        <g transform="translate(-14 -14) scale(.58)"><path className="skill-projectile-icon" d={SKILL_ART[cue.kind][1]} /></g>
      </g>
    </g>)}
  </svg>;
}
