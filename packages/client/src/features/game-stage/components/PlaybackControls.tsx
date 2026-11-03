import { SHORTCUT_HINTS } from '../constants';
import { SPEEDS, type PlaybackOptions } from '../types';
import './PlaybackControls.css';

interface PlaybackControlsProps {
  readonly options: PlaybackOptions;
  readonly pending: number;
  readonly finished: boolean;
  readonly feedOpen: boolean;
  readonly onChange: (next: PlaybackOptions) => void;
  readonly onToggleFeed: () => void;
}

/**
 * 控制条：暂停 / 继续、倍速、静音、对局记录；暂停即停止确认，服务端随之暂停生成。
 * 快捷键本身由舞台页的 useStageShortcuts 处理，这里只在按钮上标出提示（title 与 aria-keyshortcuts）。
 * 状态文字只是展示，不做 live region（舞台上只有字幕栏会被读屏播报）
 */
export function PlaybackControls({ options, pending, finished, feedOpen, onChange, onToggleFeed }: PlaybackControlsProps) {
  const status = finished ? '播放完毕' : pending > 0 ? `已缓冲 ${pending} 段` : '等待 AI 生成…';
  return (
    <div className="playback-rail glass-panel" role="toolbar" aria-label="播放控制">
      <button type="button" className={`playback-toggle ${options.paused ? 'is-paused' : ''}`} title={SHORTCUT_HINTS.pause.title} aria-keyshortcuts={SHORTCUT_HINTS.pause.keys} onClick={() => onChange({ ...options, paused: !options.paused })}>
        {options.paused ? '▶ 继续' : '❚❚ 暂停'}
      </button>
      <div className="playback-speeds" role="group" aria-label="倍速" title={SHORTCUT_HINTS.speed.title} aria-keyshortcuts={SHORTCUT_HINTS.speed.keys}>
        {SPEEDS.map((speed) => (
          <button key={speed} type="button" className={options.speed === speed ? 'is-active' : ''} aria-pressed={options.speed === speed} onClick={() => onChange({ ...options, speed })}>
            {speed}×
          </button>
        ))}
      </div>
      <button type="button" className={options.muted ? 'is-active' : ''} aria-pressed={options.muted} title={SHORTCUT_HINTS.mute.title} aria-keyshortcuts={SHORTCUT_HINTS.mute.keys} onClick={() => onChange({ ...options, muted: !options.muted })}>
        {options.muted ? '已静音' : '静音'}
      </button>
      <button type="button" className={feedOpen ? 'is-active' : ''} aria-pressed={feedOpen} title={SHORTCUT_HINTS.feed.title} aria-keyshortcuts={SHORTCUT_HINTS.feed.keys} onClick={onToggleFeed}>记录</button>
      <span className="playback-status">{status}</span>
    </div>
  );
}
