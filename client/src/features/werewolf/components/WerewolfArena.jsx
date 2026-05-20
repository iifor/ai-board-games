import React, { useMemo } from 'react';
import { SpeechSubtitle } from '../../../components/SpeechSubtitle';
import { getGameStats, getPhaseTitle, getRoundResult, getWerewolfActionTarget, shouldShowWerewolfActionTargets } from '../werewolfUtils';
import { WerewolfBrandPanel } from './WerewolfBrandPanel';
import { RoleConfigPanel } from './RoleConfigPanel';
import { RoundProgressPanel } from './RoundProgressPanel';
import { EliminationPanel } from './EliminationPanel';
import { WerewolfSeat } from './WerewolfSeat';
import { WerewolfResult } from './WerewolfResult';
import './WerewolfArena.css';

export function WerewolfArena({
  game,
  mode,
  currentRound,
  currentSpeakerId,
  activeSpeech,
  showRoles,
  visibleRolePlayerId,
  streamMessage,
  onShowRolesChange,
  onPlayerSelect
}) {
  const orderedPlayers = useMemo(
    () => (game.players || []).slice().sort((a, b) => Number(a.id) - Number(b.id)),
    [game.players]
  );
  const stats = getGameStats(orderedPlayers);
  const phaseTitle = getPhaseTitle(currentRound, streamMessage);

  return (
    <section className="werewolf-arena">
      <aside className="werewolf-side werewolf-left-board" aria-label="狼人杀左侧信息">
        <WerewolfBrandPanel game={game} mode={mode} showRoles={showRoles} onShowRolesChange={onShowRolesChange} />
        <RoleConfigPanel players={orderedPlayers} mode={mode} showRoles={showRoles} />
        <RoundProgressPanel rounds={game.rounds || []} currentRound={currentRound} />
      </aside>

      <section className="werewolf-orbit-stage" aria-label="狼人杀玩家圆桌">
        <div className="werewolf-scoreboard">
          <span>{game.event?.mode || mode?.name || '标准局'}</span>
          <h2>{currentRound ? `第 ${currentRound.day || 1} 天 · ${phaseTitle}` : '月夜圆桌等待开局'}</h2>
        </div>

        <div className="werewolf-table-ring" aria-hidden="true">
          <section className="werewolf-table" style={{ '--seat-count': orderedPlayers.length }} aria-label="狼人杀玩家座位">
            {orderedPlayers.map((player, index) => (
              <WerewolfSeat
                player={player}
                seatIndex={index}
                actionTarget={shouldShowWerewolfActionTargets(currentRound) ? getWerewolfActionTarget(currentRound, player) : null}
                isSheriff={Number(currentRound?.sheriffId) === Number(player.id)}
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
          <strong>{getRoundResult(currentRound)}</strong>
        </section>
      </section>

      <aside className="werewolf-side werewolf-right-board" aria-label="狼人杀右侧记录">
        <EliminationPanel players={orderedPlayers} showRoles={showRoles} visibleRolePlayerId={visibleRolePlayerId} />
      </aside>

      <WerewolfResult game={game} />
      <SpeechSubtitle speech={activeSpeech} />
    </section>
  );
}
