import { useCallback, type PointerEvent } from 'react';
import { parallaxOffset, prefersReducedMotion } from '../animations';

interface ParallaxHandlers {
  readonly onPointerMove: (event: PointerEvent<HTMLElement>) => void;
  readonly onPointerLeave: (event: PointerEvent<HTMLElement>) => void;
}

/**
 * 指针视差：把指针相对容器中心的偏移写成容器上的 --px / --py（像素），背景层用它们做 transform；
 * 离开时清掉让 CSS 过渡归位。prefers-reduced-motion 下不写入，背景保持原位
 */
export function useParallax(strength = 10): ParallaxHandlers {
  const onPointerMove = useCallback((event: PointerEvent<HTMLElement>) => {
    if (prefersReducedMotion()) return;
    const element = event.currentTarget;
    const offset = parallaxOffset({ x: event.clientX, y: event.clientY }, element.getBoundingClientRect(), strength);
    element.style.setProperty('--px', `${offset.x}px`);
    element.style.setProperty('--py', `${offset.y}px`);
  }, [strength]);

  const onPointerLeave = useCallback((event: PointerEvent<HTMLElement>) => {
    event.currentTarget.style.removeProperty('--px');
    event.currentTarget.style.removeProperty('--py');
  }, []);

  return { onPointerMove, onPointerLeave };
}
