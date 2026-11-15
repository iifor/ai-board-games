import { arcControl, arcPoints } from './ballotFlight';
import type { SeatAnchor, SkillCue } from './skillTypes';
import type { RingPoint } from '../layouts/ringGeometry';

export interface SkillRoute {
  readonly key: string;
  readonly from: number;
  readonly to: number;
  readonly points: readonly RingPoint[];
  readonly path: string;
  readonly delay: number;
}

export function skillRecipients(cue: SkillCue): readonly number[] {
  if (cue.route === 'learn' && cue.actor !== null) return [cue.actor];
  if (cue.targets.length) return cue.targets;
  return cue.actor !== null && (cue.stage === 'result' || cue.route === 'shatter') ? [cue.actor] : [];
}

export function skillRoutes(cue: SkillCue, anchors: ReadonlyMap<number, SeatAnchor>, centre: RingPoint): readonly SkillRoute[] {
  const pairs: [number, number][] = [];
  if (cue.route === 'swap' && cue.targets.length === 2) {
    pairs.push([cue.targets[0]!, cue.targets[1]!], [cue.targets[1]!, cue.targets[0]!]);
  } else {
    const sources = cue.sources ?? (cue.actor === null ? [] : [cue.actor]);
    for (const source of sources) for (const target of cue.targets) {
      pairs.push(cue.route === 'learn' ? [target, source] : [source, target]);
    }
  }
  return pairs.flatMap(([from, to], index) => {
    const a = anchors.get(from), b = anchors.get(to);
    if (!a || !b || from === to) return [];
    const control = cue.kind === 'shot' || cue.kind === 'inspect' && cue.route !== 'area'
      ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } : arcControl(a, b, centre);
    return [{ key: `${from}-${to}`, from, to, points: arcPoints(a, b, control),
      path: `M ${a.x} ${a.y} Q ${control.x} ${control.y} ${b.x} ${b.y}`, delay: Math.min(index * 70, 350) }];
  });
}

/** 不覆盖脚底序号、头顶身份；结果在人物侧旁出现，限制在当前视口内。 */
export function resultPosition(anchor: SeatAnchor, bounds: { width: number; height: number }, labelWidth: number): RingPoint {
  const gap = anchor.width * .44;
  const right = anchor.x + gap + labelWidth / 2;
  const x = right + labelWidth / 2 < bounds.width ? right : anchor.x - gap - labelWidth / 2;
  return { x: Math.max(labelWidth / 2, Math.min(bounds.width - labelWidth / 2, x)),
    y: Math.max(36, Math.min(bounds.height - 36, anchor.y)) };
}
