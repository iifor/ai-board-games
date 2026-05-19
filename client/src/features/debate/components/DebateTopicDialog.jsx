import React, { useMemo } from 'react';
import { MessageSquareText, X } from 'lucide-react';
import { classNames } from '../../../utils/classNames';
import { HostSelector } from '../../../components/common/HostSelector';
import { DebateTeamColumn } from './DebateTeamColumn';
import { DraggableDebatePlayer } from './DraggableDebatePlayer';
import {
  normalizeDebateTeamDraft,
  getDebateTeamKey,
  findDebateTeamSlot,
  removeDebatePlayerIds
} from '../debateUtils';

export function DebateTopicDialog({
  topic,
  onChange,
  selectedPlayerIds,
  players,
  teams,
  selectedHostId,
  onHostChange,
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
  const effectiveTeams = teams;
  const normalizedTeams = normalizeDebateTeamDraft(effectiveTeams, effectivePlayerIds);
  const proIds = normalizedTeams.proIds;
  const conIds = normalizedTeams.conIds;
  const judgeIds = normalizedTeams.judgeIds;
  const proCaptainId = captainEnabled ? normalizedTeams.proCaptainId : null;
  const conCaptainId = captainEnabled ? normalizedTeams.conCaptainId : null;
  const judgeSlotCount = Math.max(0, effectivePlayerIds.length - 8);
  const canStart = Boolean(effectiveTopic.title?.trim() && effectiveTopic.proPosition?.trim() && effectiveTopic.conPosition?.trim() && proIds.filter(Boolean).length === 4 && conIds.filter(Boolean).length === 4);
  const update = (key, value) => {
    if (isReplayLocked) return;
    onChange({ ...topic, [key]: value });
  };
  const playerMap = useMemo(() => new Map(players.map((player) => [Number(player.id), player])), [players]);
  const selectedPlayers = effectivePlayerIds.map((id) => playerMap.get(Number(id)) || { id, nickname: `${id}号` });
  const getPlayer = (id) => selectedPlayers.find((player) => Number(player.id) === Number(id));
  const assignedIds = new Set([...proIds, ...conIds, ...judgeIds].map(Number));
  const audiencePlayers = selectedPlayers.filter((player) => !assignedIds.has(Number(player.id)));

  const assignPlayerToSlot = (playerId, side, index) => {
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
  };

  const handleDrop = (event, side, index) => {
    if (isReplayLocked) return;
    event.preventDefault();
    const value = event.dataTransfer.getData('text/plain');
    if (value.startsWith('captain:')) return;
    assignPlayerToSlot(value, side, index);
  };

  const returnPlayerToAudience = (event) => {
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
  };

  const setCaptain = (side, playerId) => {
    if (isReplayLocked || !captainEnabled) return;
    const id = Number(playerId);
    if (!id) return;
    if (side === 'pro' && proIds.includes(id)) {
      onTeamsChange(normalizeDebateTeamDraft({ ...normalizedTeams, proCaptainId: id }, effectivePlayerIds));
    }
    if (side === 'con' && conIds.includes(id)) {
      onTeamsChange(normalizeDebateTeamDraft({ ...normalizedTeams, conCaptainId: id }, effectivePlayerIds));
    }
  };

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

        <section className="debate-topic-fields">
          <label>
            <span>辩题 <b>*</b></span>
            <input value={effectiveTopic.title} onChange={(event) => update('title', event.target.value)} placeholder="请输入本场辩题" disabled={isReplayLocked} />
          </label>
          <div className="debate-position-row">
            <label>
              <span>正方 <b>*</b></span>
              <input value={effectiveTopic.proPosition} onChange={(event) => update('proPosition', event.target.value)} placeholder="请输入正方观点" disabled={isReplayLocked} />
            </label>
            <label>
              <span>反方 <b>*</b></span>
              <input value={effectiveTopic.conPosition} onChange={(event) => update('conPosition', event.target.value)} placeholder="请输入反方观点" disabled={isReplayLocked} />
            </label>
          </div>
        </section>

        <section className="debate-team-board">
          <DebateTeamColumn title="正方" tone="pro" ids={proIds} slots={4} labelPrefix="正方" getPlayer={getPlayer} captainId={proCaptainId} onCaptainDrop={setCaptain} onDrop={handleDrop} disabled={isReplayLocked} captainEnabled={captainEnabled} />
          <DebateTeamColumn title="评委" tone="judge" ids={judgeIds} slots={judgeSlotCount} labelPrefix="评委" getPlayer={getPlayer} onDrop={handleDrop} disabled={isReplayLocked} />
          <DebateTeamColumn title="反方" tone="con" ids={conIds} slots={4} labelPrefix="反方" getPlayer={getPlayer} captainId={conCaptainId} onCaptainDrop={setCaptain} onDrop={handleDrop} disabled={isReplayLocked} captainEnabled={captainEnabled} />
        </section>

        <HostSelector
          players={players}
          selectedHostId={selectedHostId}
          onChange={onHostChange}
          className="debate-host-config"
          listClassName="debate-host-list"
          description="可将任意 AI 玩家设为本局主持人，不占用正反方或评委席位"
        />

        <section
          className="debate-player-pool"
          onDragOver={(event) => !isReplayLocked && event.preventDefault()}
          onDrop={returnPlayerToAudience}
        >
          <div className="player-pool-head">
            <strong>观众席（{audiencePlayers.length}名）</strong>
            <span>拖入正方、反方或评委席才会参与本局；从比赛席拖回这里则移出本局。</span>
          </div>
          <div className="player-pool-list">
            {audiencePlayers.map((player) => (
              <DraggableDebatePlayer player={player} key={player.id} />
            ))}
            {!audiencePlayers.length && <em className="player-pool-empty">观众席为空</em>}
          </div>
        </section>

        <footer>
          <div className="debate-topic-switches">
            <button
              type="button"
              className={classNames('dialog-switch', captainEnabled && 'active')}
              onClick={() => onCaptainEnabledChange?.(!captainEnabled)}
              disabled={isReplayLocked && !captainEnabled}
              title={isReplayLocked && !captainEnabled ? '导入对局未配置队长' : '切换本局是否启用队长'}
            >
              <span className="switch-track"><i /></span>
              <strong>{captainEnabled ? '队长开启' : '无队长'}</strong>
            </button>
            <button type="button" className={classNames('dialog-switch', speechEnabled && 'active')} onClick={() => onSpeechEnabledChange(!speechEnabled)}>
              <span className="switch-track"><i /></span>
              <strong>{speechEnabled ? '语音开启' : '语音关闭'}</strong>
            </button>
          </div>
          <button type="button" className="primary debate-start-submit" onClick={() => onStart(effectiveTopic, normalizedTeams, selectedHostId)} disabled={!canStart}>保存并开始</button>
        </footer>
      </section>
    </div>
  );
}
