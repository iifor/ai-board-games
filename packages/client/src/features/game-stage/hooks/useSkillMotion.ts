import { useLayoutEffect, useRef, type RefObject } from 'react';
import { prefersReducedMotion } from '../animation/motion';
import { skillDuration } from '../animation/skillTiming';
import { skillKeyframes, type MotionPart } from '../animation/skillKeyframes';
import type { SkillCue } from '../animation/skillTypes';
import type { SkillRoute } from '../animation/skillPlan';
import type { SegmentControl } from '../playback/segment';

/** 一个片段的统一动画时钟：变速、重排、跳段、卸载都不留下旧轨迹。 */
export function useSkillMotion(root: RefObject<HTMLDivElement | null>, cue: SkillCue, routes: readonly SkillRoute[], control: SegmentControl | null) {
  const clock = useRef({ started: Date.now(), elapsed: 0, rate: control?.rate ?? 1 });
  useLayoutEffect(() => {
    const element = root.current;
    if (!element) return;
    const reduced = prefersReducedMotion();
    element.dataset['reducedMotion'] = String(reduced);
    if (reduced || !element.animate || control?.signal.aborted) return;
    const duration = skillDuration(cue);
    const animations: Animation[] = [];
    const time = () => clock.current.elapsed + (Date.now() - clock.current.started) * clock.current.rate;
    for (const node of element.querySelectorAll<HTMLElement | SVGElement>('[data-motion]')) {
      const part = node.dataset['motion']!;
      const route = routes.find((item) => item.key === node.dataset['route']);
      const frames = part === 'projectile' && route ? route.points.map((point, index) => ({
        offset: index / (route.points.length - 1), transform: `translate(${point.x}px, ${point.y}px)`, opacity: index === 0 || index === route.points.length - 1 ? 0 : 1,
      })) : skillKeyframes(part as MotionPart, cue.stage === 'result', Number(node.dataset['dx'] ?? 0), Number(node.dataset['dy'] ?? 0));
      const animation = node.animate(frames, { duration: part === 'projectile' ? duration * .4 : duration,
        delay: part === 'projectile' ? duration * .14 + (route?.delay ?? 0) : 0, fill: 'both', easing: 'linear' });
      animation.playbackRate = clock.current.rate;
      animation.currentTime = Math.min(time(), duration);
      animations.push(animation);
    }
    const change = () => {
      const rate = control?.rate ?? 1;
      if (rate === clock.current.rate) return;
      clock.current = { elapsed: time(), started: Date.now(), rate };
      for (const animation of animations) animation.updatePlaybackRate(rate);
    };
    const cancel = () => { for (const animation of animations) animation.cancel(); element.dataset['cancelled'] = 'true'; };
    const unsubscribe = control?.subscribe(change);
    control?.signal.addEventListener('abort', cancel, { once: true });
    return () => { unsubscribe?.(); control?.signal.removeEventListener('abort', cancel); for (const animation of animations) animation.cancel(); };
  }, [root, cue, routes, control]);
}
