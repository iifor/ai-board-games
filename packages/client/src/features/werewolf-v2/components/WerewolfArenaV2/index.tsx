import type { WerewolfGameArenaProps } from '../../../werewolf/WerewolfGame';
import { WerewolfResult } from '../../../werewolf/components/WerewolfResult';
import { GodWerewolfView } from '../GodWerewolfView';
import { PlayerWerewolfView } from '../PlayerWerewolfView';
import { WerewolfBottomSpeechBar } from '../WerewolfBottomSpeechBar';
import './index.css';

export function WerewolfArenaV2(props: WerewolfGameArenaProps) {
  const players = props.game.players || [];
  const phase = props.currentRound?.phase === 'day' ? 'day' : 'night';
  return <section className="werewolf-v2-arena" data-completed={props.game.winner ? 'true' : 'false'} data-phase={phase} data-speech-active={props.activeSpeech ? 'true' : 'false'}>
    <div className="werewolf-v2-background" aria-hidden="true"><i className="is-night" /><i className="is-day" /></div>
    {props.clientViewMode === 'player' ? <PlayerWerewolfView {...props} /> : <GodWerewolfView {...props} />}
    {props.activeSpeech && <WerewolfBottomSpeechBar speech={props.activeSpeech} players={players} streamMessage={props.streamMessage} />}
    <WerewolfResult game={props.game} />
  </section>;
}
