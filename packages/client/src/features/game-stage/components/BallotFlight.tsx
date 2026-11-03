import { useEffect, useRef, useState, type CSSProperties } from 'react';
import type { FlightItem, FlightPlan } from '../animation/ballotFlight';
import { prefersReducedMotion } from '../animation/motion';
import './BallotFlight.css';

interface BallotFlightProps {
  /** 挂载时的飞行计划；飞行中布局变化不重排（最多错位一两秒），避免侧栏开合时反复重飞 */
  readonly plan: FlightPlan;
}

type TokenStyle = CSSProperties & Record<'--ballot-weight', number>;

const ABSTAIN_KEYFRAMES: readonly Keyframe[] = [
  { offset: 0, opacity: 0, transform: 'scale(0.5)' },
  { offset: 0.25, opacity: 1, transform: 'scale(1.15)' },
  { offset: 0.45, opacity: 0.35, transform: 'scale(1)' },
  { offset: 0.65, opacity: 1, transform: 'scale(1.05)' },
  { offset: 1, opacity: 0, transform: 'scale(0.7) translateY(-10px)' },
];

const LAND_KEYFRAMES: readonly Keyframe[] = [
  { transform: 'scale(1)', filter: 'brightness(1)' },
  { transform: 'scale(1.07)', filter: 'brightness(1.35)', offset: 0.35 },
  { transform: 'scale(1)', filter: 'brightness(1)' },
];

/** 落地：目标座位的卡片轻轻一弹。座位卡由布局标上 data-seat，这里从飞行层的父元素（座位容器）里找 */
function pulseTarget(root: HTMLElement, seat: number): void {
  const card = root.parentElement?.querySelector<HTMLElement>(`[data-seat="${seat}"] .seat-card`);
  if (card && typeof card.animate === 'function') card.animate([...LAND_KEYFRAMES], { duration: 260, easing: 'ease-out' });
}

function animateItem(root: HTMLElement, element: HTMLElement, item: FlightItem): Animation {
  if (item.kind === 'abstain') {
    return element.animate([...ABSTAIN_KEYFRAMES], { duration: item.durationMs, delay: item.delayMs, easing: 'ease-in-out', fill: 'both' });
  }
  const animation = element.animate(item.keyframes.map((frame) => ({ ...frame })), { duration: item.durationMs, delay: item.delayMs, easing: 'cubic-bezier(0.3, 0, 0.2, 1)', fill: 'both' });
  animation.finished.then(() => pulseTarget(root, item.target)).catch(() => undefined);
  return animation;
}

/**
 * 选票飞行层：计票时每张选票从投票者座位沿弧线飞到目标座位（Web Animations API），错峰起飞、落地时目标卡片一弹；
 * 弃票在投票者座位原地闪烁后消失。只做视觉，不影响播放推进；减少动效或不支持 WAAPI 时什么都不画。
 * 必须挂在带座位坐标的容器里（坐标相对该容器左上角）。
 */
export function BallotFlight({ plan: initialPlan }: BallotFlightProps) {
  const [plan] = useState(initialPlan);
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || plan.items.length === 0 || prefersReducedMotion() || typeof root.animate !== 'function') return;
    const animations = plan.items.flatMap((item) => {
      const element = root.querySelector<HTMLElement>(`[data-flight="${item.key}"]`);
      return element ? [animateItem(root, element, item)] : [];
    });
    return () => animations.forEach((animation) => animation.cancel());
  }, [plan]);
  if (plan.items.length === 0) return null;
  return (
    <div ref={rootRef} className="ballot-flight" aria-hidden="true">
      {plan.items.map((item) => {
        const style: TokenStyle = { '--ballot-weight': item.kind === 'ballot' ? item.weight : 1 };
        const at = item.kind === 'ballot' ? item.from : item.at;
        return (
          <i
            key={item.key}
            className={`ballot-token ${item.kind === 'abstain' ? 'is-abstain' : ''}`}
            data-flight={item.key}
            style={item.kind === 'abstain' ? { ...style, left: `${at.x}px`, top: `${at.y}px` } : style}
          />
        );
      })}
    </div>
  );
}
