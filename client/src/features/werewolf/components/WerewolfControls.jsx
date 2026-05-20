import React from 'react';
import { ArrowLeft, FastForward, Pause, Play, RotateCcw } from 'lucide-react';
import { classNames } from '../../../utils/classNames';
import './WerewolfControls.css';

export function WerewolfControls({ autoPlay, startDisabled, playbackDisabled, showSkip, skipDisabled, skipActive, onReturn, setAutoPlay, onStart, onSkipPhase }) {
  return (
    <nav className="werewolf-controls" aria-label="狼人杀控制">
      <button type="button" title="返回游戏选择" onClick={onReturn}>
        <ArrowLeft size={18} />
        <span>返回</span>
      </button>
      <button type="button" title={startDisabled ? '暂停后可以开局' : '开局'} disabled={startDisabled} onClick={onStart}>
        <RotateCcw size={18} />
        <span>开局</span>
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
