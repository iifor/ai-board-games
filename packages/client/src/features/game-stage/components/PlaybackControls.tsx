import { SPEEDS, type PlaybackOptions } from '../types';
import './PlaybackControls.css';

interface PlaybackControlsProps {
  readonly options: PlaybackOptions;
  readonly pending: number;
  readonly finished: boolean;
  readonly onChange: (next: PlaybackOptions) => void;
}

/** 暂停 / 继续、倍速、静音；暂停即停止确认，服务端随之暂停生成 */
export function PlaybackControls({ options, pending, finished, onChange }: PlaybackControlsProps) {
  const status = finished ? '播放完毕' : pending > 0 ? `已缓冲 ${pending} 段` : '等待 AI 生成…';
  return (
    <div className="playback-controls">
      <button type="button" className="button" onClick={() => onChange({ ...options, paused: !options.paused })}>
        {options.paused ? '继续' : '暂停'}
      </button>
      <div className="playback-speeds" role="group" aria-label="倍速">
        {SPEEDS.map((speed) => (
          <button
            key={speed}
            type="button"
            className={`button ${options.speed === speed ? 'button-primary' : ''}`}
            aria-pressed={options.speed === speed}
            onClick={() => onChange({ ...options, speed })}
          >
            {speed}×
          </button>
        ))}
      </div>
      <label className="playback-mute">
        <input type="checkbox" checked={options.muted} onChange={(event) => onChange({ ...options, muted: event.target.checked })} />
        静音
      </label>
      <span className="playback-pending">{status}</span>
    </div>
  );
}
