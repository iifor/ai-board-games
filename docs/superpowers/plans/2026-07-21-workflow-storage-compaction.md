# Workflow Storage Compaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove existing workflow storage duplication and enforce bounded snapshot/outbox retention without changing real-time play, replay, or public protocols.

**Architecture:** Keep `workflow_events` as the event source of truth. Reuse the existing daily workflow maintenance for global snapshot pruning and seven-day outbox cleanup; store only an outbox reference and hydrate it from the event table on reads; stop embedding full werewolf state in workflow events.

**Tech Stack:** TypeScript, Node.js, better-sqlite3, SQLite JSON1/window functions, node:test, pnpm workspace.

## Global Constraints

- Keep the latest 3 workflow snapshots per match.
- Delete sent outbox older than 7 days and pending outbox older than 7 days only for `completed`, `failed`, or `paused_debug` matches.
- Keep a record exactly 7 days old.
- Do not delete ordinary terminal matches or formal `games` history.
- Do not change REST, WebSocket, client, admin, shared types, or database schema.
- Keep JSON fallback behavior aligned.
- Do not run `VACUUM` in the online service.
- Use `pnpm.cmd` in PowerShell.

---

### Task 1: Bound snapshots and stale outbox

**Files:**
- Modify: `packages/server/modules/workflow-engine/debugRetentionRepository.ts`
- Modify: `packages/server/modules/workflow-engine/debugRetention.ts`
- Test: `tests/workflow/workflowPersistence.test.ts`

**Interfaces:**
- Produces: `pruneAllSnapshots(keep?: number): number`
- Produces: `deleteExpiredOutbox(cutoffIso: string): number`
- Produces: `cleanupWorkflowArtifacts(nowMs?: number): ArtifactCleanupResult`

- [ ] **Step 1: Write failing SQLite tests**

Add one in-memory test that inserts five snapshots for one match and asserts `pruneAllSnapshots(3)` keeps versions 5, 4, 3. Insert old/recent sent messages and old pending messages on active/terminal matches; assert only old sent and terminal pending are deleted.

```ts
assert.equal(debugRetentionRepo.pruneAllSnapshots(3), 2);
assert.deepEqual(snapshotVersions, [5, 4, 3]);
assert.equal(debugRetentionRepo.deleteExpiredOutbox('2026-07-14T00:00:00.000Z'), 2);
assert.deepEqual(remainingEventSeqs, [2, 4, 5]);
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
pnpm.cmd test:workflow
```

Expected: FAIL because the two repository functions do not exist.

- [ ] **Step 3: Implement the minimum repository behavior**

Use one SQLite window-function delete for snapshots and one joined delete for outbox. For JSON fallback, mutate the existing arrays, persist once, and return the deleted count.

```sql
DELETE FROM match_snapshots
WHERE id IN (
  SELECT id FROM (
    SELECT id, ROW_NUMBER() OVER (
      PARTITION BY match_id ORDER BY version DESC, id DESC
    ) AS position
    FROM match_snapshots
  ) WHERE position > ?
)
```

```sql
DELETE FROM outbox_messages
WHERE updated_at < ?
  AND (
    status = 'sent'
    OR (status = 'pending' AND match_id IN (
      SELECT id FROM matches WHERE status IN ('completed', 'failed', 'paused_debug')
    ))
  )
```

- [ ] **Step 4: Add the maintenance wrapper**

Add `OUTBOX_RETENTION_MS = 7 * 24 * 60 * 60 * 1000` and `cleanupWorkflowArtifacts()`. Include it in `runWorkflowMaintenance()` so startup and the existing 24-hour timer reuse it.

- [ ] **Step 5: Run tests and verify GREEN**

```powershell
pnpm.cmd test:workflow
```

Expected: all workflow tests pass.

---

### Task 2: Store outbox references instead of duplicate events

**Files:**
- Modify: `packages/server/modules/workflow-engine/repository.ts`
- Test: `tests/workflow/workflowPersistence.test.ts`

**Interfaces:**
- Keeps: `listPendingOutbox(matchId: string): OutboxRow[]`
- Keeps: `listOutboxMessages(matchId: string, limit?: number): OutboxRow[]`
- Adds internal: `hydrateOutboxRow(row: OutboxRow): OutboxRow`

- [ ] **Step 1: Write a failing repository test**

Create a match, append one public workflow event, insert its outbox row, then assert the stored `payload_json` is `{}` while `listPendingOutbox()` still returns the complete workflow event.

```ts
assert.equal(stored.payload_json, '{}');
assert.equal((messages[0].payload as { type: string }).type, 'display_event');
assert.deepEqual((messages[0].payload as { payload: unknown }).payload, { message: 'hello' });
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
pnpm.cmd test:workflow
```

Expected: FAIL because outbox still stores the serialized event.

- [ ] **Step 3: Write the minimum implementation**

Change `insertOutbox()` to write `'{}'`. When an outbox row contains `{}`, load its matching `workflow_events` row by `match_id + event_seq` and map it with the existing `rowToEvent()`. Preserve non-empty legacy payloads unchanged.

- [ ] **Step 4: Verify GREEN**

```powershell
pnpm.cmd test:workflow
```

Expected: all workflow tests pass, including SQLite and JSON fallback outbox delivery.

---

### Task 3: Stop persisting full werewolf state per workflow event

**Files:**
- Modify: `packages/server/modules/werewolf/handlers/common.ts`
- Test: `tests/workflow/workflowPersistence.test.ts`

**Interfaces:**
- Keeps unchanged: `createWerewolfEvent(match, step, state, workflowEvent, message, extra, options)`

- [ ] **Step 1: Write the failing event-shape test**

```ts
const event = createWerewolfEvent(
  { id: 'match-1' },
  { id: 'night-1' },
  { players: [{ id: 1, alive: true }] },
  'werewolf_phase_changed',
  'night starts',
);
assert.equal('game' in event.payload, false);
assert.equal(event.payload.message, 'night starts');
```

- [ ] **Step 2: Run tests and verify RED**

```powershell
pnpm.cmd test:workflow
```

Expected: FAIL because `createWerewolfEvent()` still serializes `game`.

- [ ] **Step 3: Remove only the redundant field**

Remove `serializeWerewolfState` from this helper and leave the function signature/callers unchanged. State recovery continues through the existing first-event `statePatch`; EventBus display events continue using `publishGameEvent()`.

- [ ] **Step 4: Verify GREEN and focused werewolf behavior**

```powershell
pnpm.cmd test:workflow
```

Expected: all workflow projection, presentation, and werewolf workflow tests pass.

---

### Task 4: Document, migrate live data, and compact safely

**Files:**
- Modify: `docs/project-server.md`
- Modify: `docs/project-workflow.md`
- No tracked script: run the one-time maintenance from a temporary read-only/maintenance script.

**Interfaces:**
- No public API or type changes.

- [ ] **Step 1: Update project contracts**

Document the three-snapshot limit, seven-day outbox retention, event-reference outbox, state-patch workflow events, and offline `VACUUM` rule.

- [ ] **Step 2: Run code verification**

```powershell
pnpm.cmd test:workflow
pnpm.cmd test:migration
pnpm.cmd check:server
```

Expected: all commands pass.

- [ ] **Step 3: Create a compacted database copy**

Against `packages/data/ai-presenter.sqlite`, within a transaction:

```sql
DELETE FROM match_snapshots WHERE id IN (...position > 3...);
DELETE FROM outbox_messages WHERE updated_at < :cutoff AND (...retention predicate...);
UPDATE outbox_messages SET payload_json = '{}';
UPDATE workflow_events
SET payload_json = json_remove(payload_json, '$.game')
WHERE json_valid(payload_json) AND json_type(payload_json, '$.game') IS NOT NULL;
```

Then checkpoint and use `VACUUM INTO` to a new file. Do not overwrite the source database until verification passes.

- [ ] **Step 4: Verify and replace**

Verify `PRAGMA integrity_check = ok`, unchanged business-table row counts except the intended snapshot/outbox reductions, no match with more than three snapshots, no expired outbox, and no workflow event with top-level `game`. Replace the original file only after all assertions pass.

- [ ] **Step 5: Final repository checks**

```powershell
git diff --check
git status --short
```

Expected: only intended source, test, and documentation changes remain; the SQLite runtime file stays untracked/ignored.
