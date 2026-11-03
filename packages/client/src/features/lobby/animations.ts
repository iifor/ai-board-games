// 大厅 / 开局的 JS 动效：纯计算（轨迹、时长、视差偏移）与基于 Web Animations API 的执行分开，
// 执行部分在 prefers-reduced-motion 下一律不动（返回 0），CSS 动画由 global.css 统一关闭。

export interface Box {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface FlightOptions {
  /** 起飞前的等待（ms），多个同时起飞时用来错峰 */
  readonly delay?: number;
  /** 固定飞行时长（ms）；不给则按距离估算 */
  readonly duration?: number;
  /** 弧线抬起的高度 = 距离 × arc；0 为直线 */
  readonly arc?: number;
}

export interface FadeOptions {
  readonly delay?: number;
  readonly duration?: number;
}

export const FLIGHT_EASING = 'cubic-bezier(0.3, 0.1, 0.2, 1)';
const FLIGHT_STEPS = 14;
const FLIGHT_MIN = 280;
const FLIGHT_MAX = 560;
const FADE_DURATION = 200;

export function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** 能跑 JS 动效：有 DOM、浏览器支持 WAAPI、用户没有要求减少动效 */
function canAnimate(): boolean {
  return typeof document !== 'undefined' && typeof Element !== 'undefined' && typeof Element.prototype.animate === 'function' && !prefersReducedMotion();
}

export function distanceBetween(from: Box, to: Box): number {
  return Math.hypot(to.left - from.left, to.top - from.top);
}

/** 飞行时长按距离估算：短距离也要看得清，长距离不至于拖沓 */
export function flightDuration(distance: number): number {
  return Math.round(Math.min(FLIGHT_MAX, Math.max(FLIGHT_MIN, 200 + distance * 0.45)));
}

/** 二次贝塞尔弧线上的等分采样点：从原点到 (dx, dy)，中点向上抬起 lift；首尾一定落在端点上 */
export function arcPoints(dx: number, dy: number, lift: number, steps: number): readonly Point[] {
  const control = { x: dx / 2, y: dy / 2 - lift };
  return Array.from({ length: steps + 1 }, (_, index) => {
    const t = index / steps;
    const rest = 1 - t;
    return {
      x: 2 * rest * t * control.x + t * t * dx,
      y: 2 * rest * t * control.y + t * t * dy,
    };
  });
}

/** 飞行关键帧：克隆体从 from 的位置、尺寸出发，沿弧线移动并缩放到 to（transform-origin 必须是左上角） */
export function flightKeyframes(from: Box, to: Box, arc = 0.18): Keyframe[] {
  const dx = to.left - from.left;
  const dy = to.top - from.top;
  const scale = from.width > 0 ? to.width / from.width : 1;
  const points = arcPoints(dx, dy, distanceBetween(from, to) * arc, FLIGHT_STEPS);
  return points.map((point, index) => {
    const t = index / FLIGHT_STEPS;
    return { offset: t, transform: `translate(${point.x.toFixed(2)}px, ${point.y.toFixed(2)}px) scale(${(1 + (scale - 1) * t).toFixed(4)})` };
  });
}

/** 视差偏移：指针离容器中心越远，背景向反方向挪得越多，最多 strength 像素 */
export function parallaxOffset(pointer: Point, rect: Box, strength: number): Point {
  if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
  const nx = Math.max(-1, Math.min(1, ((pointer.x - rect.left) / rect.width) * 2 - 1));
  const ny = Math.max(-1, Math.min(1, ((pointer.y - rect.top) / rect.height) * 2 - 1));
  // + 0：把 -0 归成 0，写进 CSS 与测试里都更干净
  return { x: Math.round(-nx * strength * 100) / 100 + 0, y: Math.round(-ny * strength * 100) / 100 + 0 };
}

function boxOf(rect: DOMRect): Box {
  return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
}

/** 把元素的克隆体固定在它当前的视口位置上（挂到 body，避免被 backdrop-filter 等祖先改变定位基准），保留游戏强调色 */
function ghostOf(element: HTMLElement, box: Box): HTMLElement {
  const ghost = element.cloneNode(true) as HTMLElement;
  const game = element.closest<HTMLElement>('[data-game]')?.dataset['game'];
  if (game) ghost.dataset['game'] = game;
  ghost.classList.add('ui-ghost');
  ghost.setAttribute('aria-hidden', 'true');
  Object.assign(ghost.style, {
    position: 'fixed', left: `${box.left}px`, top: `${box.top}px`, width: `${box.width}px`, height: `${box.height}px`,
    margin: '0', zIndex: '60', pointerEvents: 'none', transformOrigin: '0 0',
  });
  document.body.append(ghost);
  return ghost;
}

function runAndDispose(ghost: HTMLElement, keyframes: Keyframe[], options: KeyframeAnimationOptions): void {
  const animation = ghost.animate(keyframes, { easing: FLIGHT_EASING, fill: 'both', ...options });
  const dispose = () => ghost.remove();
  animation.finished.then(dispose, dispose);
}

/**
 * 让 fromEl 的克隆体飞到 toEl 的位置与尺寸上（原元素不动）。
 * 返回落地时刻（delay + duration，ms），调用方据此安排落地后的进场动画；不能动效时返回 0
 */
export function flyTo(fromEl: HTMLElement, toEl: HTMLElement, options: FlightOptions = {}): number {
  if (!canAnimate()) return 0;
  const from = boxOf(fromEl.getBoundingClientRect());
  const to = boxOf(toEl.getBoundingClientRect());
  if (from.width === 0 || to.width === 0) return 0;
  const duration = options.duration ?? flightDuration(distanceBetween(from, to));
  const delay = options.delay ?? 0;
  runAndDispose(ghostOf(fromEl, from), flightKeyframes(from, to, options.arc), { duration, delay });
  return delay + duration;
}

/** 让元素的克隆体在原地缩小淡出（原元素可以立即从 DOM 移除）。返回结束时刻（ms）；不能动效时返回 0 */
export function fadeOut(element: HTMLElement, options: FadeOptions = {}): number {
  if (!canAnimate()) return 0;
  const box = boxOf(element.getBoundingClientRect());
  if (box.width === 0) return 0;
  const duration = options.duration ?? FADE_DURATION;
  const delay = options.delay ?? 0;
  const ghost = ghostOf(element, box);
  ghost.style.transformOrigin = '50% 50%';
  runAndDispose(ghost, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(0.6)' }], { duration, delay, easing: 'ease-in' });
  return delay + duration;
}
