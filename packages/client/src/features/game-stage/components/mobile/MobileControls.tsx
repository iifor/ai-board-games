import type { PlaybackOptions } from '../../types';
import { cycleSpeed } from '../../utils';
import './MobileControls.css';

interface MobileControlsProps {
  readonly options: PlaybackOptions;
  readonly finished: boolean;
  readonly sheetOpen: boolean;
  readonly onChange: (next: PlaybackOptions) => void;
  readonly onToggleSheet: () => void;
  /** 有终局结果且对话框关着时出现 */
  readonly onShowResult?: (() => void) | undefined;
}

/** 手机底部控制栏：暂停 / 继续、倍速（点一下换一档）、静音、记录抽屉、查看结果；暂停即停止确认，服务端随之暂停生成 */
export function MobileControls({ options, finished, sheetOpen, onChange, onToggleSheet, onShowResult }: MobileControlsProps) {
  return (
    <nav className="mobile-controls" aria-label="播放控制">
      <button type="button" disabled={finished} aria-label={options.paused ? '继续' : '暂停'} onClick={() => onChange({ ...options, paused: !options.paused })}>
        {options.paused ? '▶' : '❚❚'}
      </button>
      <button type="button" className="mobile-controls-speed" aria-label={`播放速度 ${options.speed} 倍，点按切换`} onClick={() => onChange({ ...options, speed: cycleSpeed(options.speed) })}>
        {options.speed}×
      </button>
      <button type="button" aria-pressed={options.muted} onClick={() => onChange({ ...options, muted: !options.muted })}>
        {options.muted ? '已静音' : '静音'}
      </button>
      <button type="button" aria-pressed={sheetOpen} onClick={onToggleSheet}>记录</button>
      {onShowResult ? <button type="button" className="is-primary" onClick={onShowResult}>结果</button> : null}
    </nav>
  );
}
