import { useEffect, useRef } from 'react';
import type { PlaybackOptions } from '../types';
import { applyShortcut, shortcutActionOf } from '../utils';

interface StageShortcutsOptions {
  readonly options: PlaybackOptions;
  readonly onChange: (next: PlaybackOptions) => void;
  /** L：开合记录侧栏 */
  readonly onToggleFeed: () => void;
  /** R：打开 / 关闭终局结果；没有结果时不传，R 不响应 */
  readonly onToggleResult?: (() => void) | undefined;
}

/**
 * 舞台快捷键（监听 window 的 keydown）：空格 暂停 / 继续，← / → 倍速，M 静音，L 记录，R 结果。
 * 键 → 动作的判定在 utils 的 shortcutActionOf（输入框里、按住修饰键时不响应；焦点在按钮上时空格交给按钮）。
 * 命中的键 preventDefault（空格不滚动页面）；别处已 preventDefault 的事件（如座位弹层处理过的）不再响应；
 * 长按的重复事件只拦下默认行为、不重复切换
 */
export function useStageShortcuts({ options, onChange, onToggleFeed, onToggleResult }: StageShortcutsOptions): void {
  const latest = useRef({ options, onChange, onToggleFeed, onToggleResult });
  latest.current = { options, onChange, onToggleFeed, onToggleResult };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      const action = shortcutActionOf({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        target: event.target instanceof HTMLElement ? event.target : null,
      });
      if (!action) return;
      const current = latest.current;
      if (action === 'toggle-result' && !current.onToggleResult) return;
      event.preventDefault();
      if (event.repeat) return;
      if (action === 'toggle-feed') return current.onToggleFeed();
      if (action === 'toggle-result') return current.onToggleResult?.();
      const next = applyShortcut(action, current.options);
      if (next) current.onChange(next);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);
}
