import { getDbExecutor } from '../../db';
import type { DbExecutor } from '../../db/types';
import type {
  MatchRow, WorkflowEventRow, PendingActionRow, AiTaskRow, ActionWindowEpochRow,
  WorkflowEffectRow, WorkflowInterruptRow, OutboxMessageRow,
} from '../../types/database';
import type {
  Match, WorkflowEvent, AiTask, PendingAction, MatchSnapshot, ActionWindowEpoch,
  WorkflowEffect, WorkflowInterrupt,
} from '../../types/workflow';
import { nowIso, toJson, parseJson, publicMatch, rowToEvent, rowToTask, rowToPendingAction,
  rowToActionWindowEpoch, rowToWorkflowEffect, rowToWorkflowInterrupt } from './utils';
import type { PersistenceTiming } from './persistenceTiming';
import * as snapshotRepo from './snapshotRepository';

interface MatchCreateRow {
  id: string; game_type: string; workflow_id: string; status: string; current_step_index: number;
  version: number; config_json: string; state_json: string; blockers_json: string; error_json: string;
  created_at: string; updated_at: string; completed_at: string | null;
}
interface EventInput {
  matchId?: string; seq?: number; type: string; stepId?: string | null; playerId?: string | number | null;
  payload?: unknown; visibility?: string; channel?: string; scopeKey?: string | null;
  visibleToPlayerIds?: unknown[]; idempotencyKey?: string | null; createdAt?: string;
}
interface CommitChangeInput {
  matchId: string; events?: EventInput[]; matchPatch?: Record<string, unknown> | null; snapshot?: boolean;
  timing?: { correlationId: string; operation?: string; debugMode?: boolean };
}
interface CommitChangeResult { match: Match; events: WorkflowEvent[] }
interface AiTaskCreateInput {
  id: string; matchId: string; stepId: string; taskKey: string; epochId?: string | null;
  playerId?: string | number | null; action: string; status?: string; prompt?: unknown;
  promptContextSnapshot?: unknown; visibleEventSeqMax?: number; visibleEventIds?: unknown[];
}
interface PendingActionCreateInput {
  id: string; matchId: string; stepId: string; epochId?: string | null; playerId?: string | number | null;
  actorType: string; actionType: string; status?: string; payload?: unknown; idempotencyKey?: string;
}
interface ActionWindowEpochInput {
  id: string; matchId: string; stepId: string; actionType: string; status?: string;
  window?: Record<string, unknown>; createdEventSeq?: number | null; resolvedEventSeq?: number | null;
  expiresAt?: string | null; createdAt?: string;
}
interface WorkflowEffectInput {
  id: string; matchId: string; stepId?: string | null; sourceEventSeq?: number | null;
  effectType: string; status?: string; priority?: number; payload?: unknown; appliedEventSeq?: number | null;
}
interface WorkflowInterruptInput {
  id: string; matchId: string; stepId?: string | null; effectId?: string | null; interruptType: string;
  status?: string; priority?: number; payload?: unknown; resolution?: unknown;
}
interface OutboxRow extends OutboxMessageRow { payload?: unknown }

const MATCH_COLUMNS = new Set(['status', 'current_step_index', 'version', 'config_json', 'state_json', 'blockers_json', 'error_json', 'completed_at']);
const TASK_COLUMNS = new Set(['status', 'raw_output', 'result_json', 'error_json', 'attempts', 'worker_id', 'claimed_at']);
const ACTION_COLUMNS = new Set(['status', 'payload_json', 'result_event_seq', 'idempotency_key']);
const EFFECT_COLUMNS = new Set(['step_id', 'source_event_seq', 'effect_type', 'status', 'priority', 'payload_json', 'applied_event_seq']);
const INTERRUPT_COLUMNS = new Set(['step_id', 'effect_id', 'interrupt_type', 'status', 'priority', 'payload_json', 'resolution_json']);

async function updateRow(db: DbExecutor, table: string, idColumn: string, id: string | number,
  patch: Record<string, unknown>, allowed: Set<string>): Promise<void> {
  const params: unknown[] = [];
  const sets: string[] = [];
  for (const [key, value] of Object.entries(patch)) {
    if (value === undefined || !allowed.has(key)) continue;
    params.push(value);
    sets.push(`${key} = $${params.length}`);
  }
  params.push(nowIso());
  sets.push(`updated_at = $${params.length}`);
  params.push(id);
  await db.execute(`UPDATE ${table} SET ${sets.join(', ')} WHERE ${idColumn} = $${params.length}`, params);
}

async function createMatch(row: MatchCreateRow, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute(`INSERT INTO matches
    (id, game_type, workflow_id, status, current_step_index, version, config_json, state_json,
     blockers_json, error_json, created_at, updated_at, completed_at)
    VALUES (${Array.from({ length: 13 }, (_, i) => `$${i + 1}`).join(', ')})`,
  [row.id, row.game_type, row.workflow_id, row.status, row.current_step_index, row.version,
    row.config_json, row.state_json, row.blockers_json, row.error_json, row.created_at, row.updated_at, row.completed_at]);
}
async function getMatchRow(matchId: string, db: DbExecutor = getDbExecutor(), lock = false): Promise<MatchRow | null> {
  return db.queryOne<MatchRow>(`SELECT * FROM matches WHERE id = $1${lock ? ' FOR UPDATE' : ''}`, [matchId]);
}
async function getMatch(matchId: string, db: DbExecutor = getDbExecutor(), lock = false): Promise<Match | null> {
  return publicMatch(await getMatchRow(matchId, db, lock));
}
async function updateMatch(matchId: string, patch: Record<string, unknown>, _timing?: PersistenceTiming,
  db: DbExecutor = getDbExecutor()): Promise<void> {
  await updateRow(db, 'matches', 'id', matchId, patch, MATCH_COLUMNS);
}
async function nextEventSeq(matchId: string, db: DbExecutor): Promise<number> {
  return (await db.queryOne<{ seq: number }>('SELECT COALESCE(MAX(seq), 0) + 1 AS seq FROM workflow_events WHERE match_id = $1', [matchId]))?.seq || 1;
}
async function appendEvent(event: EventInput, _timing?: PersistenceTiming, db: DbExecutor = getDbExecutor()): Promise<WorkflowEventRow> {
  if (event.idempotencyKey) {
    const existing = await db.queryOne<WorkflowEventRow>('SELECT * FROM workflow_events WHERE match_id = $1 AND idempotency_key = $2', [event.matchId, event.idempotencyKey]);
    if (existing) return existing;
  }
  const seq = event.seq || await nextEventSeq(event.matchId!, db);
  const channel = event.channel || (event.visibility === 'system' ? 'system' : event.visibility === 'public' ? 'public' : 'scope');
  const inserted = await db.queryOne<WorkflowEventRow>(`INSERT INTO workflow_events
    (match_id, seq, type, step_id, player_id, payload_json, visibility, channel, scope_key,
     visible_to_player_ids_json, idempotency_key, created_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
    ON CONFLICT DO NOTHING RETURNING *`, [event.matchId, seq, event.type, event.stepId || null,
    event.playerId == null ? null : String(event.playerId), toJson(event.payload || {}), event.visibility || 'public',
    channel, event.scopeKey || null, toJson(event.visibleToPlayerIds || []), event.idempotencyKey || null,
    event.createdAt || nowIso()]);
  if (inserted) return inserted;
  const duplicate = event.idempotencyKey
    ? await db.queryOne<WorkflowEventRow>('SELECT * FROM workflow_events WHERE match_id = $1 AND idempotency_key = $2', [event.matchId, event.idempotencyKey])
    : await db.queryOne<WorkflowEventRow>('SELECT * FROM workflow_events WHERE match_id = $1 AND seq = $2', [event.matchId, seq]);
  if (!duplicate) throw new Error(`Workflow event conflict could not be resolved: ${event.matchId}:${seq}`);
  return duplicate;
}
async function listEvents(matchId: string, db: DbExecutor = getDbExecutor()): Promise<WorkflowEvent[]> {
  return (await db.queryMany<WorkflowEventRow>('SELECT * FROM workflow_events WHERE match_id = $1 ORDER BY seq ASC', [matchId])).map(rowToEvent).filter((e): e is WorkflowEvent => e !== null);
}
async function listEventsAfter(matchId: string, afterSeq = 0, db: DbExecutor = getDbExecutor()): Promise<WorkflowEvent[]> {
  return (await db.queryMany<WorkflowEventRow>('SELECT * FROM workflow_events WHERE match_id = $1 AND seq > $2 ORDER BY seq ASC', [matchId, afterSeq])).map(rowToEvent).filter((e): e is WorkflowEvent => e !== null);
}
async function insertOutbox(matchId: string, eventRow: WorkflowEventRow | null, _timing?: PersistenceTiming,
  db: DbExecutor = getDbExecutor()): Promise<void> {
  if (!eventRow || eventRow.visibility === 'system') return;
  await db.execute(`INSERT INTO outbox_messages (match_id, event_seq, status, payload_json, created_at, updated_at)
    VALUES ($1, $2, 'pending', $3, $4, $4) ON CONFLICT(match_id, event_seq) DO NOTHING`,
  [matchId, eventRow.seq, toJson(rowToEvent(eventRow)), nowIso()]);
}
async function commitWorkflowChange(input: CommitChangeInput, executor: DbExecutor = getDbExecutor()): Promise<CommitChangeResult> {
  return executor.withTransaction(async (transaction) => {
    const locked = await getMatch(input.matchId, transaction, true);
    if (!locked) throw new Error(`Match not found: ${input.matchId}`);
    const events: WorkflowEvent[] = [];
    for (const event of input.events || []) {
      const row = await appendEvent({ matchId: input.matchId, ...event }, undefined, transaction);
      await insertOutbox(input.matchId, row, undefined, transaction);
      const parsed = rowToEvent(row);
      if (parsed) events.push(parsed);
    }
    if (input.matchPatch) await updateMatch(input.matchId, input.matchPatch, undefined, transaction);
    const match = (await getMatch(input.matchId, transaction))!;
    if (input.snapshot) await snapshotRepo.upsertSnapshot(match, undefined, transaction);
    return { match, events };
  });
}

function mapOutbox(rows: OutboxMessageRow[]): OutboxRow[] {
  return rows.map((row) => ({ ...row, payload: parseJson(row.payload_json, {}) }));
}
async function listPendingOutbox(matchId: string): Promise<OutboxRow[]> {
  return mapOutbox(await getDbExecutor().queryMany<OutboxMessageRow>(`SELECT * FROM outbox_messages
    WHERE match_id = $1 AND status = 'pending' ORDER BY id ASC`, [matchId]));
}
async function claimPendingOutbox(matchId: string): Promise<OutboxRow | null> {
  return getDbExecutor().withTransaction(async (transaction) => {
    const row = await transaction.queryOne<OutboxMessageRow>(`WITH candidate AS (
      SELECT id FROM outbox_messages WHERE match_id = $1 AND status = 'pending'
      ORDER BY id ASC FOR UPDATE SKIP LOCKED LIMIT 1)
      UPDATE outbox_messages o SET status = 'sending', updated_at = $2
      FROM candidate c WHERE o.id = c.id RETURNING o.*`, [matchId, nowIso()]);
    return row ? mapOutbox([row])[0] : null;
  });
}
async function listOutboxMessages(matchId: string, limit = 200): Promise<OutboxRow[]> {
  const rows = await getDbExecutor().queryMany<OutboxMessageRow>('SELECT * FROM outbox_messages WHERE match_id = $1 ORDER BY id DESC LIMIT $2', [matchId, limit || 200]);
  return mapOutbox(rows).reverse();
}
async function markOutboxSent(id: number): Promise<void> {
  await getDbExecutor().execute(`UPDATE outbox_messages SET status = 'sent', updated_at = $1 WHERE id = $2`, [nowIso(), id]);
}
async function releaseOutboxClaim(id: number): Promise<void> {
  await getDbExecutor().execute(`UPDATE outbox_messages SET status = 'pending', updated_at = $1 WHERE id = $2 AND status = 'sending'`, [nowIso(), id]);
}

const { upsertSnapshot, listSnapshots, getLatestSnapshot, getMaxEventSeq, countEventsAfter,
  shouldCreateSnapshot, pruneSnapshots } = snapshotRepo;

async function createAiTask(task: AiTaskCreateInput, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute(`INSERT INTO ai_tasks
    (id, match_id, step_id, task_key, epoch_id, player_id, action, status, prompt_json, context_json,
     raw_output, result_json, error_json, attempts, visible_event_seq_max, visible_event_ids_json, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'','null','null',0,$11,$12,$13,$13)
    ON CONFLICT(match_id, step_id, task_key) DO NOTHING`, [task.id, task.matchId, task.stepId, task.taskKey,
    task.epochId || null, task.playerId == null ? null : String(task.playerId), task.action, task.status || 'queued',
    toJson(task.prompt || {}), toJson(task.promptContextSnapshot || {}), task.visibleEventSeqMax || 0,
    toJson(task.visibleEventIds || []), nowIso()]);
}
async function claimNextAiTask({ matchId = null, workerId = 'worker' }: { matchId?: string | null; workerId?: string } = {}): Promise<AiTask | null> {
  const row = await getDbExecutor().withTransaction((transaction) => transaction.queryOne<AiTaskRow>(`WITH candidate AS (
    SELECT id FROM ai_tasks WHERE ($1::text IS NULL OR match_id = $1) AND status IN ('queued','retrying')
    ORDER BY created_at ASC FOR UPDATE SKIP LOCKED LIMIT 1)
    UPDATE ai_tasks t SET status = 'running', attempts = t.attempts + 1, worker_id = $2,
      claimed_at = $3, updated_at = $3 FROM candidate c WHERE t.id = c.id RETURNING t.*`, [matchId, workerId, nowIso()]));
  return rowToTask(row || undefined);
}
async function listAiTasks(matchId: string, status: string | null = null, db: DbExecutor = getDbExecutor()): Promise<AiTask[]> {
  const rows = await db.queryMany<AiTaskRow>(`SELECT * FROM ai_tasks WHERE match_id = $1
    AND ($2::text IS NULL OR status = $2) ORDER BY created_at ASC`, [matchId, status]);
  return rows.map(rowToTask).filter((task): task is AiTask => task !== null);
}
async function getAiTask(id: string): Promise<AiTask | null> {
  return rowToTask((await getDbExecutor().queryOne<AiTaskRow>('SELECT * FROM ai_tasks WHERE id = $1', [id])) || undefined);
}
async function updateAiTask(id: string, patch: Record<string, unknown>): Promise<void> {
  await updateRow(getDbExecutor(), 'ai_tasks', 'id', id, patch, TASK_COLUMNS);
}
async function retryAiTask(id: string): Promise<AiTask | null> {
  await updateAiTask(id, { status: 'retrying', error_json: 'null', worker_id: '', claimed_at: null });
  return getAiTask(id);
}
async function cancelAiTask(id: string, reason = 'cancelled'): Promise<AiTask | null> {
  await updateAiTask(id, { status: 'cancelled', error_json: toJson({ message: reason }) });
  return getAiTask(id);
}

async function createPendingAction(action: PendingActionCreateInput, db: DbExecutor = getDbExecutor()): Promise<void> {
  await db.execute(`INSERT INTO pending_actions
    (id, match_id, step_id, epoch_id, player_id, actor_type, action_type, status, payload_json,
     result_event_seq, idempotency_key, created_at, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL,$10,$11,$11)
    ON CONFLICT(match_id, idempotency_key) DO NOTHING`, [action.id, action.matchId, action.stepId,
    action.epochId || null, action.playerId == null ? null : String(action.playerId), action.actorType,
    action.actionType, action.status || 'pending', toJson(action.payload || {}), action.idempotencyKey || action.id, nowIso()]);
}
async function listPendingActions(matchId: string, db: DbExecutor = getDbExecutor()): Promise<PendingAction[]> {
  return (await db.queryMany<PendingActionRow>('SELECT * FROM pending_actions WHERE match_id = $1 ORDER BY created_at ASC', [matchId])).map(rowToPendingAction).filter((action): action is PendingAction => action !== null);
}
async function getPendingAction(id: string, db: DbExecutor = getDbExecutor()): Promise<PendingAction | null> {
  return rowToPendingAction((await db.queryOne<PendingActionRow>('SELECT * FROM pending_actions WHERE id = $1', [id])) || undefined);
}
async function updatePendingAction(id: string, patch: Record<string, unknown>, db: DbExecutor = getDbExecutor()): Promise<PendingAction | null> {
  await updateRow(db, 'pending_actions', 'id', id, patch, ACTION_COLUMNS);
  return getPendingAction(id, db);
}
async function submitPendingAction(id: string, input: { payload?: unknown; resultEventSeq?: number | null; idempotencyKey?: string }, db: DbExecutor = getDbExecutor()): Promise<PendingAction | null> {
  return updatePendingAction(id, { status: 'submitted', payload_json: toJson(input.payload || {}),
    result_event_seq: input.resultEventSeq || null, idempotency_key: input.idempotencyKey }, db);
}
async function expirePendingActions(matchId: string, stepId: string | null = null): Promise<number> {
  const result = await getDbExecutor().execute(`UPDATE pending_actions SET status = 'expired', updated_at = $1
    WHERE match_id = $2 AND ($3::text IS NULL OR step_id = $3) AND status = 'pending'`, [nowIso(), matchId, stepId]);
  return result.rowCount;
}

async function upsertActionWindowEpoch(epoch: ActionWindowEpochInput): Promise<ActionWindowEpoch | null> {
  await getDbExecutor().execute(`INSERT INTO action_window_epochs
    (id, match_id, step_id, action_type, status, window_json, created_event_seq, resolved_event_seq,
     expires_at, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
    ON CONFLICT(match_id, step_id, action_type) DO UPDATE SET status=excluded.status,
      window_json=excluded.window_json, created_event_seq=COALESCE(excluded.created_event_seq, action_window_epochs.created_event_seq),
      resolved_event_seq=COALESCE(excluded.resolved_event_seq, action_window_epochs.resolved_event_seq),
      expires_at=excluded.expires_at, updated_at=excluded.updated_at`, [epoch.id, epoch.matchId, epoch.stepId,
    epoch.actionType, epoch.status || 'open', toJson(epoch.window || {}), epoch.createdEventSeq || null,
    epoch.resolvedEventSeq || null, epoch.expiresAt || null, epoch.createdAt || nowIso(), nowIso()]);
  return getActionWindowEpoch(epoch.matchId, epoch.stepId, epoch.actionType);
}
async function getActionWindowEpoch(matchId: string, stepId: string, actionType: string): Promise<ActionWindowEpoch | null> {
  return rowToActionWindowEpoch((await getDbExecutor().queryOne<ActionWindowEpochRow>(`SELECT * FROM action_window_epochs
    WHERE match_id=$1 AND step_id=$2 AND action_type=$3`, [matchId, stepId, actionType])) || undefined);
}
async function listActionWindowEpochs(matchId: string): Promise<ActionWindowEpoch[]> {
  return (await getDbExecutor().queryMany<ActionWindowEpochRow>('SELECT * FROM action_window_epochs WHERE match_id=$1 ORDER BY created_at ASC', [matchId])).map(rowToActionWindowEpoch).filter((epoch): epoch is ActionWindowEpoch => epoch !== null);
}

async function createWorkflowEffect(effect: WorkflowEffectInput): Promise<WorkflowEffect | null> {
  await getDbExecutor().execute(`INSERT INTO workflow_effects
    (id,match_id,step_id,source_event_seq,effect_type,status,priority,payload_json,applied_event_seq,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
    ON CONFLICT(id) DO UPDATE SET step_id=excluded.step_id,source_event_seq=excluded.source_event_seq,
      effect_type=excluded.effect_type,status=excluded.status,priority=excluded.priority,payload_json=excluded.payload_json,
      applied_event_seq=excluded.applied_event_seq,updated_at=excluded.updated_at`, [effect.id,effect.matchId,effect.stepId||null,
    effect.sourceEventSeq||null,effect.effectType,effect.status||'proposed',effect.priority||0,toJson(effect.payload||{}),effect.appliedEventSeq||null,nowIso()]);
  return getWorkflowEffect(effect.id);
}
async function getWorkflowEffect(id: string): Promise<WorkflowEffect | null> {
  return rowToWorkflowEffect((await getDbExecutor().queryOne<WorkflowEffectRow>('SELECT * FROM workflow_effects WHERE id=$1',[id])) || undefined);
}
async function listWorkflowEffects(matchId: string): Promise<WorkflowEffect[]> {
  return (await getDbExecutor().queryMany<WorkflowEffectRow>('SELECT * FROM workflow_effects WHERE match_id=$1 ORDER BY priority DESC,created_at ASC',[matchId])).map(rowToWorkflowEffect).filter((effect): effect is WorkflowEffect => effect !== null);
}
async function updateWorkflowEffect(id: string, patch: Record<string, unknown>): Promise<WorkflowEffect | null> {
  await updateRow(getDbExecutor(),'workflow_effects','id',id,patch,EFFECT_COLUMNS); return getWorkflowEffect(id);
}
async function createWorkflowInterrupt(item: WorkflowInterruptInput): Promise<WorkflowInterrupt | null> {
  await getDbExecutor().execute(`INSERT INTO workflow_interrupts
    (id,match_id,step_id,effect_id,interrupt_type,status,priority,payload_json,resolution_json,created_at,updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
    ON CONFLICT(id) DO UPDATE SET step_id=excluded.step_id,effect_id=excluded.effect_id,
      interrupt_type=excluded.interrupt_type,status=excluded.status,priority=excluded.priority,
      payload_json=excluded.payload_json,resolution_json=excluded.resolution_json,updated_at=excluded.updated_at`,
  [item.id,item.matchId,item.stepId||null,item.effectId||null,item.interruptType,item.status||'pending',item.priority||0,
    toJson(item.payload||{}),toJson(item.resolution??null),nowIso()]);
  return getWorkflowInterrupt(item.id);
}
async function getWorkflowInterrupt(id: string, db: DbExecutor = getDbExecutor()): Promise<WorkflowInterrupt | null> {
  return rowToWorkflowInterrupt((await db.queryOne<WorkflowInterruptRow>('SELECT * FROM workflow_interrupts WHERE id=$1',[id])) || undefined);
}
async function listWorkflowInterrupts(matchId: string): Promise<WorkflowInterrupt[]> {
  return (await getDbExecutor().queryMany<WorkflowInterruptRow>('SELECT * FROM workflow_interrupts WHERE match_id=$1 ORDER BY priority DESC,created_at ASC',[matchId])).map(rowToWorkflowInterrupt).filter((item): item is WorkflowInterrupt => item !== null);
}
async function updateWorkflowInterrupt(id: string, patch: Record<string, unknown>, db: DbExecutor = getDbExecutor()): Promise<WorkflowInterrupt | null> {
  await updateRow(db,'workflow_interrupts','id',id,patch,INTERRUPT_COLUMNS); return getWorkflowInterrupt(id, db);
}

interface DebugState {
  match: Match; events: WorkflowEvent[]; aiTasks: AiTask[]; pendingActions: PendingAction[];
  actionWindows: ActionWindowEpoch[]; effects: WorkflowEffect[]; interrupts: WorkflowInterrupt[];
  outbox: OutboxRow[]; snapshots: MatchSnapshot[];
}
async function getDebugState(matchId: string): Promise<DebugState | null> {
  const match = await getMatch(matchId); if (!match) return null;
  const [events,aiTasks,pendingActions,actionWindows,effects,interrupts,outbox,snapshots] = await Promise.all([
    listEvents(matchId),listAiTasks(matchId),listPendingActions(matchId),listActionWindowEpochs(matchId),
    listWorkflowEffects(matchId),listWorkflowInterrupts(matchId),listOutboxMessages(matchId),listSnapshots(matchId),
  ]);
  return { match,events,aiTasks,pendingActions,actionWindows,effects,interrupts,outbox,snapshots };
}

export { createMatch,getMatchRow,getMatch,updateMatch,appendEvent,commitWorkflowChange,listEvents,listEventsAfter,
  insertOutbox,listPendingOutbox,claimPendingOutbox,listOutboxMessages,markOutboxSent,releaseOutboxClaim,upsertSnapshot,createAiTask,
  claimNextAiTask,listAiTasks,getAiTask,updateAiTask,retryAiTask,cancelAiTask,createPendingAction,
  listPendingActions,getPendingAction,submitPendingAction,expirePendingActions,listSnapshots,getLatestSnapshot,
  getMaxEventSeq,countEventsAfter,shouldCreateSnapshot,pruneSnapshots,upsertActionWindowEpoch,getActionWindowEpoch,
  listActionWindowEpochs,createWorkflowEffect,getWorkflowEffect,listWorkflowEffects,updateWorkflowEffect,
  createWorkflowInterrupt,getWorkflowInterrupt,listWorkflowInterrupts,updateWorkflowInterrupt,getDebugState };
export type { EventInput,CommitChangeInput,CommitChangeResult,OutboxRow };
