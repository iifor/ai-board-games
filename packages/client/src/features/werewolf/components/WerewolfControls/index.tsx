import { ArrowLeft, FastForward, MoonStar, Pause, Play, RotateCcw } from 'lucide-react';
import { classNames } from '../../../../utils/classNames';
import './index.css';

interface WerewolfControlsProps {
  variant?: 'classic' | 'v2';
  autoPlay: boolean;
  startDisabled: boolean;
  playbackDisabled: boolean;
  showSkip: boolean;
  skipDisabled: boolean;
  skipActive: boolean;
  onReturn: () => void;
  setAutoPlay: (value: boolean) => void;
  onStart: () => void;
  onSkipPhase: () => void;
}

export function WerewolfControls({ variant = 'classic', autoPlay, startDisabled, playbackDisabled, showSkip, skipDisabled, skipActive, onReturn, setAutoPlay, onStart, onSkipPhase }: WerewolfControlsProps) {
  const v2 = variant === 'v2';
  return (
    <nav className={classNames('werewolf-controls', 'game-control-rail', v2 && 'werewolf-controls--v2')} aria-label="狼人杀控制">
      {v2 && <i className="werewolf-controls__sigil" aria-hidden="true"><MoonStar size={17} /></i>}
      <button type="button" title="返回游戏选择" onClick={onReturn}>
        <ArrowLeft size={18} />
        <span>{v2 ? '离场' : '返回'}</span>
      </button>
      <button className="game-primary-button" type="button" title={startDisabled ? '暂停后可以开局' : '开局'} disabled={startDisabled} onClick={onStart}>
        <RotateCcw size={18} />
        <span>{v2 ? '新一局' : '开局'}</span>
      </button>
      <button
        type="button"
        title={playbackDisabled ? '开局后可播放' : autoPlay ? '暂停自动播放' : '继续自动播放'}
        disabled={playbackDisabled}
        onClick={() => setAutoPlay(!autoPlay)}
      >
        {autoPlay ? <Pause size={18} /> : <Play size={18} />}
        <span>{autoPlay ? '暂停' : '播放'}</span>
      </button>
      {showSkip && (
        <button
          type="button"
          className={classNames(skipActive && 'skip-active')}
          title={skipDisabled ? '复盘播放中可跳过当前阶段' : '跳过当前阶段'}
          disabled={skipDisabled}
          onClick={onSkipPhase}
        >
          <FastForward size={18} />
          <span>跳过阶段</span>
        </button>
      )}
    </nav>
  );
}
