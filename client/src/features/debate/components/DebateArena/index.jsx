import React, { useMemo } from 'react';
import { DebateSide } from '../DebateSide';
import { DebateSeat } from '../DebateSeat';
import { DebatePhaseTimeline } from '../DebatePhaseTimeline';
import { SpeechSubtitle } from '../../../../components/SpeechSubtitle';
import { getDebatePhaseSteps, getActiveStageIndex, getStageTitle, getDebatePlayerLabel, getMvpVoteTargetMap } from '../../debateUtils';
import './index.css';

export function DebateArena({ game, currentSpeakerId, currentPhase, streamMessage, subtitleSpeech, onPlayerSelect, isIdle }) {
  const proPlayers = useMemo(() => game.players.filter((player) => player.side === 'pro'), [game.players]);
  const conPlayers = useMemo(() => game.players.filter((player) => player.side === 'con'), [game.players]);
  const judges = useMemo(() => game.players.filter((player) => player.side === 'judge'), [game.players]);
  const mvpVoteTargets = useMemo(() => currentPhase?.id === 'mvp' ? getMvpVoteTargetMap(game) : new Map(), [game, currentPhase]);
  const phaseSteps = useMemo(() => getDebatePhaseSteps(game.phases, currentPhase), [game.phases, currentPhase]);
  const activeStepIndex = getActiveStageIndex(currentPhase, phaseSteps);
  const currentTitle = isIdle ? '等待开局' : getStageTitle(currentPhase);
  return (
    <>
      <DebateSide
        title="正方"
        position={game.topic?.proPosition}
        players={proPlayers}
        tone="pro"
        mvpId={game.mvp?.id}
        currentSpeakerId={currentSpeakerId}
        onPlayerSelect={onPlayerSelect}
        mvpVoteTargets={mvpVoteTargets}
      />

      <div className="debate-center">
        <header className="debate-hero">
          <h1>AI 辩论赛</h1>
          <div className="debate-topic-ribbon">
            <span>辩题：</span>
            <strong>{game.topic?.title || '等待辩题'}</strong>
          </div>
        </header>
        <section className="debate-stage-console">
          <div className="debate-current">
            <span>当前环节</span>
            <h2>{currentTitle}</h2>
            <strong>{streamMessage}</strong>
          </div>
          <DebatePhaseTimeline steps={phaseSteps} activeStepIndex={activeStepIndex} />
        </section>
        {judges.length > 0 && (
          <section className="judge-row">
            {judges.map((judge, index) => (
              <DebateSeat
                player={judge}
                slotLabel="评委"
                key={judge.id || `judge-${index}`}
                currentSpeakerId={currentSpeakerId}
                onPlayerSelect={onPlayerSelect}
                tone="judge"
                index={index}
                mvpVoteTarget={mvpVoteTargets.get(Number(judge.id))}
                isMvp={Number(game.mvp?.id) === Number(judge.id)}
              />
            ))}
          </section>
        )}
      </div>

      <DebateSide
        title="反方"
        position={game.topic?.conPosition}
        players={conPlayers}
        tone="con"
        mvpId={game.mvp?.id}
        currentSpeakerId={currentSpeakerId}
        onPlayerSelect={onPlayerSelect}
        mvpVoteTargets={mvpVoteTargets}
      />
      <SpeechSubtitle
        speech={subtitleSpeech}
        players={game.players}
        className="speech-subtitle--debate"
        getSpeakerLabel={(speech, players) => speech?.playerId ? getDebatePlayerLabel(players, speech.playerId) : '主持人'}
      />
    </>
  );
}
