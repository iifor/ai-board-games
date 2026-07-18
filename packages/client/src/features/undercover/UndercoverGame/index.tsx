import { UndercoverArena } from '../components/UndercoverArena';
import { UndercoverControls } from '../components/UndercoverControls';
import { useUndercoverGame } from '../hooks/useUndercoverGame';
import './index.css';

interface UndercoverGameProps {
  playerIds?: number[];
  replayGameId?: string;
  onReturnToSelect: () => void;
}

export function UndercoverGame({ playerIds = [], replayGameId = '', onReturnToSelect }: UndercoverGameProps) {
  const controller = useUndercoverGame({ playerIds, replayGameId });

  function returnToSelect(): void {
    controller.stopGame();
    onReturnToSelect();
  }

  return (
    <main className="undercover-shell">
      <header className="undercover-heading">
        <p>AI Social Deduction</p>
        <h1>AI 谁是卧底</h1>
        <span aria-live="polite">{controller.message}</span>
      </header>

      <UndercoverControls
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
        <UndercoverArena game={controller.game} />
      ) : (
        <section className="undercover-empty" aria-label="等待开局">
          <h2>{replayGameId ? '正在载入回放' : '六人推理局'}</h2>
          <p>{replayGameId ? '历史事件将按原顺序播放。' : '词语和卧底身份会在终局统一揭晓。'}</p>
        </section>
      )}

      {controller.error && <p className="undercover-error" role="alert">{controller.error}</p>}
    </main>
  );
}
