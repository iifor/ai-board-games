import { resolveActiveSheriffId } from '../../../werewolf/utils';
import type { Player, WerewolfRound } from '../../../../types';
import type { WerewolfGameArenaProps } from '../../../werewolf/WerewolfGame';
import { resolveWerewolfInteraction } from '../../utils/interactionState';
import { InteractionStage, PerspectiveHeader, PerspectiveModeLabel, PerspectiveRoster } from '../PerspectiveShared';
import './index.css';

export function GodWerewolfView(props: WerewolfGameArenaProps) {
  const players = ((props.game.players || []) as Player[]).slice().sort((a, b) => Number(a.id) - Number(b.id));
  const interaction = resolveWerewolfInteraction(props.activeEvent);
  const sheriffId = resolveActiveSheriffId((props.game.rounds || []) as WerewolfRound[], props.currentRound);
  const election = props.currentRound?.sheriffElection;
  const candidateIds = new Set((props.sheriffCandidateIds.length ? props.sheriffCandidateIds : election?.signedUpIds || election?.candidates || []).map(Number));
  const alive = players.filter((player) => player.alive).length;
  const rosterProps = { interaction, speakerId: props.currentSpeakerId, sheriffId, candidateIds, revealRoles: true, onSelect: props.onPlayerSelect };

  return <section className="god-werewolf-view" data-phase={props.currentRound?.phase || 'idle'} aria-label="狼人杀上帝视角">
    <PerspectiveModeLabel modeName={props.mode?.name || '狼人杀'} />
    <PerspectiveHeader round={props.currentRound} alive={alive} eliminated={players.length - alive} />
    <PerspectiveRoster players={players.slice(0, 6)} side="left" {...rosterProps} />
    <PerspectiveRoster players={players.slice(6, 12)} side="right" {...rosterProps} />
    <InteractionStage interaction={interaction} players={players} speech={props.activeSpeech} view="god" round={props.currentRound} />
  </section>;
}
