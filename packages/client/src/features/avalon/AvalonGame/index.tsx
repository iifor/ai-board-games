import { Bug } from 'lucide-react';
import { useState } from 'react';
import { AvalonArena } from '../components/AvalonArena';
import { AvalonControls } from '../components/AvalonControls';
import { useAvalonGame } from '../hooks/useAvalonGame';
import './index.css';

interface AvalonGameProps {
  playerIds?: number[];
  replayGameId?: string;
  variant?: 'classic' | 'v2';
  onReturnToSelect: () => void;
}

function AvalonGame({
  playerIds = [],
  replayGameId = '',
  variant = 'classic',
  onReturnToSelect,
}: AvalonGameProps) {
  const [debugMode, setDebugMode] = useState(false);
  const controller = useAvalonGame({
    playerIds,
    replayGameId,
    debugMode: variant === 'v2' && !replayGameId && debugMode,
  });

  function returnToSelect(): void {
    controller.stopGame();
    onReturnToSelect();
  }

  return (
    <main className={`avalon-shell avalon-shell--${variant}`}>
      <header className="avalon-heading">
        <p>AI Social Deduction</p>
        <h1>AI 阿瓦隆</h1>
        <span>五人标准局 · 梅林与刺客</span>
      </header>

      <AvalonControls
        autoPlay={controller.autoPlay}
        speechEnabled={controller.speechEnabled}
        started={controller.started}
        replayMode={controller.replayMode}
        onReturn={returnToSelect}
        onStart={controller.startGame}
        onTogglePlayback={controller.setAutoPlayEnabled}
        onToggleSpeech={controller.setSpeechEnabled}
        onSkipPhase={controller.skipCurrentReplayPhase}
      />

      {controller.game ? (
        <AvalonArena game={controller.game} message={controller.message} />
      ) : (
        <section className="avalon-empty">
          <h2>{replayGameId ? '正在进入历史王国' : '王国正在召集五位玩家'}</h2>
          <p>{replayGameId ? '历史事件将按原始公开视角播放。' : '身份、投票和任务选择均由服务端保密与结算。'}</p>
          {variant === 'v2' && !replayGameId && !controller.started && (
            <label className="avalon-debug-toggle">
              <input type="checkbox" checked={debugMode} onChange={(event) => setDebugMode(event.target.checked)} />
              <span><Bug aria-hidden="true" />调试模式（不调用模型）</span>
            </label>
          )}
        </section>
      )}

      {controller.error && <p className="avalon-error" role="alert">{controller.error}</p>}
    </main>
  );
}

export { AvalonGame };
