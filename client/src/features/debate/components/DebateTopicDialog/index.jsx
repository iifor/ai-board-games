import React, { useMemo } from 'react';
import { MessageSquareText, X } from 'lucide-react';
import { DebateDialogFooter } from '../DebateDialogFooter';
import { DebatePlayerPool } from '../DebatePlayerPool';
import { DebateTeamBoard } from '../DebateTeamBoard';
import { DebateTopicFields } from '../DebateTopicFields';
import {
  normalizeDebateTeamDraft,
  getDebateTeamKey,
  findDebateTeamSlot,
  removeDebatePlayerIds
} from '../../debateUtils';
import './index.css';

export function DebateTopicDialog({
  topic,
  onChange,
  selectedPlayerIds,
  players,
  teams,
  onTeamsChange,
  captainEnabled,
  onCaptainEnabledChange,
  speechEnabled,
  onSpeechEnabledChange,
  onCancel,
  onStart
}) {
  const isReplayLocked = false;
  const effectiveTopic = topic;
  const effectivePlayerIds = selectedPlayerIds;
  const normalizedTeams = normalizeDebateTeamDraft(teams, effectivePlayerIds);
  const proIds = normalizedTeams.proIds;
  const conIds = normalizedTeams.conIds;
  const judgeIds = normalizedTeams.judgeIds;
  const proCaptainId = captainEnabled ? normalizedTeams.proCaptainId : null;
  const conCaptainId = captainEnabled ? normalizedTeams.conCaptainId : null;
  const judgeSlotCount = Math.max(0, effectivePlayerIds.length - 8);
  const canStart = Boolean(
    effectiveTopic.title?.trim()
    && effectiveTopic.proPosition?.trim()
    && effectiveTopic.conPosition?.trim()
    && proIds.filter(Boolean).length === 4
    && conIds.filter(Boolean).length === 4
  );
  const playerMap = useMemo(() => new Map(players.map((player) => [Number(player.id), player])), [players]);
  const selectedPlayers = effectivePlayerIds.map((id) => playerMap.get(Number(id)) || { id, nickname: `${id}号` });
  const getPlayer = (id) => selectedPlayers.find((player) => Number(player.id) === Number(id));
  const assignedIds = new Set([...proIds, ...conIds, ...judgeIds].map(Number));
  const audiencePlayers = selectedPlayers.filter((player) => !assignedIds.has(Number(player.id)));

  function update(key, value) {
    if (isReplayLocked) return;
    onChange({ ...topic, [key]: value });
  }

  function assignPlayerToSlot(playerId, side, index) {
    if (isReplayLocked) return;
    const id = Number(playerId);
    if (!id) return;
    const current = { proIds: [...proIds], conIds: [...conIds], judgeIds: [...judgeIds] };
    const targetKey = getDebateTeamKey(side);
    const target = current[targetKey];
    const capacity = side === 'judge' ? judgeSlotCount : 4;
    const source = findDebateTeamSlot(current, id);
    const targetOccupant = Number(target[index]) || null;
    if (source?.side === side && source.index === index) return;
    if (index >= capacity) return;

    const next = {
      proIds: removeDebatePlayerIds(current.proIds, id, targetOccupant),
      conIds: removeDebatePlayerIds(current.conIds, id, targetOccupant),
      judgeIds: removeDebatePlayerIds(current.judgeIds, id, targetOccupant)
    };
    next[targetKey][index] = id;
    if (targetOccupant && source) next[getDebateTeamKey(source.side)][source.index] = targetOccupant;
    onTeamsChange(normalizeDebateTeamDraft(next, effectivePlayerIds));
  }

  function handleDrop(event, side, index) {
    if (isReplayLocked) return;
    event.preventDefault();
    const value = event.dataTransfer.getData('text/plain');
    if (value.startsWith('captain:')) return;
    assignPlayerToSlot(value, side, index);
  }

  function returnPlayerToAudience(event) {
    if (isReplayLocked) return;
    event.preventDefault();
    const id = Number(event.dataTransfer.getData('text/plain'));
    if (!id) return;
    onTeamsChange(normalizeDebateTeamDraft({
      ...normalizedTeams,
      proIds: proIds.filter((item) => Number(item) !== id),
      conIds: conIds.filter((item) => Number(item) !== id),
      judgeIds: judgeIds.filter((item) => Number(item) !== id),
      proCaptainId: Number(proCaptainId) === id ? null : proCaptainId,
      conCaptainId: Number(conCaptainId) === id ? null : conCaptainId
    }, effectivePlayerIds));
  }

  function setCaptain(side, playerId) {
    if (isReplayLocked || !captainEnabled) return;
    const id = Number(playerId);
    if (!id) return;
    if (side === 'pro' && proIds.includes(id)) {
      onTeamsChange(normalizeDebateTeamDraft({ ...normalizedTeams, proCaptainId: id }, effectivePlayerIds));
    }
    if (side === 'con' && conIds.includes(id)) {
      onTeamsChange(normalizeDebateTeamDraft({ ...normalizedTeams, conCaptainId: id }, effectivePlayerIds));
    }
  }

  return (
    <div className="debate-topic-backdrop" role="presentation">
      <section className="debate-topic-dialog" role="dialog" aria-modal="true" aria-label="辩论赛设置">
        <header>
          <div className="debate-dialog-title">
            <span><MessageSquareText size={24} /></span>
            <h2>辩论赛设置</h2>
          </div>
          <button type="button" className="debate-topic-close" onClick={onCancel} aria-label="关闭">
            <X size={28} />
          </button>
        </header>

        <DebateTopicFields topic={effectiveTopic} disabled={isReplayLocked} onChange={update} />
        <DebateTeamBoard
          proIds={proIds}
          conIds={conIds}
          judgeIds={judgeIds}
          judgeSlotCount={judgeSlotCount}
          proCaptainId={proCaptainId}
          conCaptainId={conCaptainId}
          captainEnabled={captainEnabled}
          disabled={isReplayLocked}
          getPlayer={getPlayer}
          onCaptainDrop={setCaptain}
          onDrop={handleDrop}
        />
        <DebatePlayerPool players={audiencePlayers} disabled={isReplayLocked} onDrop={returnPlayerToAudience} />
        <DebateDialogFooter
          captainEnabled={captainEnabled}
          speechEnabled={speechEnabled}
          replayLocked={isReplayLocked}
          canStart={canStart}
          onCaptainEnabledChange={onCaptainEnabledChange}
          onSpeechEnabledChange={onSpeechEnabledChange}
          onStart={() => onStart(effectiveTopic, normalizedTeams)}
        />
      </section>
    </div>
  );
}
