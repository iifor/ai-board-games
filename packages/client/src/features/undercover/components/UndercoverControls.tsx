import './UndercoverControls.css';

interface UndercoverControlsProps {
  autoPlay: boolean;
  started: boolean;
  replayMode: boolean;
  onReturn: () => void;
  onStart: () => void;
  onTogglePlayback: (enabled: boolean) => void;
  onSkipPhase: () => void;
}

export function UndercoverControls({
  autoPlay,
  started,
  replayMode,
  onReturn,
  onStart,
  onTogglePlayback,
  onSkipPhase
}: UndercoverControlsProps) {
  return (
    <nav className="undercover-controls" aria-label="对局控制">
      <button type="button" title="返回游戏选择" onClick={onReturn}>返回选择</button>
      <button type="button" title="开始谁是卧底对局" disabled={started || replayMode} onClick={onStart}>开始游戏</button>
      <button
        type="button"
        title={autoPlay ? '暂停自动播放' : '继续自动播放'}
        aria-pressed={autoPlay}
        disabled={!started}
        onClick={() => onTogglePlayback(!autoPlay)}
      >
        {autoPlay ? '暂停播放' : '继续播放'}
      </button>
      {replayMode && (
        <button type="button" title="跳过当前回放阶段" disabled={!started} onClick={onSkipPhase}>跳过阶段</button>
      )}
    </nav>
  );
}
