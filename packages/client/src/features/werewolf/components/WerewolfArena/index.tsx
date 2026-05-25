import { useMemo } from 'react';
import { SpeechSubtitle } from '../../../../components/SpeechSubtitle';
import { formatWerewolfSeatLabel, getGameStats, getPhaseTitle, getRoundResult, getWerewolfActionTarget, getWerewolfNightActionBadges, getWerewolfSeatNumber, shouldShowWerewolfActionTargets } from '../../utils';
import { WerewolfBrandPanel } from '../WerewolfBrandPanel';
import { RoleConfigPanel } from '../RoleConfigPanel';
import { RoundProgressPanel } from '../RoundProgressPanel';
import { EliminationPanel } from '../EliminationPanel';
import { WerewolfSeat } from '../WerewolfSeat';
import { WerewolfResult } from '../WerewolfResult';
import { NightOverlay } from '../NightOverlay';
import type { GameState, Player, WerewolfRound, WerewolfMode, SpeechState } from '../../../../types';
import './index.css';

interface WerewolfArenaProps {
  game: GameState;
  mode: WerewolfMode | null;
  currentRound: WerewolfRound | null;
  currentSpeakerId: string | null;
  nightActionPlayerIds: number[];
  nightActionType: string;
  seerCheckTarget: string | null;
  sheriffCandidateIds: number[];
  activeSpeech: SpeechState | null;
  showRoles: boolean;
  visibleRolePlayerId: string | number | null;
  streamMessage: string;
  onShowRolesChange: (value: boolean | ((prev: boolean) => boolean)) => void;
  onPlayerSelect: (player: Player | null) => void;
}

export function WerewolfArena({
  game,
  mode,
  currentRound,
  currentSpeakerId,
  nightActionPlayerIds,
  nightActionType,
  seerCheckTarget,
  sheriffCandidateIds,
  activeSpeech,
  showRoles,
  visibleRolePlayerId,
  streamMessage,
  onShowRolesChange,
  onPlayerSelect
}: WerewolfArenaProps) {
  const orderedPlayers = useMemo(
    () => ((game.players || []) as Player[]).slice().sort((a, b) => Number(a.id) - Number(b.id)),
    [game.players]
  );
  const stats = getGameStats(orderedPlayers);
  const phaseTitle = getPhaseTitle(currentRound, streamMessage);
  const sheriffCandidates = getVisibleSheriffCandidates(currentRound, sheriffCandidateIds);
  const nightActors = new Set((nightActionPlayerIds || []).map(Number));
  const nightActive = currentRound?.phase === 'night';

  return (
    <section className={nightActive ? 'werewolf-arena night-active' : 'werewolf-arena'}>
      <aside className="werewolf-side werewolf-left-board" aria-label="狼人杀左侧信息">
        <WerewolfBrandPanel game={game} mode={mode} showRoles={showRoles} onShowRolesChange={onShowRolesChange} />
        <RoleConfigPanel players={orderedPlayers} mode={mode} showRoles={showRoles} />
        <RoundProgressPanel rounds={(game.rounds || []) as WerewolfRound[]} currentRound={currentRound} />
      </aside>

      <section className="werewolf-orbit-stage" aria-label="狼人杀玩家圆桌">
        <div className="werewolf-scoreboard">
          <span>{(game.event as Record<string, unknown>)?.mode as string || mode?.name || '标准局'}</span>
          <h2>{currentRound ? `第 ${currentRound.day || 1} 天 · ${phaseTitle}` : '月夜圆桌等待开局'}</h2>
        </div>

        <div className="werewolf-table-ring" aria-hidden="true">
          <section className="werewolf-table" style={{ '--seat-count': orderedPlayers.length } as React.CSSProperties} aria-label="狼人杀玩家座位">
            {orderedPlayers.map((player, index) => (
              <WerewolfSeat
                player={player}
                seatIndex={index}
                actionTarget={shouldShowWerewolfActionTargets(currentRound) ? getWerewolfSeatNumber(getWerewolfActionTarget(currentRound, player) || '', orderedPlayers) : null}
                nightActionBadges={getWerewolfNightActionBadges(currentRound, player, nightActionType, orderedPlayers)}
                isNightActor={nightActive && nightActors.has(Number(player.id))}
                seerInspectionTarget={nightActive && player.role === 'seer' ? seerCheckTarget : null}
                isSheriff={Number(currentRound?.sheriffId) === Number(player.id)}
                isSheriffCandidate={sheriffCandidates.has(Number(player.id))}
                showRoles={showRoles}
                visibleRolePlayerId={visibleRolePlayerId}
                currentSpeakerId={currentSpeakerId}
                onPlayerSelect={onPlayerSelect}
                key={player.id}
              />
            ))}
          </section>
        </div>

        <section className="werewolf-center-card" aria-live="polite">
          <span className="werewolf-phase-kicker">{currentRound?.phase === 'night' ? '夜晚行动' : currentRound?.phase === 'day' ? '白天议事' : '实时观战'}</span>
          <h2>{currentRound ? `${currentRound.phase === 'night' ? '夜晚' : '白天'}第 ${currentRound.day || 1} 轮` : '等待开局'}</h2>
          <dl>
            <div><dt>存活玩家</dt><dd>{stats.alive}</dd></div>
            <div><dt>出局玩家</dt><dd>{stats.dead}</dd></div>
          </dl>
          <p>{streamMessage}</p>
          <strong>{getRoundResult(currentRound, orderedPlayers)}</strong>
        </section>
      </section>

      <aside className="werewolf-side werewolf-right-board" aria-label="狼人杀右侧记录">
        <EliminationPanel players={orderedPlayers} showRoles={showRoles} visibleRolePlayerId={visibleRolePlayerId} />
      </aside>

      <WerewolfResult game={game} />
      <NightOverlay active={nightActive} />
      <SpeechSubtitle
        speech={activeSpeech}
        players={orderedPlayers}
        getSpeakerLabel={(speech: SpeechState | null, players: Player[]) => speech?.playerId ? formatWerewolfSeatLabel(speech.playerId, players) : '主持人'}
      />
    </section>
  );
}

function getVisibleSheriffCandidates(round: WerewolfRound | null, eventCandidateIds: number[] = []): Set<number> {
  const election = round?.sheriffElection;
  if (!election || election.sheriffId || isSheriffElectionClosed(election.result)) return new Set();
  const candidateIds = eventCandidateIds.length ? eventCandidateIds : ((election.candidates || election.signedUpIds || []) as string[]).map(Number);
  return new Set(candidateIds
    .filter((id) => id && !(election.withdrawnIds || []).map(Number).includes(id)));
}

function isSheriffElectionClosed(result?: string): boolean {
  return Boolean(result && result !== 'pending');
}
