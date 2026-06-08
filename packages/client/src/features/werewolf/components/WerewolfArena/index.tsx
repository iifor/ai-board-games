import { useMemo } from 'react';
import { SpeechSubtitle } from '../../../../components/SpeechSubtitle';
import { formatWerewolfSeatLabel, getGameStats, getPhaseTitle, getRoundResult, getWerewolfActionTarget, getWerewolfNightActionBadges, getWerewolfSeatNumber, resolveActiveSheriffId, shouldShowWerewolfActionTargets } from '../../utils';
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
  hunterShotFromId?: number | null;
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
  hunterShotFromId = null,
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
  const activeSheriffId = resolveActiveSheriffId((game.rounds || []) as WerewolfRound[], currentRound);
  const nightActors = new Set((nightActionPlayerIds || []).map(Number));
  const nightActive = currentRound?.phase === 'night' || !game?.rounds?.length;

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
                isSheriff={Number(activeSheriffId) === Number(player.id)}
                isSheriffCandidate={sheriffCandidates.has(Number(player.id))}
                nightActionType={nightActionType}
                roleActionOverlay={getRoleActionOverlay(player, nightActionType, hunterShotFromId, currentRound, nightActors)}
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
          <h2>{currentRound ? `${currentRound.phase === 'night' ? '夜晚' : '白天'}第 ${currentRound.day || 1} 轮` : '游戏准备中'}</h2>
          <dl>
            <div><dt>存活玩家</dt><dd>{stats.alive}</dd></div>
            <div><dt>出局玩家</dt><dd>{stats.dead}</dd></div>
          </dl>
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

function getRoleActionOverlay(
  player: Player,
  nightActionType: string,
  hunterShotFromId: number | null,
  currentRound: WerewolfRound | null,
  nightActors: Set<number>
): React.ReactNode {
  const pid = Number(player.id);

  // 猎人开枪：覆盖 gun.gif（独立事件触发，可能发生在白天）
  if (hunterShotFromId === pid) return <img className="werewolf-role-action-overlay" src="/resources/public/gun.gif" alt="" aria-hidden="true" />;
  // 白痴翻牌：覆盖 idiotReveal.jpg（轮次数据驱动，发生在白天）
  if (currentRound?.idiotReveal && Number(currentRound.idiotReveal.id) === pid) return <img className="werewolf-role-action-overlay" src="/resources/public/idiotReveal.jpg" alt="" aria-hidden="true" />;
  // 预言家查验结果：基于角色而非行动者列表，避免 seer-wake 清除 actorIds 后 GIF 不出现
  if (nightActionType === 'seer-check' && player.role === 'seer') return <img className="werewolf-role-action-overlay" src="/resources/public/seer-wake.jpg" alt="" aria-hidden="true" />;

  // 以下夜间行动覆盖仅在夜晚阶段 + 玩家是当前夜间行动者时展示
  // 用 phase 做兜底：workflow-event 会绕过 updateNightActionType，导致 nightActionType 白天不清理
  if (currentRound?.phase !== 'night') return null;
  if (!nightActors.has(pid)) return null;

  // 女巫解药：睁眼阶段不显示覆盖层，行动完成后显示 antidote.gif
  if (nightActionType === 'witch-antidote-action' && player.role === 'witch') {
    return <img className="werewolf-role-action-overlay" src="/resources/public/antidote.gif" alt="" aria-hidden="true" />;
  }
  if (nightActionType === 'witch-antidote' && player.role === 'witch') {
    return null; // 睁眼阶段：等主持人播报完成后再显示结果
  }

  // 女巫毒药：睁眼阶段不显示覆盖层，行动完成后显示 poison.gif
  if (nightActionType === 'witch-poison-action' && player.role === 'witch') {
    return <img className="werewolf-role-action-overlay" src="/resources/public/poison.gif" alt="" aria-hidden="true" />;
  }
  if (nightActionType === 'witch-poison' && player.role === 'witch') {
    return null; // 睁眼阶段：等主持人播报完成后再显示结果
  }

  if (nightActionType === 'wolf-vote' && (player.role === 'werewolf' || player.faction === 'wolves')) return <img className="werewolf-role-action-overlay" src="/resources/public/werewolf.gif" alt="" aria-hidden="true" />;

  return null;
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
