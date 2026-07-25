import { ArrowLeft, FastForward, Pause, Play, Power, Volume2, VolumeX } from 'lucide-react';
import './UndercoverControls.css';

interface UndercoverControlsProps {
  variant?: 'classic' | 'v2';
  autoPlay: boolean;
  speechEnabled: boolean;
  started: boolean;
  replayMode: boolean;
  onReturn: () => void;
  onStart: () => void;
  onTogglePlayback: (enabled: boolean) => void;
  onToggleSpeech: (enabled: boolean) => void;
  onSkipPhase: () => void;
}

export function UndercoverControls({
  variant = 'classic',
  autoPlay,
  speechEnabled,
  started,
  replayMode,
  onReturn,
  onStart,
  onTogglePlayback,
  onToggleSpeech,
  onSkipPhase
}: UndercoverControlsProps) {
  if (variant === 'classic') {
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
        <button
          type="button"
          title={speechEnabled ? '关闭语音' : '开启语音'}
          aria-pressed={speechEnabled}
          onClick={() => onToggleSpeech(!speechEnabled)}
        >
          {speechEnabled ? '关闭语音' : '开启语音'}
        </button>
        {replayMode && (
          <button type="button" title="跳过当前回放阶段" disabled={!started} onClick={onSkipPhase}>跳过阶段</button>
        )}
      </nav>
    );
  }

  return (
    <nav className="undercover-controls undercover-controls--v2" aria-label="对局控制">
      <button type="button" title="返回游戏选择" onClick={onReturn}><ArrowLeft aria-hidden="true" />返回</button>
      {!started && !replayMode && <button type="button" className="is-primary" title="开始谁是卧底对局" onClick={onStart}><Power aria-hidden="true" />开始游戏</button>}
      {started && (
        <button
          type="button"
          title={autoPlay ? '暂停自动播放' : '继续自动播放'}
          aria-pressed={autoPlay}
          onClick={() => onTogglePlayback(!autoPlay)}
        >
          {autoPlay ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {autoPlay ? '暂停' : '继续'}
        </button>
      )}
      <button
        type="button"
        title={speechEnabled ? '关闭语音' : '开启语音'}
        aria-pressed={speechEnabled}
        onClick={() => onToggleSpeech(!speechEnabled)}
      >
        {speechEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
        {speechEnabled ? '语音开启' : '语音关闭'}
      </button>
      {replayMode && <button type="button" title="跳过当前回放阶段" disabled={!started} onClick={onSkipPhase}><FastForward aria-hidden="true" />跳过阶段</button>}
    </nav>
  );
}
