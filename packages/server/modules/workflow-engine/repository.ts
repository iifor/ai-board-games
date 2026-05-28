import { getDb } from '../../db';
import type {
  MatchRow,
  MatchSnapshotRow,
  WorkflowEventRow,
  PendingActionRow,
  AiTaskRow,
  ActionWindowEpochRow,
  WorkflowEffectRow,
  WorkflowInterruptRow,
  OutboxMessageRow,
} from '../../types/database';
import type {
  Match,
  WorkflowEvent,
  AiTask,
  PendingAction,
  MatchSnapshot,
  ActionWindowEpoch,
  WorkflowEffect,
  WorkflowInterrupt,
} from '../../types/workflow';
import {
  nowIso,
  toJson,
  parseJson,
  publicMatch,
  rowToEvent,
  rowToTask,
  rowToPendingAction,
  rowToSnapshot,
  rowToActionWindowEpoch,
  rowToWorkflowEffect,
  rowToWorkflowInterrupt,
} from './utils';

interface MatchCreateRow {
  id: string;
  game_type: string;
  workflow_id: string;
  status: string;
  current_step_index: number;
  version: number;
  config_json: string;
  state_json: string;
  blockers_json: string;
  error_json: string;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

interface EventInput {
  matchId?: string;
  seq?: number;
  type: string;
  stepId?: string | null;
  playerId?: string | number | null;
  payload?: unknown;
  visibility?: string;
  channel?: string;
  scopeKey?: string | null;
  visibleToPlayerIds?: unknown[];
  idempotencyKey?: string | null;
  createdAt?: string;
}

interface CommitChangeInput {
  matchId: string;
  events?: EventInput[];
  matchPatch?: Record<string, unknown> | null;
  snapshot?: boolean;
}

interface CommitChangeResult {
  match: Match;
  events: WorkflowEvent[];
}

interface AiTaskCreateInput {
  id: string;
  matchId: string;
  stepId: string;
  taskKey: string;
  epochId?: string | null;
  playerId?: string | number | null;
  action: string;
  status?: string;
  prompt?: unknown;
  promptContextSnapshot?: unknown;
  visibleEventSeqMax?: number;
  visibleEventIds?: unknown[];
}

interface PendingActionCreateInput {
  id: string;
  matchId: string;
  stepId: string;
  epochId?: string | null;
  playerId?: string | number | null;
  actorType: string;
  actionType: string;
  status?: string;
  payload?: unknown;
  idempotencyKey?: string;
}

interface ActionWindowEpochInput {
  id: string;
  matchId: string;
  stepId: string;
  actionType: string;
  status?: string;
  window?: Record<string, unknown>;
  createdEventSeq?: number | null;
  resolvedEventSeq?: number | null;
  expiresAt?: string | null;
  createdAt?: string;
}

interface WorkflowEffectInput {
  id: string;
  matchId: string;
  stepId?: string | null;
  sourceEventSeq?: number | null;
  effectType: string;
  status?: string;
  priority?: number;
  payload?: unknown;
  appliedEventSeq?: number | null;
}

interface WorkflowInterruptInput {
  id: string;
  matchId: string;
  stepId?: string | null;
  effectId?: string | null;
  interruptType: string;
  status?: string;
  priority?: number;
  payload?: unknown;
  resolution?: unknown;
}

interface OutboxRow {
  id: number;
  match_id: string;
  event_seq: number;
  status: string;
  payload_json: string;
  created_at: string;
  updated_at: string;
  payload?: unknown;
}

function createMatch(row: MatchCreateRow): void {
  getDb().prepare(`
    INSERT INTO matches (
      id, game_type, workflow_id, status, current_step_index, version,
      config_json, state_json, blockers_json, error_json, created_at, updated_at, completed_at
    )
    VALUES (
      @id, @game_type, @workflow_id, @status, @current_step_index, @version,
      @config_json, @state_json, @blockers_json, @error_json, @created_at, @updated_at, @completed_at
    )
  `).run(row);
}

function getMatchRow(matchId: string): MatchRow | null {
  return (getDb().prepare('SELECT * FROM matches WHERE id = ?').get(matchId) as MatchRow | undefined) || null;
}

function getMatch(matchId: string): Match | null {
  return publicMatch(getMatchRow(matchId));
}

function updateMatch(matchId: string, patch: Record<string, unknown>): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: matchId, updated_at: nowIso() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  sets.push('updated_at = @updated_at');
  getDb().prepare(`UPDATE matches SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

function nextEventSeq(matchId: string): number {
  const row = getDb().prepare('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM workflow_events WHERE match_id = ?').get(matchId) as { seq: number } | undefined;
  return Number(row?.seq || 1);
}

function appendEvent(event: EventInput): WorkflowEventRow {
  if (event.idempotencyKey) {
    const existing = getDb().prepare('SELECT * FROM workflow_events WHERE match_id = ? AND idempotency_key = ?')
      .get(event.matchId, event.idempotencyKey) as WorkflowEventRow | undefined;
    if (existing) return existing;
  }
  const seq = event.seq || nextEventSeq(event.matchId);
  const channel = event.channel || (event.visibility === 'public' ? 'public' : event.visibility === 'system' ? 'system' : 'scope');
  const result = getDb().prepare(`
    INSERT OR IGNORE INTO workflow_events (
      match_id, seq, type, step_id, player_id, payload_json, visibility,
      channel, scope_key, visible_to_player_ids_json, idempotency_key, created_at
    )
    VALUES (
      @match_id, @seq, @type, @step_id, @player_id, @payload_json, @visibility,
      @channel, @scope_key, @visible_to_player_ids_json, @idempotency_key, @created_at
    )
  `).run({
    match_id: event.matchId,
    seq,
    type: event.type,
    step_id: event.stepId || null,
    player_id: event.playerId == null ? null : String(event.playerId),
    payload_json: toJson(event.payload || {}),
    visibility: event.visibility || 'public',
    channel,
    scope_key: event.scopeKey || null,
    visible_to_player_ids_json: toJson(event.visibleToPlayerIds || []),
    idempotency_key: event.idempotencyKey || null,
    created_at: event.createdAt || nowIso(),
  });
  if (result.changes > 0) {
    return getDb().prepare('SELECT * FROM workflow_events WHERE match_id = ? AND seq = ?').get(event.matchId, seq) as WorkflowEventRow;
  }
  if (event.idempotencyKey) {
    const duplicate = getDb().prepare('SELECT * FROM workflow_events WHERE match_id = ? AND idempotency_key = ?')
      .get(event.matchId, event.idempotencyKey) as WorkflowEventRow | undefined;
    if (duplicate) return duplicate;
  }
  return getDb().prepare('SELECT * FROM workflow_events WHERE match_id = ? AND seq = ?').get(event.matchId, seq) as WorkflowEventRow;
}

function listEvents(matchId: string): WorkflowEvent[] {
  return (getDb().prepare('SELECT * FROM workflow_events WHERE match_id = ? ORDER BY seq ASC').all(matchId) as WorkflowEventRow[]).map(rowToEvent).filter((e): e is WorkflowEvent => e !== null);
}

function listEventsAfter(matchId: string, afterSeq: number = 0): WorkflowEvent[] {
  return (getDb().prepare('SELECT * FROM workflow_events WHERE match_id = ? AND seq > ? ORDER BY seq ASC').all(matchId, Number(afterSeq) || 0) as WorkflowEventRow[]).map(rowToEvent).filter((e): e is WorkflowEvent => e !== null);
}

function insertOutbox(matchId: string, eventRow: WorkflowEventRow | null): void {
  if (!eventRow) return;
  if (eventRow.visibility === 'system') return;
  getDb().prepare(`
    INSERT OR IGNORE INTO outbox_messages (match_id, event_seq, status, payload_json, created_at, updated_at)
    VALUES (?, ?, 'pending', ?, ?, ?)
  `).run(matchId, eventRow.seq, toJson(rowToEvent(eventRow)), nowIso(), nowIso());
}

function commitWorkflowChange(input: CommitChangeInput): CommitChangeResult {
  return getDb().transaction(() => {
    const rows: WorkflowEvent[] = [];
    for (const event of input.events || []) {
      const eventRow = appendEvent({ matchId: input.matchId, ...event });
      insertOutbox(input.matchId, eventRow);
      rows.push(rowToEvent(eventRow)!);
    }
    if (input.matchPatch) updateMatch(input.matchId, input.matchPatch);
    const match = getMatch(input.matchId)!;
    if (input.snapshot && match) upsertSnapshot(match);
    return { match, events: rows };
  })() as CommitChangeResult;
}

function listPendingOutbox(matchId: string): OutboxRow[] {
  return (getDb().prepare('SELECT * FROM outbox_messages WHERE match_id = ? AND status = ? ORDER BY id ASC').all(matchId, 'pending') as OutboxRow[])
    .map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) }));
}

function listOutboxMessages(matchId: string, limit: number = 200): OutboxRow[] {
  return (getDb().prepare('SELECT * FROM outbox_messages WHERE match_id = ? ORDER BY id DESC LIMIT ?').all(matchId, Number(limit) || 200) as OutboxRow[])
    .map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) }))
    .reverse();
}

function markOutboxSent(id: number): void {
  getDb().prepare('UPDATE outbox_messages SET status = ?, updated_at = ? WHERE id = ?').run('sent', nowIso(), id);
}

function upsertSnapshot(match: Match): void {
  getDb().prepare(`
    INSERT INTO match_snapshots (match_id, version, status, current_step_index, state_json, blockers_json, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(match.id, match.version, match.status, match.currentStepIndex, toJson(match.state), toJson(match.blockers || []), nowIso());
}

function createAiTask(task: AiTaskCreateInput): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO ai_tasks (
      id, match_id, step_id, task_key, epoch_id, player_id, action, status,
      prompt_json, context_json, raw_output, result_json, error_json, attempts,
      visible_event_seq_max, visible_event_ids_json, created_at, updated_at
    )
    VALUES (
      @id, @match_id, @step_id, @task_key, @epoch_id, @player_id, @action, @status,
      @prompt_json, @context_json, '', 'null', 'null', 0,
      @visible_event_seq_max, @visible_event_ids_json, @created_at, @updated_at
    )
  `).run({
    id: task.id,
    match_id: task.matchId,
    step_id: task.stepId,
    task_key: task.taskKey,
    epoch_id: task.epochId || null,
    player_id: task.playerId == null ? null : String(task.playerId),
    action: task.action,
    status: task.status || 'queued',
    prompt_json: toJson(task.prompt || {}),
    context_json: toJson(task.promptContextSnapshot || {}),
    visible_event_seq_max: Number(task.visibleEventSeqMax || 0),
    visible_event_ids_json: toJson(task.visibleEventIds || []),
    created_at: nowIso(),
    updated_at: nowIso(),
  });
}

function claimNextAiTask({ matchId = null, workerId = 'worker' }: { matchId?: string | null; workerId?: string } = {}): AiTask | null {
  const db = getDb();
  const row = matchId
    ? (db.prepare(`
      SELECT * FROM ai_tasks
      WHERE match_id = ? AND status IN ('queued', 'retrying')
      ORDER BY created_at ASC
      LIMIT 1
    `).get(matchId) as AiTaskRow | undefined)
    : (db.prepare(`
      SELECT * FROM ai_tasks
      WHERE status IN ('queued', 'retrying')
      ORDER BY created_at ASC
      LIMIT 1
    `).get() as AiTaskRow | undefined);
  if (!row) return null;
  const result = db.prepare(`
    UPDATE ai_tasks
    SET status = 'running', attempts = attempts + 1, worker_id = ?, claimed_at = ?, updated_at = ?
    WHERE id = ? AND status IN ('queued', 'retrying')
  `).run(workerId, nowIso(), nowIso(), row.id);
  if (!result.changes) return null;
  return getAiTask(row.id);
}

function listAiTasks(matchId: string, status: string | null = null): AiTask[] {
  const rows = status
    ? (getDb().prepare('SELECT * FROM ai_tasks WHERE match_id = ? AND status = ? ORDER BY created_at ASC').all(matchId, status) as AiTaskRow[])
    : (getDb().prepare('SELECT * FROM ai_tasks WHERE match_id = ? ORDER BY created_at ASC').all(matchId) as AiTaskRow[]);
  return rows.map(rowToTask).filter((t): t is AiTask => t !== null);
}

function getAiTask(id: string): AiTask | null {
  return rowToTask(getDb().prepare('SELECT * FROM ai_tasks WHERE id = ?').get(id) as AiTaskRow | undefined);
}

function updateAiTask(id: string, patch: Record<string, unknown>): void {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: nowIso() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  sets.push('updated_at = @updated_at');
  getDb().prepare(`UPDATE ai_tasks SET ${sets.join(', ')} WHERE id = @id`).run(params);
}

function retryAiTask(id: string): AiTask | null {
  updateAiTask(id, {
    status: 'retrying',
    error_json: 'null',
    worker_id: '',
    claimed_at: null,
  });
  return getAiTask(id);
}

function cancelAiTask(id: string, reason: string = 'cancelled'): AiTask | null {
  updateAiTask(id, {
    status: 'cancelled',
    error_json: toJson({ message: reason }),
  });
  return getAiTask(id);
}

function createPendingAction(action: PendingActionCreateInput): void {
  getDb().prepare(`
    INSERT OR IGNORE INTO pending_actions (
      id, match_id, step_id, epoch_id, player_id, actor_type, action_type, status,
      payload_json, result_event_seq, idempotency_key, created_at, updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)
  `).run(
    action.id, action.matchId, action.stepId, action.epochId || null,
    action.playerId == null ? null : String(action.playerId),
    action.actorType, action.actionType, action.status || 'pending',
    toJson(action.payload || {}), action.idempotencyKey || action.id, nowIso(), nowIso(),
  );
}

function listPendingActions(matchId: string): PendingAction[] {
  return (getDb().prepare('SELECT * FROM pending_actions WHERE match_id = ? ORDER BY created_at ASC').all(matchId) as PendingActionRow[])
    .map(rowToPendingAction).filter((a): a is PendingAction => a !== null);
}

function getPendingAction(actionId: string): PendingAction | null {
  return rowToPendingAction(getDb().prepare('SELECT * FROM pending_actions WHERE id = ?').get(actionId) as PendingActionRow | undefined);
}

function updatePendingAction(actionId: string, patch: Record<string, unknown>): PendingAction | null {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id: actionId, updated_at: nowIso() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  sets.push('updated_at = @updated_at');
  getDb().prepare(`UPDATE pending_actions SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getPendingAction(actionId);
}

function submitPendingAction(actionId: string, { payload, resultEventSeq, idempotencyKey }: { payload?: unknown; resultEventSeq?: number | null; idempotencyKey?: string }): PendingAction | null {
  return updatePendingAction(actionId, {
    status: 'submitted',
    payload_json: toJson(payload || {}),
    result_event_seq: resultEventSeq || null,
    idempotency_key: idempotencyKey,
  });
}

function expirePendingActions(matchId: string, stepId: string | null = null): number {
  const sql = stepId
    ? "UPDATE pending_actions SET status = 'expired', updated_at = ? WHERE match_id = ? AND step_id = ? AND status = 'pending'"
    : "UPDATE pending_actions SET status = 'expired', updated_at = ? WHERE match_id = ? AND status = 'pending'";
  const params = stepId ? [nowIso(), matchId, stepId] : [nowIso(), matchId];
  return (getDb().prepare(sql).run(...params) as { changes: number }).changes;
}

function listSnapshots(matchId: string, limit: number = 20): MatchSnapshot[] {
  return (getDb().prepare('SELECT * FROM match_snapshots WHERE match_id = ? ORDER BY version DESC, id DESC LIMIT ?')
    .all(matchId, Number(limit) || 20) as MatchSnapshotRow[])
    .map(rowToSnapshot).filter((s): s is MatchSnapshot => s !== null);
}

function getLatestSnapshot(matchId: string): MatchSnapshot | null {
  return rowToSnapshot(getDb().prepare('SELECT * FROM match_snapshots WHERE match_id = ? ORDER BY version DESC, id DESC LIMIT 1')
    .get(matchId) as MatchSnapshotRow | undefined);
}

function upsertActionWindowEpoch(epoch: ActionWindowEpochInput): ActionWindowEpoch | null {
  getDb().prepare(`
    INSERT INTO action_window_epochs (
      id, match_id, step_id, action_type, status, window_json,
      created_event_seq, resolved_event_seq, expires_at, created_at, updated_at
    )
    VALUES (
      @id, @match_id, @step_id, @action_type, @status, @window_json,
      @created_event_seq, @resolved_event_seq, @expires_at, @created_at, @updated_at
    )
    ON CONFLICT(match_id, step_id, action_type) DO UPDATE SET
      status = excluded.status,
      window_json = excluded.window_json,
      created_event_seq = COALESCE(excluded.created_event_seq, action_window_epochs.created_event_seq),
      resolved_event_seq = COALESCE(excluded.resolved_event_seq, action_window_epochs.resolved_event_seq),
      expires_at = excluded.expires_at,
      updated_at = excluded.updated_at
  `).run({
    id: epoch.id,
    match_id: epoch.matchId,
    step_id: epoch.stepId,
    action_type: epoch.actionType,
    status: epoch.status || 'open',
    window_json: toJson(epoch.window || {}),
    created_event_seq: epoch.createdEventSeq || null,
    resolved_event_seq: epoch.resolvedEventSeq || null,
    expires_at: epoch.expiresAt || null,
    created_at: epoch.createdAt || nowIso(),
    updated_at: nowIso(),
  });
  return getActionWindowEpoch(epoch.matchId, epoch.stepId, epoch.actionType);
}

function getActionWindowEpoch(matchId: string, stepId: string, actionType: string): ActionWindowEpoch | null {
  return rowToActionWindowEpoch(
    (getDb().prepare(
      'SELECT * FROM action_window_epochs WHERE match_id = ? AND step_id = ? AND action_type = ?',
    ).get(matchId, stepId, actionType) as ActionWindowEpochRow | undefined),
  );
}

function listActionWindowEpochs(matchId: string): ActionWindowEpoch[] {
  return (getDb().prepare('SELECT * FROM action_window_epochs WHERE match_id = ? ORDER BY created_at ASC')
    .all(matchId) as ActionWindowEpochRow[])
    .map(rowToActionWindowEpoch).filter((e): e is ActionWindowEpoch => e !== null);
}

function createWorkflowEffect(effect: WorkflowEffectInput): WorkflowEffect | null {
  getDb().prepare(`
    INSERT OR REPLACE INTO workflow_effects (
      id, match_id, step_id, source_event_seq, effect_type, status, priority,
      payload_json, applied_event_seq, created_at, updated_at
    )
    VALUES (
      @id, @match_id, @step_id, @source_event_seq, @effect_type, @status, @priority,
      @payload_json, @applied_event_seq, COALESCE((SELECT created_at FROM workflow_effects WHERE id = @id), @created_at), @updated_at
    )
  `).run({
    id: effect.id,
    match_id: effect.matchId,
    step_id: effect.stepId || null,
    source_event_seq: effect.sourceEventSeq || null,
    effect_type: effect.effectType,
    status: effect.status || 'proposed',
    priority: Number(effect.priority || 0),
    payload_json: toJson(effect.payload || {}),
    applied_event_seq: effect.appliedEventSeq || null,
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return getWorkflowEffect(effect.id);
}

function getWorkflowEffect(id: string): WorkflowEffect | null {
  return rowToWorkflowEffect(getDb().prepare('SELECT * FROM workflow_effects WHERE id = ?').get(id) as WorkflowEffectRow | undefined);
}

function listWorkflowEffects(matchId: string): WorkflowEffect[] {
  return (getDb().prepare('SELECT * FROM workflow_effects WHERE match_id = ? ORDER BY priority DESC, created_at ASC').all(matchId) as WorkflowEffectRow[])
    .map(rowToWorkflowEffect).filter((e): e is WorkflowEffect => e !== null);
}

function updateWorkflowEffect(id: string, patch: Record<string, unknown>): WorkflowEffect | null {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: nowIso() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  sets.push('updated_at = @updated_at');
  getDb().prepare(`UPDATE workflow_effects SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getWorkflowEffect(id);
}

function createWorkflowInterrupt(interrupt: WorkflowInterruptInput): WorkflowInterrupt | null {
  getDb().prepare(`
    INSERT OR REPLACE INTO workflow_interrupts (
      id, match_id, step_id, effect_id, interrupt_type, status, priority,
      payload_json, resolution_json, created_at, updated_at
    )
    VALUES (
      @id, @match_id, @step_id, @effect_id, @interrupt_type, @status, @priority,
      @payload_json, @resolution_json, COALESCE((SELECT created_at FROM workflow_interrupts WHERE id = @id), @created_at), @updated_at
    )
  `).run({
    id: interrupt.id,
    match_id: interrupt.matchId,
    step_id: interrupt.stepId || null,
    effect_id: interrupt.effectId || null,
    interrupt_type: interrupt.interruptType,
    status: interrupt.status || 'pending',
    priority: Number(interrupt.priority || 0),
    payload_json: toJson(interrupt.payload || {}),
    resolution_json: toJson(interrupt.resolution ?? null),
    created_at: nowIso(),
    updated_at: nowIso(),
  });
  return getWorkflowInterrupt(interrupt.id);
}

function getWorkflowInterrupt(id: string): WorkflowInterrupt | null {
  return rowToWorkflowInterrupt(getDb().prepare('SELECT * FROM workflow_interrupts WHERE id = ?').get(id) as WorkflowInterruptRow | undefined);
}

function listWorkflowInterrupts(matchId: string): WorkflowInterrupt[] {
  return (getDb().prepare('SELECT * FROM workflow_interrupts WHERE match_id = ? ORDER BY priority DESC, created_at ASC').all(matchId) as WorkflowInterruptRow[])
    .map(rowToWorkflowInterrupt).filter((i): i is WorkflowInterrupt => i !== null);
}

function updateWorkflowInterrupt(id: string, patch: Record<string, unknown>): WorkflowInterrupt | null {
  const sets: string[] = [];
  const params: Record<string, unknown> = { id, updated_at: nowIso() };
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined) continue;
    sets.push(`${key} = @${key}`);
    params[key] = value;
  }
  sets.push('updated_at = @updated_at');
  getDb().prepare(`UPDATE workflow_interrupts SET ${sets.join(', ')} WHERE id = @id`).run(params);
  return getWorkflowInterrupt(id);
}

interface DebugState {
  match: Match;
  events: WorkflowEvent[];
  aiTasks: AiTask[];
  pendingActions: PendingAction[];
  actionWindows: ActionWindowEpoch[];
  effects: WorkflowEffect[];
  interrupts: WorkflowInterrupt[];
  outbox: OutboxRow[];
  snapshots: MatchSnapshot[];
}

function getDebugState(matchId: string): DebugState | null {
  const match = getMatch(matchId);
  if (!match) return null;
  return {
    match,
    events: listEvents(matchId),
    aiTasks: listAiTasks(matchId),
    pendingActions: listPendingActions(matchId),
    actionWindows: listActionWindowEpochs(matchId),
    effects: listWorkflowEffects(matchId),
    interrupts: listWorkflowInterrupts(matchId),
    outbox: listOutboxMessages(matchId),
    snapshots: listSnapshots(matchId),
  };
}

export {
  createMatch,
  getMatchRow,
  getMatch,
  updateMatch,
  appendEvent,
  commitWorkflowChange,
  listEvents,
  listEventsAfter,
  insertOutbox,
  listPendingOutbox,
  listOutboxMessages,
  markOutboxSent,
  upsertSnapshot,
  createAiTask,
  claimNextAiTask,
  listAiTasks,
  getAiTask,
  updateAiTask,
  retryAiTask,
  cancelAiTask,
  createPendingAction,
  listPendingActions,
  getPendingAction,
  submitPendingAction,
  expirePendingActions,
  listSnapshots,
  getLatestSnapshot,
  upsertActionWindowEpoch,
  getActionWindowEpoch,
  listActionWindowEpochs,
  createWorkflowEffect,
  getWorkflowEffect,
  listWorkflowEffects,
  updateWorkflowEffect,
  createWorkflowInterrupt,
  getWorkflowInterrupt,
  listWorkflowInterrupts,
  updateWorkflowInterrupt,
  getDebugState,
};
export type { EventInput, CommitChangeInput, CommitChangeResult };
