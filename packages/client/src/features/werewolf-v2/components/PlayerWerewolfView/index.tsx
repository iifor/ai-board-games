import { CircleUserRound } from 'lucide-react';
import { ROLE_NAMES } from '../../../werewolf/constants';
import { resolveActiveSheriffId } from '../../../werewolf/utils';
import type { Player, WerewolfRound } from '../../../../types';
import type { WerewolfGameArenaProps } from '../../../werewolf/WerewolfGame';
import { resolveWerewolfInteraction } from '../../utils/interactionState';
import { InteractionStage, PerspectiveHeader, PerspectiveModeLabel, PerspectiveRoster } from '../PerspectiveShared';
import './index.css';

export function PlayerWerewolfView(props: WerewolfGameArenaProps) {
  const players = ((props.game.players || []) as Player[]).slice().sort((a, b) => Number(a.id) - Number(b.id));
  const rounds = (props.game.rounds || []) as WerewolfRound[];
  const viewer = players.find((player) => Number(player.id) === Number(props.visibleRolePlayerId)) || null;
  const interaction = resolveWerewolfInteraction(props.activeEvent);
  const sheriffId = resolveActiveSheriffId(rounds, props.currentRound);
  const election = props.currentRound?.sheriffElection;
  const candidateIds = new Set((props.sheriffCandidateIds.length ? props.sheriffCandidateIds : election?.signedUpIds || election?.candidates || []).map(Number));
  const withdrawnIds = new Set((election?.withdrawnIds || []).map(Number));
  const revealedIdiotIds = new Set(rounds.flatMap((round) => round.idiotReveal?.id ? [Number(round.idiotReveal.id)] : []));
  const alive = players.filter((player) => player.alive).length;
  const rosterProps = { interaction, speakerId: props.currentSpeakerId, sheriffId, candidateIds, withdrawnIds, revealedIdiotIds, revealRoles: false, viewerPlayerId: props.visibleRolePlayerId, onSelect: props.onPlayerSelect };

  return <section className="player-werewolf-view" data-role={viewer?.role || 'villager'} data-phase={props.currentRound?.phase || 'idle'} aria-label="狼人杀玩家视角">
    <PerspectiveModeLabel modeName={props.mode?.name || '狼人杀'} />
    <PerspectiveHeader round={props.currentRound} alive={alive} eliminated={players.length - alive} />
    <PerspectiveRoster players={players.slice(0, 6)} side="left" {...rosterProps} />
    <PerspectiveRoster players={players.slice(6, 12)} side="right" {...rosterProps} />
    <InteractionStage interaction={interaction} players={players} speech={props.activeSpeech} view="player" round={props.currentRound} />
    <footer className="player-view-identity">
      <CircleUserRound size={22} /><span>你的身份 <b>{viewer ? ROLE_NAMES[viewer.role || ''] || viewer.roleLabel || '身份未知' : '等待分配'}</b></span>
    </footer>
  </section>;
}
