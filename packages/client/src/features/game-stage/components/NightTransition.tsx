import type { StageEvent } from '@battle/shared';
import type { CSSProperties } from 'react';
import './NightTransition.css';

interface NightTransitionProps {
  readonly round: number;
  readonly call: StageEvent | undefined;
  readonly paused: boolean;
  readonly speed: number;
}

/** 只用公开叫号触发光晕。月光在等待下一条事件时继续移动，不驱动播放时钟。 */
export function NightTransition({ round, call, paused, speed }: NightTransitionProps) {
  return <div className="night-transition" aria-hidden="true" data-paused={paused}
    style={{ '--night-rate': speed } as CSSProperties}>
    <div className="night-sky">
      <i className="night-orbit" />
      <i className="night-lunar-disc" />
      <i className="night-mist" />
      {call?.kind === 'phase_started' && call.announcement && call.channel === 'public' &&
        <i key={call.seq} className="night-call-wave" />}
    </div>
    <span>第 {round} 夜</span>
  </div>;
}
