import { ArrowLeft, FastForward, Pause, Play, Power, Volume2, VolumeX } from 'lucide-react';

interface AvalonControlsProps {
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

function AvalonControls(props: AvalonControlsProps) {
  return (
    <nav className="avalon-controls game-control-rail" aria-label="阿瓦隆对局控制">
      <button type="button" onClick={props.onReturn}><ArrowLeft aria-hidden="true" />返回</button>
      {!props.started && !props.replayMode && (
        <button type="button" className="is-primary game-primary-button" onClick={props.onStart}><Power aria-hidden="true" />开始游戏</button>
      )}
      {props.started && (
        <button type="button" aria-pressed={props.autoPlay} onClick={() => props.onTogglePlayback(!props.autoPlay)}>
          {props.autoPlay ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
          {props.autoPlay ? '暂停' : '继续'}
        </button>
      )}
      <button type="button" aria-pressed={props.speechEnabled} onClick={() => props.onToggleSpeech(!props.speechEnabled)}>
        {props.speechEnabled ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
        {props.speechEnabled ? '语音开启' : '语音关闭'}
      </button>
      {props.replayMode && (
        <button type="button" disabled={!props.started} onClick={props.onSkipPhase}><FastForward aria-hidden="true" />跳过阶段</button>
      )}
    </nav>
  );
}

export { AvalonControls };
