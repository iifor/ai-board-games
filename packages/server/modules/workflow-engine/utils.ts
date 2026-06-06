import crypto from 'crypto';
import type {
  MatchRow,
  MatchSnapshotRow,
  WorkflowEventRow,
  PendingActionRow,
  AiTaskRow,
  ActionWindowEpochRow,
  WorkflowEffectRow,
  WorkflowInterruptRow,
} from '../../types/database';
import type {
  Match,
  MatchSnapshot,
  WorkflowEvent,
  PendingAction,
  AiTask,
  ActionWindowEpoch,
  WorkflowEffect,
  WorkflowInterrupt,
} from '../../types/workflow';

function nowIso(): string {
  return new Date().toISOString();
}

function toJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (value == null || value === '') return fallback;
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

function createId(prefix: string): string {
  return `${prefix}-${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
}

function stableTaskId(matchId: string, stepId: string, taskKey: string): string {
  return crypto.createHash('sha1').update(`${matchId}:${stepId}:${taskKey}`).digest('hex').slice(0, 24);
}

function publicMatch(row: MatchRow | null | undefined): Match | null {
  if (!row) return null;
  return {
    id: row.id,
    gameType: row.game_type,
    workflowId: row.workflow_id,
    status: row.status,
    currentStepIndex: row.current_step_index,
    version: row.version,
    config: parseJson<Record<string, unknown>>(row.config_json, {}),
    state: parseJson<Record<string, unknown>>(row.state_json, {}),
    blockers: parseJson(row.blockers_json, []),
    error: parseJson(row.error_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    completedAt: row.completed_at ?? undefined,
  };
}

function rowToEvent(row: WorkflowEventRow | null | undefined): WorkflowEvent | null {
  if (!row) return null;
  const visibility = row.visibility;
  const channel = row.channel || (visibility === 'public' ? 'public' : visibility === 'system' ? 'system' : 'scope');
  return {
    id: row.id,
    matchId: row.match_id,
    seq: row.seq,
    type: row.type,
    stepId: row.step_id || undefined,
    playerId: row.player_id || undefined,
    payload: parseJson(row.payload_json, {}),
    visibility,
    channel,
    scopeKey: row.scope_key || undefined,
    visibleToPlayerIds: parseJson(row.visible_to_player_ids_json, []),
    idempotencyKey: row.idempotency_key || undefined,
    createdAt: row.created_at,
  };
}

function rowToTask(row: AiTaskRow | null | undefined): AiTask | null {
  if (!row) return null;
  return {
    id: row.id,
    matchId: row.match_id,
    stepId: row.step_id,
    taskKey: row.task_key,
    epochId: row.epoch_id || undefined,
    playerId: row.player_id || undefined,
    action: row.action,
    status: row.status,
    prompt: parseJson(row.prompt_json, {}),
    promptContextSnapshot: parseJson(row.context_json, {}),
    rawOutput: row.raw_output || '',
    result: parseJson(row.result_json, null),
    error: parseJson(row.error_json, null),
    attempts: row.attempts,
    workerId: row.worker_id || undefined,
    claimedAt: row.claimed_at || undefined,
    visibleEventSeqMax: row.visible_event_seq_max,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToPendingAction(row: PendingActionRow | null | undefined): PendingAction | null {
  if (!row) return null;
  return {
    id: row.id,
    matchId: row.match_id,
    stepId: row.step_id,
    epochId: row.epoch_id || undefined,
    playerId: row.player_id || undefined,
    actorType: row.actor_type,
    actionType: row.action_type,
    status: row.status,
    payload: parseJson(row.payload_json, {}),
    resultEventSeq: row.result_event_seq || undefined,
    idempotencyKey: row.idempotency_key,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToSnapshot(row: MatchSnapshotRow | null | undefined): MatchSnapshot | null {
  if (!row) return null;
  return {
    id: row.id,
    matchId: row.match_id,
    version: row.version,
    status: row.status,
    currentStepIndex: row.current_step_index,
    lastEventSeq: row.last_event_seq == null ? undefined : Number(row.last_event_seq),
    state: parseJson<Record<string, unknown>>(row.state_json, {}),
    blockers: parseJson(row.blockers_json, []),
    createdAt: row.created_at,
  };
}

function rowToActionWindowEpoch(row: ActionWindowEpochRow | null | undefined): ActionWindowEpoch | null {
  if (!row) return null;
  return {
    id: row.id,
    matchId: row.match_id,
    stepId: row.step_id,
    actionType: row.action_type,
    status: row.status,
    window: parseJson<Record<string, unknown>>(row.window_json, {}),
    createdEventSeq: row.created_event_seq || undefined,
    resolvedEventSeq: row.resolved_event_seq || undefined,
    expiresAt: row.expires_at || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToWorkflowEffect(row: WorkflowEffectRow | null | undefined): WorkflowEffect | null {
  if (!row) return null;
  return {
    id: row.id,
    matchId: row.match_id,
    stepId: row.step_id || undefined,
    sourceEventSeq: row.source_event_seq || undefined,
    effectType: row.effect_type,
    status: row.status,
    priority: row.priority,
    payload: parseJson(row.payload_json, {}),
    appliedEventSeq: row.applied_event_seq || undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function rowToWorkflowInterrupt(row: WorkflowInterruptRow | null | undefined): WorkflowInterrupt | null {
  if (!row) return null;
  return {
    id: row.id,
    matchId: row.match_id,
    stepId: row.step_id || undefined,
    effectId: row.effect_id || undefined,
    interruptType: row.interrupt_type,
    status: row.status,
    priority: row.priority,
    payload: parseJson(row.payload_json, {}),
    resolution: parseJson(row.resolution_json, null),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export {
  nowIso,
  toJson,
  parseJson,
  createId,
  stableTaskId,
  publicMatch,
  rowToEvent,
  rowToTask,
  rowToPendingAction,
  rowToSnapshot,
  rowToActionWindowEpoch,
  rowToWorkflowEffect,
  rowToWorkflowInterrupt,
};
