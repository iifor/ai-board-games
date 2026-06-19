import { useMemo, type CSSProperties } from 'react';
import { Activity, CircleDot, Moon, Shield, Sun } from 'lucide-react';
import { RoleConfigPanel } from '../../../werewolf/components/RoleConfigPanel';
import { RoundProgressPanel } from '../../../werewolf/components/RoundProgressPanel';
import { WerewolfSeat } from '../../../werewolf/components/WerewolfSeat';
import { WerewolfResult } from '../../../werewolf/components/WerewolfResult';
import { NightOverlay } from '../../../werewolf/components/NightOverlay';
import {
  formatWerewolfSeatLabel,
  getGameStats,
  getPhaseTitle,
  getRoundResult,
  getWerewolfActionTarget,
  getWerewolfNightActionBadges,
  getWerewolfSeatNumber,
  resolveActiveSheriffId,
  shouldShowWerewolfActionTargets
} from '../../../werewolf/utils';
import type { Player, WerewolfRound } from '../../../../types';
import type { WerewolfGameArenaProps } from '../../../werewolf/WerewolfGame';
import { WerewolfBottomSpeechBar } from '../WerewolfBottomSpeechBar';
import { WerewolfSpeechLogPanel } from '../WerewolfSpeechLogPanel';
import './index.css';

export function WerewolfArenaV2({
  game,
  mode,
  currentRound,
  currentSpeakerId,
  nightActionPlayerIds,
  nightActionType,
  seerCheckTarget,
  sheriffCandidateIds,
  hunterShotFromId,
  activeSpeech,
  eventLog,
  showRoles,
  visibleRolePlayerId,
  streamMessage,
  onShowRolesChange: _onShowRolesChange,
  onPlayerSelect
}: WerewolfGameArenaProps) {
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
  const currentSpeakerLabel = activeSpeech?.playerId ? formatWerewolfSeatLabel(activeSpeech.playerId, orderedPlayers) : '等待发言';

  return (
    <section className={nightActive ? 'werewolf-v2-arena night-active' : 'werewolf-v2-arena'}>
      <aside className="werewolf-v2-left" aria-label="狼人杀左侧信息">
        <section className="werewolf-v2-room-card">
          <div className="werewolf-v2-room-card__brand">
            <span aria-hidden="true"><Shield size={24} /></span>
            <div>
              <strong>AI 狼人杀</strong>
              <small>{mode?.name || '标准 12 人局'}</small>
            </div>
          </div>
          <p>房间号 <b>{String(game.id || '9527').slice(-4)}</b></p>
        </section>

        <RoleConfigPanel players={orderedPlayers} mode={mode} showRoles={showRoles} />

        <section className="werewolf-v2-status-panel">
          <header>
            <CircleDot size={17} />
            <strong>对局状态</strong>
            <span>游戏进行中</span>
          </header>
          <dl>
            <div><dt>存活玩家</dt><dd>{stats.alive}</dd></div>
            <div><dt>出局玩家</dt><dd>{stats.dead}</dd></div>
          </dl>
          <p><Shield size={15} />昨夜结果：{getRoundResult(currentRound, orderedPlayers) || '暂无结果'}</p>
        </section>

        <RoundProgressPanel rounds={(game.rounds || []) as WerewolfRound[]} currentRound={currentRound} />
      </aside>

      <main className="werewolf-v2-stage" aria-label="狼人杀竞技舞台">
        <section className="werewolf-v2-phase-pill" aria-live="polite">
          {currentRound?.phase === 'night' ? <Moon size={22} /> : <Sun size={22} />}
          <strong>{currentRound ? `第${currentRound.day || 1}天 · ${currentRound.phase === 'night' ? '夜晚' : '白天'} · ${phaseTitle}` : phaseTitle}</strong>
        </section>

        <section className="werewolf-v2-orbit" aria-label="玩家环形座位">
          <div className="werewolf-v2-table-ring" aria-hidden="true" />
          <section className="werewolf-table" style={{ '--seat-count': orderedPlayers.length } as CSSProperties} aria-label="狼人杀玩家座位">
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
                roleActionOverlay={hunterShotFromId && Number(hunterShotFromId) === Number(player.id) ? <img className="werewolf-role-action-overlay" src="/resources/public/gun.gif" alt="" aria-hidden="true" /> : null}
                showRoles={showRoles}
                visibleRolePlayerId={visibleRolePlayerId}
                currentSpeakerId={currentSpeakerId}
                onPlayerSelect={onPlayerSelect}
                key={player.id}
              />
            ))}
          </section>

          <section className="werewolf-v2-center-card" aria-live="polite">
            <span>{currentRound?.phase === 'night' ? '夜晚行动' : '白天议事'}</span>
            <h2>{currentRound ? `${currentRound.phase === 'night' ? '夜晚' : '白天'}第 ${currentRound.day || 1} 轮` : '游戏准备中'}</h2>
            <p>当前发言</p>
            <strong>{currentSpeakerLabel}</strong>
            <dl>
              <div><dt>存活</dt><dd>{stats.alive}</dd></div>
              <div><dt>出局</dt><dd>{stats.dead}</dd></div>
            </dl>
            <em><Activity size={15} />{streamMessage}</em>
          </section>
        </section>

        <WerewolfBottomSpeechBar speech={activeSpeech} players={orderedPlayers} streamMessage={streamMessage} />
      </main>

      <aside className="werewolf-v2-right" aria-label="狼人杀右侧发言记录">
        <WerewolfSpeechLogPanel eventLog={eventLog} activeSpeech={activeSpeech} players={orderedPlayers} />
      </aside>

      <WerewolfResult game={game} />
      <NightOverlay active={nightActive} />
    </section>
  );
}

function getVisibleSheriffCandidates(round: WerewolfRound | null, eventCandidateIds: number[] = []): Set<number> {
  const election = round?.sheriffElection;
  if (!election || election.sheriffId || isSheriffElectionClosed(election.result)) return new Set();
  const candidateIds = eventCandidateIds.length ? eventCandidateIds : ((election.candidates || election.signedUpIds || []) as string[]).map(Number);
  return new Set(candidateIds.filter((id) => id && !(election.withdrawnIds || []).map(Number).includes(id)));
}

function isSheriffElectionClosed(result?: string): boolean {
  return Boolean(result && result !== 'pending');
}
