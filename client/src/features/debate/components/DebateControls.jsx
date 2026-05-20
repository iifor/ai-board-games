import React from 'react';
import { ArrowLeft, FastForward, Pause, Play, RotateCcw } from 'lucide-react';
import './DebateControls.css';

export function DebateControls({
  autoPlay,
  startLabel,
  startTitle,
  startDisabled,
  playbackDisabled,
  skipDisabled,
  showSkip,
  onReturn,
  setAutoPlay,
  onStart,
  onSkipPhase
}) {
  return (
    <nav className="debate-controls" aria-label="辩论赛操作">
      <button type="button" title="返回游戏选择" onClick={onReturn}>
        <ArrowLeft size={18} />
        <span>返回</span>
      </button>
      <button type="button" title={startTitle} onClick={onStart} disabled={startDisabled}>
        <RotateCcw size={18} />
        <span>{startLabel}</span>
      </button>
      <button
        type="button"
        title={playbackDisabled ? '开局后可推进' : autoPlay ? '暂停自动推进' : '继续自动推进'}
        onClick={() => setAutoPlay(!autoPlay)}
        disabled={playbackDisabled}
      >
        {autoPlay ? <Pause size={18} /> : <Play size={18} />}
        <span>{autoPlay ? '暂停' : '推进'}</span>
      </button>
      {showSkip && (
        <button
          type="button"
          title={skipDisabled ? '复盘播放中可跳过当前阶段' : '跳过当前阶段'}
          onClick={onSkipPhase}
          disabled={skipDisabled}
        >
          <FastForward size={18} />
          <span>跳过阶段</span>
        </button>
      )}
    </nav>
  );
}
