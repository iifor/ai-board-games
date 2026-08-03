import { useState } from 'react';
import { Bug, Copy } from 'lucide-react';
import { UndercoverArena } from '../components/UndercoverArena';
import { UndercoverControls } from '../components/UndercoverControls';
import { useUndercoverGame } from '../hooks/useUndercoverGame';
import type { UndercoverPlaybackRate } from '../types';
import './index.css';

interface UndercoverGameProps {
  playerIds?: number[];
  replayGameId?: string;
  variant?: 'classic' | 'v2';
  onReturnToSelect: () => void;
}

export function UndercoverGame({ playerIds = [], replayGameId = '', variant = 'classic', onReturnToSelect }: UndercoverGameProps) {
  const [debugMode, setDebugMode] = useState(false);
  const controller = useUndercoverGame({
    playerIds,
    replayGameId,
    debugMode: variant === 'v2' && !replayGameId && debugMode,
  });

  function returnToSelect(): void {
    controller.stopGame();
    onReturnToSelect();
  }

  function copyMatchId(): void {
    if (controller.matchId && navigator.clipboard) {
      void navigator.clipboard.writeText(controller.matchId);
    }
  }

  return (
    <main className={variant === 'v2' ? 'undercover-shell undercover-shell--v2' : 'undercover-shell'}>
      {variant === 'classic' && (
        <header className="undercover-heading">
          <p>AI Social Deduction</p>
          <h1>AI 谁是卧底</h1>
          <span aria-live="polite">{controller.message}</span>
        </header>
      )}

      {variant === 'v2' && <p className="undercover-status" aria-live="polite">{controller.message}</p>}

      {variant === 'v2' && !replayGameId && debugMode && controller.started && (
        <section className="undercover-debug-panel" aria-label="调试模式">
          <header><Bug aria-hidden="true" /><strong>调试中</strong></header>
          <div className="undercover-debug-match">
            <span>Match ID</span>
            <code>{controller.matchId || '等待分配'}</code>
            <button
              type="button"
              aria-label="复制 Match ID"
              title="复制 Match ID"
              disabled={!controller.matchId}
              onClick={copyMatchId}
            >
              <Copy aria-hidden="true" />
            </button>
          </div>
          <div className="undercover-debug-speeds" role="group" aria-label="播放速度 1× / 2× / 4×">
            {([1, 2, 4] as UndercoverPlaybackRate[]).map((rate) => (
              <button
                key={rate}
                type="button"
                aria-pressed={controller.playbackRate === rate}
                onClick={() => controller.setPlaybackRate(rate)}
              >
                {rate}×
              </button>
            ))}
          </div>
        </section>
      )}

      <UndercoverControls
        variant={variant}
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
        <UndercoverArena
          game={controller.game}
          host={controller.host}
          activeSpeech={controller.activeSpeech}
          showPlayerPoster={variant === 'v2'}
        />
      ) : (
        <section className="undercover-empty" aria-label="等待开局">
          <h2>{replayGameId ? '正在载入回放' : '六人推理局'}</h2>
          <p>{replayGameId ? '历史事件将按原顺序播放。' : '词语和卧底身份会在终局统一揭晓。'}</p>
          {variant === 'v2' && !replayGameId && !controller.started && (
            <label className="undercover-debug-toggle">
              <input
                type="checkbox"
                role="switch"
                checked={debugMode}
                onChange={(event) => setDebugMode(event.target.checked)}
              />
              <span><Bug aria-hidden="true" />调试模式</span>
            </label>
          )}
        </section>
      )}

      {controller.error && <p className="undercover-error" role="alert">{controller.error}</p>}
    </main>
  );
}
