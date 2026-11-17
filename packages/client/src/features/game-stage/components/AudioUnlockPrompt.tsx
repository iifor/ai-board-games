import { useAutoplayUnlock } from '../hooks/useAutoplayUnlock';
import './AudioUnlockPrompt.css';

interface AudioUnlockPromptProps {
  /** 观众自己静音时不提示 */
  readonly muted: boolean;
}

/** 浏览器拦截了自动播放时浮在舞台上的"点击开启声音"；播放照常推进，点一下之后的段落恢复声音 */
export function AudioUnlockPrompt({ muted }: AudioUnlockPromptProps) {
  const { blocked, unlock } = useAutoplayUnlock();
  return <AudioUnlockButton visible={blocked && !muted} onUnlock={unlock} />;
}

interface AudioUnlockButtonProps {
  readonly visible: boolean;
  readonly onUnlock: () => void;
}

/** 纯展示部分，便于静态渲染测试 */
export function AudioUnlockButton({ visible, onUnlock }: AudioUnlockButtonProps) {
  if (!visible) return null;
  return (
    <button type="button" className="audio-unlock-prompt" onClick={onUnlock}>
      <span className="audio-unlock-prompt-icon" aria-hidden="true" />
      点击开启声音
    </button>
  );
}
