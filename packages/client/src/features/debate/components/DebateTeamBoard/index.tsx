import React from 'react';
import { DebateTeamColumn } from '../DebateTeamColumn';
import './index.css';
import type { Player } from '../../../../types';

interface DebateTeamBoardProps {
  proIds: (number | null)[];
  conIds: (number | null)[];
  judgeIds: (number | null)[];
  judgeSlotCount: number;
  proCaptainId?: number | null;
  conCaptainId?: number | null;
  captainEnabled: boolean;
  disabled: boolean;
  getPlayer: (id: number | null) => Player | undefined;
  onCaptainDrop: (side: string, playerId: number) => void;
  onDrop: (event: React.DragEvent, side: string, index: number) => void;
}

export function DebateTeamBoard({
  proIds,
  conIds,
  judgeIds,
  judgeSlotCount,
  proCaptainId,
  conCaptainId,
  captainEnabled,
  disabled,
  getPlayer,
  onCaptainDrop,
  onDrop
}: DebateTeamBoardProps) {
  return (
    <section className="debate-team-board">
      <DebateTeamColumn title="正方" tone="pro" ids={proIds} slots={4} labelPrefix="正方" getPlayer={getPlayer} captainId={proCaptainId} onCaptainDrop={onCaptainDrop} onDrop={onDrop} disabled={disabled} captainEnabled={captainEnabled} />
      <DebateTeamColumn title="评委" tone="judge" ids={judgeIds} slots={judgeSlotCount} labelPrefix="评委" getPlayer={getPlayer} onDrop={onDrop} disabled={disabled} />
      <DebateTeamColumn title="反方" tone="con" ids={conIds} slots={4} labelPrefix="反方" getPlayer={getPlayer} captainId={conCaptainId} onCaptainDrop={onCaptainDrop} onDrop={onDrop} disabled={disabled} captainEnabled={captainEnabled} />
    </section>
  );
}
