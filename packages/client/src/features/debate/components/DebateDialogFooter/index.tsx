import { classNames } from '../../../../utils/classNames';

interface DebateDialogFooterProps {
  captainEnabled: boolean;
  speechEnabled: boolean;
  debugMode: boolean;
  replayLocked: boolean;
  canStart: boolean;
  onCaptainEnabledChange?: (enabled: boolean) => void;
  onSpeechEnabledChange: (enabled: boolean) => void;
  onDebugModeChange: (enabled: boolean) => void;
  onStart: () => void;
}

export function DebateDialogFooter({
  captainEnabled,
  speechEnabled,
  debugMode,
  replayLocked,
  canStart,
  onCaptainEnabledChange,
  onSpeechEnabledChange,
  onDebugModeChange,
  onStart
}: DebateDialogFooterProps) {
  return (
    <footer>
      <div className="debate-topic-switches">
        <button
          type="button"
          className={classNames('dialog-switch', 'game-toggle-control', captainEnabled && 'active')}
          role="switch"
          aria-checked={captainEnabled}
          onClick={() => onCaptainEnabledChange?.(!captainEnabled)}
          disabled={replayLocked && !captainEnabled}
          title={replayLocked && !captainEnabled ? '导入对局未配置队长' : '切换本局是否启用队长'}
        >
          <span className="switch-track game-switch-track"><i /></span>
          <strong>{captainEnabled ? '队长开启' : '无队长'}</strong>
        </button>
        <button
          type="button"
          className={classNames('dialog-switch', 'game-toggle-control', speechEnabled && 'active')}
          role="switch"
          aria-checked={speechEnabled}
          onClick={() => onSpeechEnabledChange(!speechEnabled)}
        >
          <span className="switch-track game-switch-track"><i /></span>
          <strong>{speechEnabled ? '语音开启' : '语音关闭'}</strong>
        </button>
        <button
          type="button"
          className={classNames('dialog-switch', 'game-toggle-control', debugMode && 'active')}
          role="switch"
          aria-checked={debugMode}
          onClick={() => onDebugModeChange(!debugMode)}
          title="使用固定发言与浏览器语音跑完整流程"
        >
          <span className="switch-track game-switch-track"><i /></span>
          <strong>{debugMode ? '调试开启' : '调试关闭'}</strong>
        </button>
      </div>
      <button
        type="button"
        className="primary debate-start-submit game-primary-button"
        onClick={onStart}
        disabled={!canStart}
      >
        保存并开始
      </button>
    </footer>
  );
}
