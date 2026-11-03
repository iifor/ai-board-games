/** 用户要求减少动效（系统设置）：JS 驱动的动画直接跳到终态，与 global.css 里关掉 CSS 动画的规则一致 */
export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
