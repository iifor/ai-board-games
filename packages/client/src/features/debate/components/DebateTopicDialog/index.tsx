import React, { useMemo } from 'react';
import { MessageSquareText, X } from 'lucide-react';
import { DebateDialogFooter } from '../DebateDialogFooter';
import { DebatePlayerPool } from '../DebatePlayerPool';
import { DebateTeamBoard } from '../DebateTeamBoard';
import { DebateTopicFields } from '../DebateTopicFields';
import { HostSeat } from '../../../../components/common/HostSeat';
import {
  normalizeDebateTeamDraft,
  getDebateTeamKey,
  findDebateTeamSlot,
  removeDebatePlayerIds
} from '../../debateUtils';
import './index.css';
import type { Player, DebateTopic, DebateTeamDraft } from '../../../../types';

interface DebateTopicDialogProps {
  topic: DebateTopic;
  onChange: (topic: DebateTopic) => void;
  selectedPlayerIds: number[];
  players: Player[];
  teams: DebateTeamDraft;
  onTeamsChange: (teams: DebateTeamDraft) => void;
  captainEnabled: boolean;
  onCaptainEnabledChange: (enabled: boolean) => void;
  speechEnabled: boolean;
  onSpeechEnabledChange: (enabled: boolean) => void;
  hostId: number | null;
  onHostChange: (id: number | null) => void;
  onCancel: () => void;
  onStart: (topic: DebateTopic, teams: DebateTeamDraft, opts: { hostId: number | null }) => void;
}

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
  hostId,
  onHostChange,
  onCancel,
  onStart
}: DebateTopicDialogProps) {
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
  const selectedPlayers = effectivePlayerIds.map((id) => playerMap.get(Number(id)) || { id, nickname: `${id}号` } as Player);
  const getPlayer = (id: number | null): Player | undefined => selectedPlayers.find((player) => Number(player.id) === Number(id));
  const hostPlayer = players.find((p) => Number(p.id) === Number(hostId)) || null;
  const assignedIds = new Set([...proIds, ...conIds, ...judgeIds].map(Number));
  const audiencePlayers = selectedPlayers.filter((player) => !assignedIds.has(Number(player.id)));

  function update(key: keyof DebateTopic, value: string): void {
    if (isReplayLocked) return;
    onChange({ ...topic, [key]: value });
  }

  function assignPlayerToSlot(playerId: number | string, side: string, index: number): void {
    if (isReplayLocked) return;
    const id = Number(playerId);
    if (!id) return;
    const current: DebateTeamDraft = { proIds: [...proIds], conIds: [...conIds], judgeIds: [...judgeIds], proCaptainId: normalizedTeams.proCaptainId, conCaptainId: normalizedTeams.conCaptainId };
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
    (next[targetKey] as (number | undefined)[])[index] = id;
    if (targetOccupant && source) (next[getDebateTeamKey(source.side)] as (number | undefined)[])[source.index] = targetOccupant;
    onTeamsChange(normalizeDebateTeamDraft(next as Partial<DebateTeamDraft>, effectivePlayerIds));
  }

  function handleDrop(event: React.DragEvent, side: string, index: number): void {
    if (isReplayLocked) return;
    event.preventDefault();
    const value = event.dataTransfer.getData('text/plain');
    if (value.startsWith('captain:')) return;
    assignPlayerToSlot(value, side, index);
  }

  function returnPlayerToAudience(event: React.DragEvent): void {
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

  function setCaptain(side: string, playerId: number): void {
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
        <HostSeat
          hostPlayer={hostPlayer}
          players={players}
          onSelect={(id) => onHostChange?.(id)}
          onRemove={() => onHostChange?.(null)}
        />
        <DebatePlayerPool players={audiencePlayers} disabled={isReplayLocked} onDrop={returnPlayerToAudience} />
        <DebateDialogFooter
          captainEnabled={captainEnabled}
          speechEnabled={speechEnabled}
          replayLocked={isReplayLocked}
          canStart={canStart}
          onCaptainEnabledChange={onCaptainEnabledChange}
          onSpeechEnabledChange={onSpeechEnabledChange}
          onStart={() => onStart(effectiveTopic, normalizedTeams, { hostId })}
        />
      </section>
    </div>
  );
}
