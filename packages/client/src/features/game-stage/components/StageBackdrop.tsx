import type { StagePeriod } from '../utils';
import './StageBackdrop.css';

interface StageBackdropProps {
  readonly gameKey: string;
  readonly period: StagePeriod;
}

/** 舞台背景：狼人杀昼夜两层按 period 圆形揭开切换；辩论赛用演播厅图；其余用默认渐变 */
export function StageBackdrop({ gameKey, period }: StageBackdropProps) {
  return (
    <div className="stage-backdrop" data-period={period} aria-hidden="true">
      {gameKey === 'werewolf' ? (
        <>
          <i className="stage-backdrop-layer is-night" />
          <i className="stage-backdrop-layer is-day" />
        </>
      ) : (
        <i className={`stage-backdrop-layer ${gameKey === 'debate' ? 'is-debate' : 'is-default'}`} />
      )}
      <i className="stage-backdrop-grid" />
      <i className="stage-backdrop-vignette" />
    </div>
  );
}
