import React from 'react';
import { classNames } from '../../../../utils/classNames';

export function DebateDialogFooter({
  captainEnabled,
  speechEnabled,
  replayLocked,
  canStart,
  onCaptainEnabledChange,
  onSpeechEnabledChange,
  onStart
}) {
  return (
    <footer>
      <div className="debate-topic-switches">
        <button
          type="button"
          className={classNames('dialog-switch', captainEnabled && 'active')}
          onClick={() => onCaptainEnabledChange?.(!captainEnabled)}
          disabled={replayLocked && !captainEnabled}
          title={replayLocked && !captainEnabled ? '导入对局未配置队长' : '切换本局是否启用队长'}
        >
          <span className="switch-track"><i /></span>
          <strong>{captainEnabled ? '队长开启' : '无队长'}</strong>
        </button>
        <button type="button" className={classNames('dialog-switch', speechEnabled && 'active')} onClick={() => onSpeechEnabledChange(!speechEnabled)}>
          <span className="switch-track"><i /></span>
          <strong>{speechEnabled ? '语音开启' : '语音关闭'}</strong>
        </button>
      </div>
      <button type="button" className="primary debate-start-submit" onClick={onStart} disabled={!canStart}>保存并开始</button>
    </footer>
  );
}
