import { useRef } from 'react';
import type { WerewolfGameArenaProps } from '../../../werewolf/WerewolfGame';
import { WerewolfResult } from '../../../werewolf/components/WerewolfResult';
import { GodWerewolfView } from '../GodWerewolfView';
import { PlayerWerewolfView } from '../PlayerWerewolfView';
import { WerewolfBottomSpeechBar } from '../WerewolfBottomSpeechBar';
import { PlayerPosterSpotlight } from '../../../../components/PlayerPosterSpotlight';
import { getHostPosterPlayer } from '../../../../components/PlayerPosterSpotlight/posters';
import { shouldProjectWerewolfInteraction } from '../../utils/interactionState';
import './index.css';

export function WerewolfArenaV2(props: WerewolfGameArenaProps) {
  const players = props.game.players || [];
  const phase = props.currentRound?.phase === 'day' ? 'day' : 'night';
  const foregroundEventRef = useRef<WerewolfGameArenaProps['activeEvent']>(null);
  const foregroundPhaseRef = useRef(phase);
  const phaseChanged = foregroundPhaseRef.current !== phase;
  if (!props.currentRound || phaseChanged) {
    foregroundEventRef.current = null;
    foregroundPhaseRef.current = phase;
  }
  else if (shouldProjectWerewolfInteraction(props.activeEvent)) foregroundEventRef.current = props.activeEvent;
  const foregroundSpeech = props.activeSpeech?.playerId == null ? null : props.activeSpeech;
  const speakingPlayer = foregroundSpeech?.playerId == null
    ? null
    : players.find((player) => Number(player.id) === Number(foregroundSpeech.playerId)) || null;
  const hostSpeaking = props.activeSpeech?.speakerRole === 'host' && Boolean(props.activeSpeech.text);
  const spotlightPlayer = speakingPlayer || (
    hostSpeaking ? getHostPosterPlayer(props.game.host) : null
  );
  const viewProps = { ...props, activeEvent: foregroundEventRef.current, activeSpeech: foregroundSpeech };
  return <section className="werewolf-v2-arena" data-completed={props.game.winner ? 'true' : 'false'} data-phase={phase} data-speech-active={foregroundSpeech || hostSpeaking ? 'true' : 'false'}>
    <div className="werewolf-v2-background" aria-hidden="true"><i className="is-night" /><i className="is-day" /></div>
    {spotlightPlayer && (
      <PlayerPosterSpotlight
        key={spotlightPlayer.id}
        player={spotlightPlayer}
        className="werewolf-v2-speaker-backdrop"
        variant="cutout"
        fallback={hostSpeaking && !speakingPlayer ? 'none' : 'initials'}
        decorative={hostSpeaking && !speakingPlayer}
      />
    )}
    {props.clientViewMode === 'player' ? <PlayerWerewolfView {...viewProps} /> : <GodWerewolfView {...viewProps} />}
    {foregroundSpeech && <WerewolfBottomSpeechBar speech={foregroundSpeech} players={players} streamMessage={props.streamMessage} />}
    <WerewolfResult game={props.game} />
  </section>;
}
