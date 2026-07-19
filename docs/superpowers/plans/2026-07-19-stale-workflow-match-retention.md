# Stale Workflow Match Retention Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Automatically hard-delete `running` and `waiting` workflow matches whose `updated_at` is more than seven days old, at service startup and every 24 hours.

**Architecture:** Extend the existing workflow retention repository and service instead of adding a second maintenance subsystem. Selection remains a database concern, deletion reuses the existing `matches` delete and foreign-key cascades, while scheduling stays in the workflow retention service and is initialized by the existing application startup hook.

**Tech Stack:** TypeScript, Node.js timers, better-sqlite3, node:test, SQLite foreign keys.

## Global Constraints

- Delete only `running` and `waiting` matches where `updated_at < now - 7 days`.
- A match exactly seven days old must be retained.
- Run once at service startup and once every 24 hours afterward.
- Do not delete `completed`, `failed`, or `paused_debug` matches through this policy.
- Use the existing `ON DELETE CASCADE` relationships; do not manually enumerate child-table deletes.
- Do not add dependencies, API endpoints, UI, settings, or database tables.
- Do not execute blocking `VACUUM` from the online service.
- Use `pnpm.cmd` in PowerShell.

---

### Task 1: Select and cascade-delete stale active matches

**Files:**
- Modify: `packages/server/modules/workflow-engine/debugRetentionRepository.ts`
- Modify: `tests/workflow/workflowPersistence.test.ts`

**Interfaces:**
- Produces: `listStaleActiveMatches(cutoffIso: string): RetentionMatch[]`
- Reuses: `deleteMatchCascade(matchId: string): boolean`
- Reuses: `getMatchLogicalBytes(matchId: string): number`

- [ ] **Step 1: Write the failing SQLite-backed repository test**

Add imports for `Database`, `migrate`, and the database module, then add a test that temporarily redirects `getDb()` to an in-memory migrated SQLite database:

```ts
import Database from 'better-sqlite3';
import { migrate } from '../../packages/server/db/migrations';
import * as dbModule from '../../packages/server/db';

test('stale active match query uses a strict seven-day cutoff and cascades deletes', () => {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const originalGetDb = dbModule.getDb;
  Object.assign(dbModule, { getDb: () => db });
  try {
    const insertMatch = db.prepare(`
      INSERT INTO matches (
        id, game_type, workflow_id, status, current_step_index, version,
        config_json, state_json, blockers_json, error_json, created_at, updated_at
      ) VALUES (?, 'werewolf', 'werewolf.workflow.basic.v1', ?, 0, 0,
        '{}', '{}', '[]', 'null', ?, ?)
    `);
    insertMatch.run('stale-running', 'running', '2026-07-01T00:00:00.000Z', '2026-07-11T23:59:59.999Z');
    insertMatch.run('exactly-seven-days', 'waiting', '2026-07-01T00:00:00.000Z', '2026-07-12T00:00:00.000Z');
    insertMatch.run('recent-waiting', 'waiting', '2026-07-01T00:00:00.000Z', '2026-07-18T00:00:00.000Z');
    insertMatch.run('old-completed', 'completed', '2026-07-01T00:00:00.000Z', '2026-07-01T00:00:00.000Z');

    db.prepare(`
      INSERT INTO workflow_events (
        match_id, seq, type, payload_json, visibility,
        visible_to_player_ids_json, created_at
      ) VALUES ('stale-running', 1, 'test', '{}', 'public', '[]', CURRENT_TIMESTAMP)
    `).run();
    db.prepare(`
      INSERT INTO match_snapshots (
        match_id, version, status, current_step_index,
        state_json, blockers_json, created_at
      ) VALUES ('stale-running', 1, 'running', 0, '{}', '[]', CURRENT_TIMESTAMP)
    `).run();
    db.prepare(`
      INSERT INTO ai_tasks (
        id, match_id, step_id, task_key, action, status,
        prompt_json, context_json, result_json, error_json,
        visible_event_ids_json, created_at, updated_at
      ) VALUES (
        'task-1', 'stale-running', 'step-1', 'task-key', 'test', 'queued',
        '{}', '{}', 'null', 'null', '[]', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
      )
    `).run();
    db.prepare(`
      INSERT INTO outbox_messages (
        match_id, event_seq, status, payload_json, created_at, updated_at
      ) VALUES ('stale-running', 1, 'pending', '{}', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `).run();

    const candidates = debugRetentionRepo.listStaleActiveMatches('2026-07-12T00:00:00.000Z');
    assert.deepEqual(candidates, [{ id: 'stale-running' }]);
    assert.equal(debugRetentionRepo.deleteMatchCascade('stale-running'), true);
    for (const table of ['workflow_events', 'match_snapshots', 'ai_tasks', 'outbox_messages']) {
      const row = db.prepare(`SELECT COUNT(*) AS count FROM ${table} WHERE match_id = ?`)
        .get('stale-running') as { count: number };
      assert.equal(row.count, 0, table);
    }
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM matches').get() as { count: number }).count,
      3,
    );
  } finally {
    Object.assign(dbModule, { getDb: originalGetDb });
    db.close();
  }
});
```

- [ ] **Step 2: Run the workflow test and verify RED**

Run:

```powershell
pnpm.cmd test:workflow
```

Expected: FAIL because `listStaleActiveMatches` does not exist.

- [ ] **Step 3: Implement the minimal repository query**

Add the shared row type and query to `debugRetentionRepository.ts`:

```ts
interface RetentionMatch {
  id: string;
}

function listStaleActiveMatches(cutoffIso: string): RetentionMatch[] {
  return getDb().prepare(`
    SELECT id FROM matches
    WHERE status IN ('running', 'waiting')
      AND updated_at < ?
    ORDER BY updated_at ASC, id ASC
  `).all(cutoffIso) as RetentionMatch[];
}
```

Use `RetentionMatch` for `listTerminalDebugMatches()` as well, and export the new function and type:

```ts
export {
  listTerminalDebugMatches,
  listStaleActiveMatches,
  deleteMatchCascade,
  getMatchLogicalBytes,
};
export type { RetentionMatch };
```

- [ ] **Step 4: Run the workflow test and verify GREEN**

Run:

```powershell
pnpm.cmd test:workflow
```

Expected: PASS, including the strict cutoff, status filtering, and cascade assertions.

- [ ] **Step 5: Commit the repository behavior**

```powershell
git add packages/server/modules/workflow-engine/debugRetentionRepository.ts tests/workflow/workflowPersistence.test.ts
git commit -m "feat: select stale active workflow matches"
```

---

### Task 2: Clean stale matches and schedule daily maintenance

**Files:**
- Modify: `packages/server/modules/workflow-engine/debugRetention.ts`
- Modify: `packages/server/modules/workflow-engine/service.ts`
- Modify: `tests/workflow/workflowPersistence.test.ts`

**Interfaces:**
- Consumes: `listStaleActiveMatches(cutoffIso: string): RetentionMatch[]`
- Produces: `cleanupStaleActiveMatches(nowMs?: number): DebugCleanupResult`
- Produces: `runWorkflowMaintenance(): void`
- Produces: `scheduleWorkflowMaintenance(run?, schedule?): NodeJS.Timeout`

- [ ] **Step 1: Write failing cleanup and scheduling tests**

Expand `RetentionRepoPatch` to include `listStaleActiveMatches`, import the new retention functions/constants, and add:

```ts
test('stale active retention deletes matches older than seven days', () => {
  const original = snapshotRetentionRepo(debugRetentionRepo);
  const deleted: string[] = [];
  let receivedCutoff = '';
  try {
    patchRetentionRepo(debugRetentionRepo, {
      listStaleActiveMatches: (cutoffIso) => {
        receivedCutoff = cutoffIso;
        return [{ id: 'stale-running' }, { id: 'stale-waiting' }];
      },
      getMatchLogicalBytes: () => 250,
      deleteMatchCascade: (matchId) => {
        deleted.push(matchId);
        return true;
      },
    });

    const result = cleanupStaleActiveMatches(Date.parse('2026-07-19T00:00:00.000Z'));
    assert.equal(receivedCutoff, '2026-07-12T00:00:00.000Z');
    assert.deepEqual(deleted, ['stale-running', 'stale-waiting']);
    assert.equal(result.deleted, 2);
    assert.equal(result.releasedLogicalBytes, 500);
  } finally {
    patchRetentionRepo(debugRetentionRepo, original);
  }
});

test('workflow maintenance runs immediately and every twenty-four hours', () => {
  let runs = 0;
  let delay = 0;
  let scheduled: (() => void) | undefined;
  let unrefCalled = false;
  const fakeTimer = {
    unref() { unrefCalled = true; return this; },
  } as unknown as NodeJS.Timeout;
  const fakeSchedule = ((callback: () => void, intervalMs: number) => {
    scheduled = callback;
    delay = intervalMs;
    return fakeTimer;
  }) as typeof setInterval;

  scheduleWorkflowMaintenance(() => { runs += 1; }, fakeSchedule);
  assert.equal(runs, 1);
  assert.equal(delay, WORKFLOW_MAINTENANCE_INTERVAL_MS);
  assert.equal(unrefCalled, true);
  scheduled?.();
  assert.equal(runs, 2);
});
```

- [ ] **Step 2: Run the workflow test and verify RED**

Run:

```powershell
pnpm.cmd test:workflow
```

Expected: FAIL because the stale cleanup and scheduler exports do not exist.

- [ ] **Step 3: Implement cleanup, safe maintenance, and scheduling**

Add to `debugRetention.ts`:

```ts
const STALE_ACTIVE_MATCH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const WORKFLOW_MAINTENANCE_INTERVAL_MS = 24 * 60 * 60 * 1000;

function cleanupStaleActiveMatches(nowMs: number = Date.now()): DebugCleanupResult {
  const startedAt = Date.now();
  const cutoffIso = new Date(nowMs - STALE_ACTIVE_MATCH_MAX_AGE_MS).toISOString();
  const candidates = repo.listStaleActiveMatches(cutoffIso);
  let deleted = 0;
  let releasedLogicalBytes = 0;
  const deletedMatchIds: string[] = [];
  for (const match of candidates) {
    const logicalBytes = repo.getMatchLogicalBytes(match.id);
    if (repo.deleteMatchCascade(match.id)) {
      deleted += 1;
      releasedLogicalBytes += logicalBytes;
      deletedMatchIds.push(match.id);
    }
  }
  const result = {
    scanned: candidates.length,
    deleted,
    deletedMatchIds,
    releasedLogicalBytes,
    durationMs: Date.now() - startedAt,
  };
  console.info(JSON.stringify({
    type: 'workflow-stale-active-retention',
    cutoffIso,
    ...result,
  }));
  return result;
}

function runWorkflowMaintenance(): void {
  for (const cleanup of [cleanupTerminalDebugMatches, cleanupStaleActiveMatches]) {
    try {
      cleanup();
    } catch (error) {
      console.error(JSON.stringify({
        type: 'workflow-retention-error',
        message: (error as Error).message,
      }));
    }
  }
}

function scheduleWorkflowMaintenance(
  run: () => void = runWorkflowMaintenance,
  schedule: typeof setInterval = setInterval,
): NodeJS.Timeout {
  run();
  const timer = schedule(run, WORKFLOW_MAINTENANCE_INTERVAL_MS);
  timer.unref();
  return timer;
}
```

Export the new constants and functions. Replace `initializeWorkflowMaintenance()` in `service.ts` with:

```ts
function initializeWorkflowMaintenance(): void {
  scheduleWorkflowMaintenance();
}
```

Update its import to use `scheduleWorkflowMaintenance`; keep terminal debug cleanup after terminal ticks unchanged.

- [ ] **Step 4: Add the error-isolation test**

```ts
test('workflow maintenance logs cleanup failures without throwing', () => {
  const original = snapshotRetentionRepo(debugRetentionRepo);
  const originalError = console.error;
  const errors: string[] = [];
  try {
    patchRetentionRepo(debugRetentionRepo, {
      listTerminalDebugMatches: () => { throw new Error('terminal cleanup failed'); },
      listStaleActiveMatches: () => [],
    });
    console.error = (message?: unknown) => { errors.push(String(message)); };
    assert.doesNotThrow(() => runWorkflowMaintenance());
    assert.equal(errors.some((message) => message.includes('terminal cleanup failed')), true);
  } finally {
    console.error = originalError;
    patchRetentionRepo(debugRetentionRepo, original);
  }
});
```

- [ ] **Step 5: Run workflow tests and server type-check**

Run:

```powershell
pnpm.cmd test:workflow
pnpm.cmd --filter @ai-presenter/server run check
```

Expected: both commands PASS with no new errors.

- [ ] **Step 6: Commit the cleanup and scheduler**

```powershell
git add packages/server/modules/workflow-engine/debugRetention.ts packages/server/modules/workflow-engine/service.ts tests/workflow/workflowPersistence.test.ts
git commit -m "feat: clean stale workflow matches daily"
```

---

### Task 3: Document retention and verify the complete change

**Files:**
- Modify: `docs/project-server.md`
- Modify: `docs/project-workflow.md`

**Interfaces:**
- Documents: seven-day stale active-match retention and 24-hour maintenance cadence.
- Documents: SQLite pages are reusable after deletion but full file shrink still requires offline `VACUUM`.

- [ ] **Step 1: Update server persistence documentation**

Extend the workflow retention paragraph in `docs/project-server.md` with:

```markdown
`running` / `waiting` match 若连续超过 7 天未更新，服务会在启动时及此后每 24 小时执行硬删除，并依赖外键级联清理关联 workflow 数据。该清理释放的 SQLite 页面可被后续写入复用；在线服务不执行阻塞式 `VACUUM`，物理缩小数据库文件需在停服维护窗口完成。
```

- [ ] **Step 2: Update workflow lifecycle documentation**

Replace the existing statement that `running/waiting` matches are never deleted in `docs/project-workflow.md` with:

```markdown
- `debugMode` 终态 match 仅保留最近 20 局。服务启动和调试对局进入终态时清理。
- `running` / `waiting` match 若 `updated_at` 超过 7 天未变化，服务启动时立即清理，并在持续运行期间每 24 小时再次清理；刚好 7 天的 match 保留。
- 两类清理都硬删除 `matches` 并依赖外键级联，不会在在线服务中自动执行阻塞式 `VACUUM`。
```

- [ ] **Step 3: Run focused and aggregate verification**

Run:

```powershell
pnpm.cmd test:workflow
pnpm.cmd --filter @ai-presenter/server run check
git diff --check
```

Expected: workflow tests PASS, server type-check PASS, and `git diff --check` reports no whitespace errors.

- [ ] **Step 4: Commit documentation**

```powershell
git add docs/project-server.md docs/project-workflow.md
git commit -m "docs: document stale workflow retention"
```

## Final Verification

- [ ] Confirm `git status --short` contains no unintended files.
- [ ] Confirm the RED run was observed before each production implementation.
- [ ] Confirm no API, schema, frontend, or shared-type changes were introduced.
- [ ] Report that logical pages are reclaimed automatically, while physical file shrink requires a separate offline `VACUUM` maintenance action.
