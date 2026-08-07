# Model Quota Fallback Status Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist an explicit quota-exhausted status, keep using each player's configured fallback model, and let an administrator test and manually re-enable the exhausted model.

**Architecture:** Extend the existing `models.enabled` circuit breaker with nullable reason and timestamp columns. The shared LLM boundary continues to classify provider responses and invoke the existing single fallback; the model module owns persistence and clearing. The admin reuses the existing test and update endpoints instead of adding an API or quota polling service.

**Tech Stack:** TypeScript, Node.js, Express, Zod, SQLite/better-sqlite3, React, Ant Design, Node test runner, pnpm.

## Global Constraints

- Keep one configured fallback model per player; do not add a global model pool.
- Do not poll, scrape, or estimate supplier quota balances.
- Only explicit quota, insufficient-balance, or billing-overdue responses set `disabled_reason = 'quota_exhausted'`.
- Ordinary rate limiting, timeout, network, 5xx, validation, content-safety, empty-response, and response-format errors must not set the quota marker.
- Re-enable is manual and must run the existing connection test before setting `enabled = true`.
- Do not change game REST payloads, WebSocket events, public snapshots, or the provider model ID used for inference.
- Add no dependencies and no new recovery endpoint.

---

## File Map

- `packages/server/db/migrations.ts`: create and idempotently add the two availability columns.
- `packages/server/types/database.ts`: type SQLite model rows.
- `packages/server/types/api.ts`: expose the two camelCase API fields.
- `packages/server/modules/models/utils.ts`: map and preserve/clear availability state.
- `packages/server/modules/models/repository.ts`: persist quota disable and normal model updates.
- `packages/server/modules/models/service.ts`: distinguish quota disable from manual enable/disable.
- `packages/server/modules/llm/service.ts`: pass the explicit quota reason into the model module.
- `packages/admin/src/types/entities.ts`: type the model status returned by the API.
- `packages/admin/src/pages/ModelManager/index.tsx`: render status and test-before-enable interaction.
- `tests/migration/modelQuotaStatus.test.ts`: prove migration defaults and idempotency.
- `tests/migration/runMigrationTests.cjs`: register the migration test.
- `tests/unit/modelQuotaStatus.test.ts`: prove row/API mapping and admin wiring.
- `tests/unit/runUnitTests.cjs`: register the unit test.
- `tests/unit/playerModelFallback.test.ts`: prove persistence, fallback, error classification, and recovery.
- `docs/project-server.md`: document server-side quota state and recovery.
- `docs/project-admin.md`: document the admin status and re-enable flow.

### Task 1: Add the persisted availability fields and typed mappings

**Files:**
- Create: `tests/migration/modelQuotaStatus.test.ts`
- Create: `tests/unit/modelQuotaStatus.test.ts`
- Modify: `tests/migration/runMigrationTests.cjs`
- Modify: `tests/unit/runUnitTests.cjs`
- Modify: `packages/server/db/migrations.ts:71-87,381-399`
- Modify: `packages/server/types/database.ts:64-79`
- Modify: `packages/server/types/api.ts:51-70`
- Modify: `packages/server/modules/models/utils.ts:16-43,45-62,89-102`
- Modify: `packages/server/modules/models/repository.ts:17-36`

**Interfaces:**
- Produces: `ModelRow.disabled_reason: string | null`
- Produces: `ModelRow.disabled_at: string | null`
- Produces: `Model.disabledReason: 'quota_exhausted' | null`
- Produces: `Model.disabledAt: string | null`
- Produces: `ModelRowInput.disabled_reason: string | null`
- Produces: `ModelRowInput.disabled_at: string | null`

- [ ] **Step 1: Write the failing migration test and register it**

Create `tests/migration/modelQuotaStatus.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../packages/server/db/migrations';

test('SQLite migration adds nullable model quota status fields idempotently', () => {
  const db = new Database(':memory:');
  try {
    migrate(db);
    migrate(db);
    const columns = db.prepare("PRAGMA table_info('models')").all() as Array<{
      name: string;
      notnull: number;
      dflt_value: string | null;
    }>;
    assert.deepEqual(
      columns
        .filter((column) => ['disabled_reason', 'disabled_at'].includes(column.name))
        .map((column) => [column.name, column.notnull, column.dflt_value]),
      [
        ['disabled_reason', 0, null],
        ['disabled_at', 0, null],
      ],
    );
  } finally {
    db.close();
  }
});
```

Add `'modelQuotaStatus.test.ts'` to `tests/migration/runMigrationTests.cjs`.

- [ ] **Step 2: Run migration tests and verify the new test fails**

Run:

```powershell
pnpm.cmd run test:migration
```

Expected: FAIL because `disabled_reason` and `disabled_at` do not exist.

- [ ] **Step 3: Write the failing model mapping tests and register them**

Create `tests/unit/modelQuotaStatus.test.ts` with a complete `ModelRow` fixture and:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { modelToRow, rowToModel } from '../../packages/server/modules/models/utils';

test('maps persisted quota status to the model API', () => {
  const model = rowToModel({
    id: 1,
    provider_id: 2,
    provider: 'aliyun',
    name: 'qwen-plus',
    display_name: 'Qwen Plus',
    base_url: '',
    api_format: 'openai-compatible',
    api_key_cipher: '',
    api_key_iv: '',
    api_key_tag: '',
    enabled: 0,
    thinking_enabled: 0,
    disabled_reason: 'quota_exhausted',
    disabled_at: '2026-08-07 12:00:00',
    created_at: '2026-08-07 11:00:00',
    updated_at: '2026-08-07 12:00:00',
  });

  assert.equal(model?.disabledReason, 'quota_exhausted');
  assert.equal(model?.disabledAt, '2026-08-07 12:00:00');
});

test('preserves quota status on unrelated edits and clears it on explicit enable changes', () => {
  const existing = {
    id: 1,
    provider_id: 2,
    provider: 'aliyun',
    name: 'qwen-plus',
    display_name: 'Qwen Plus',
    base_url: '',
    api_format: 'openai-compatible',
    api_key_cipher: '',
    api_key_iv: '',
    api_key_tag: '',
    enabled: 0,
    thinking_enabled: 0,
    disabled_reason: 'quota_exhausted',
    disabled_at: '2026-08-07 12:00:00',
    created_at: '2026-08-07 11:00:00',
    updated_at: '2026-08-07 12:00:00',
  } as const;

  assert.equal(modelToRow({ displayName: 'Renamed' }, null, existing).disabled_reason, 'quota_exhausted');
  assert.equal(modelToRow({ enabled: true }, null, existing).disabled_reason, null);
  assert.equal(modelToRow({ enabled: false }, null, existing).disabled_reason, null);
});
```

Add `'modelQuotaStatus.test.ts'` beside `modelDisplayName.test.ts` in `tests/unit/runUnitTests.cjs`.

- [ ] **Step 4: Run the targeted unit test and verify it fails**

Run:

```powershell
pnpm.cmd run test:unit -- modelQuotaStatus.test.ts
```

Expected: TypeScript compilation or assertions FAIL because the new fields are absent.

- [ ] **Step 5: Implement the schema, types, mapper, and normal update persistence**

In `packages/server/db/migrations.ts`, add the columns to the create table and idempotent migration:

```sql
disabled_reason TEXT,
disabled_at TEXT,
```

```ts
ensureColumn(db, 'models', 'disabled_reason', 'TEXT');
ensureColumn(db, 'models', 'disabled_at', 'TEXT');
```

Add the interfaces listed above. In `rowToModel()` map only the supported reason:

```ts
disabledReason: row.disabled_reason === 'quota_exhausted' ? 'quota_exhausted' : null,
disabledAt: row.disabled_at || null,
```

In `modelToRow()` use whether `enabled` was explicitly supplied:

```ts
const enabledChanged = typeof input.enabled === 'boolean';
```

```ts
disabled_reason: enabledChanged ? null : existing?.disabled_reason || null,
disabled_at: enabledChanged ? null : existing?.disabled_at || null,
```

Add both fields to the model `INSERT` and `UPDATE` statements and their named parameters.

- [ ] **Step 6: Run the task tests**

Run:

```powershell
pnpm.cmd run test:migration
pnpm.cmd run test:unit -- modelQuotaStatus.test.ts
pnpm.cmd run check:server
```

Expected: all commands PASS.

- [ ] **Step 7: Commit Task 1**

```powershell
git add packages/server/db/migrations.ts packages/server/types/database.ts packages/server/types/api.ts packages/server/modules/models/utils.ts packages/server/modules/models/repository.ts tests/migration/modelQuotaStatus.test.ts tests/migration/runMigrationTests.cjs tests/unit/modelQuotaStatus.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat: persist model quota status"
```

### Task 2: Persist explicit quota exhaustion and clear it on manual recovery

**Files:**
- Modify: `tests/unit/playerModelFallback.test.ts:99-151,208-235`
- Modify: `packages/server/modules/models/repository.ts:39-42`
- Modify: `packages/server/modules/models/service.ts:13-20,50-63`
- Modify: `packages/server/modules/llm/service.ts:500-516`

**Interfaces:**
- Consumes: `ModelRow.disabled_reason` and `ModelRow.disabled_at` from Task 1.
- Produces: `disableModel(id: number | string, reason?: 'quota_exhausted' | null): void`
- Produces: `updateModelAvailability(id, enabled, disabledReason): void` in the repository.
- Preserves: `callModelChatWithFallback(primary, fallback): Promise<string>`

- [ ] **Step 1: Extend the failing quota and recovery tests**

In `tests/unit/playerModelFallback.test.ts`, replace the enabled-only reader with:

```ts
function readModelStatus(id: number) {
  return getDb().prepare(
    'SELECT enabled, disabled_reason, disabled_at FROM models WHERE id = ?',
  ).get(id) as {
    enabled: number;
    disabled_reason: string | null;
    disabled_at: string | null;
  };
}
```

Extend the existing exhausted-balance test:

```ts
const exhausted = readModelStatus(modelId);
assert.equal(exhausted.enabled, 0);
assert.equal(exhausted.disabled_reason, 'quota_exhausted');
assert.ok(exhausted.disabled_at);
```

Extend the ordinary rate-limit test:

```ts
const limited = readModelStatus(modelId);
assert.equal(limited.enabled, 1);
assert.equal(limited.disabled_reason, null);
assert.equal(limited.disabled_at, null);
```

Add a fallback exhaustion case where both primary and fallback have IDs and both return `AllocationQuota.FreeTierOnly`; assert both rows are marked `quota_exhausted`.

For the recovery test, insert a temporary enabled `model_providers` row, insert the model with that `provider_id`, and import the model service:

```ts
import * as modelsService from '../../packages/server/modules/models/service';
```

After the first quota failure, call:

```ts
modelsService.updateModel(modelId, { enabled: true });
assert.deepEqual(readModelStatus(modelId), {
  enabled: 1,
  disabled_reason: null,
  disabled_at: null,
});
```

Then make the primary endpoint return `"restored"` and call `callModelChatWithFallback()` again. Assert the primary result is returned; this proves `updateModel()` also cleared the in-memory disabled set. Delete the temporary model before deleting its provider in `finally`.

Add one table-driven test for non-quota failures:

```ts
const cases = [
  ['server error', () => openAiResponse('upstream failed', 500)],
  ['validation error', () => openAiResponse('invalid request', 400)],
  ['network error', () => { throw new TypeError('fetch failed'); }],
] as const;
```

For each case, insert a fresh model, let the fallback succeed, and assert `readModelStatus()` remains `{ enabled: 1, disabled_reason: null, disabled_at: null }`.

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```powershell
pnpm.cmd run test:unit -- playerModelFallback.test.ts
```

Expected: FAIL because exhaustion only changes `enabled`.

- [ ] **Step 3: Implement the minimum persistence changes**

Replace `updateModelEnabled()` with a repository operation that updates the three fields atomically:

```ts
function updateModelAvailability(
  id: number | string,
  enabled: boolean,
  disabledReason: 'quota_exhausted' | null = null,
): void {
  getDb().prepare(`
    UPDATE models
    SET enabled = ?,
        disabled_reason = ?,
        disabled_at = CASE WHEN ? IS NULL THEN NULL ELSE CURRENT_TIMESTAMP END,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(enabled ? 1 : 0, disabledReason, disabledReason, Number(id));
}
```

Update the model service:

```ts
function disableModel(
  id: number | string,
  reason: 'quota_exhausted' | null = null,
): void {
  repo.updateModelAvailability(id, false, reason);
}
```

Keep `updateModel()` as the manual recovery path. Task 1's mapper clears persisted reason/time when `enabled` is explicitly changed, and the existing successful enable branch calls `clearQuotaDisabledModel()`.

Change the lazy LLM-to-model boundary and quota call:

```ts
const models = require('../models') as {
  disableModel: (id: number, reason?: 'quota_exhausted' | null) => void;
};
models.disableModel(Number(modelId), 'quota_exhausted');
```

- [ ] **Step 4: Run focused and server checks**

Run:

```powershell
pnpm.cmd run test:unit -- playerModelFallback.test.ts
pnpm.cmd run check:server
pnpm.cmd run build:server
```

Expected: all commands PASS.

- [ ] **Step 5: Commit Task 2**

```powershell
git add packages/server/modules/models/repository.ts packages/server/modules/models/service.ts packages/server/modules/llm/service.ts tests/unit/playerModelFallback.test.ts
git commit -m "feat: mark quota-exhausted models"
```

### Task 3: Show the marker and require a successful test before re-enable

**Files:**
- Modify: `tests/unit/modelQuotaStatus.test.ts`
- Modify: `packages/admin/src/types/entities.ts:16-28`
- Modify: `packages/admin/src/pages/ModelManager/index.tsx:1-112`

**Interfaces:**
- Consumes: `Model.disabledReason` and `Model.disabledAt` from Task 1.
- Consumes: `POST /models/:id/test` returning `{ ok: boolean; message?: string; latencyMs?: number }`.
- Consumes: `PUT /models/:id` with `{ enabled: true }`.
- Produces: no new API.

- [ ] **Step 1: Add a failing admin wiring test**

Add the `fs` and `path` imports at the top of `tests/unit/modelQuotaStatus.test.ts`, then append:

```ts
import fs from 'node:fs';
import path from 'node:path';

test('admin shows exhausted status and tests before enabling', () => {
  const source = fs.readFileSync(
    path.resolve('packages/admin/src/pages/ModelManager/index.tsx'),
    'utf8',
  );
  assert.match(source, /额度已用完/);
  assert.match(source, /disabledReason === 'quota_exhausted'/);
  const testCall = source.indexOf('/test');
  const enableCall = source.indexOf('JSON.stringify({ enabled: true })');
  assert.ok(testCall >= 0 && enableCall > testCall);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run:

```powershell
pnpm.cmd run test:unit -- modelQuotaStatus.test.ts
```

Expected: FAIL because the admin page has no status or re-enable action.

- [ ] **Step 3: Add the admin types and minimal interaction**

Add to the admin `Model` interface:

```ts
disabledReason: 'quota_exhausted' | null;
disabledAt: string | null;
```

Import `Tag` and `Typography`, and reuse the existing `formatTime()` helper from `adminHelpers`. Add a status column:

```tsx
{
  title: '状态',
  render: (_: unknown, model: Model) => model.disabledReason === 'quota_exhausted'
    ? (
      <Space direction="vertical" size={0}>
        <Tag color="error">额度已用完</Tag>
        <Typography.Text type="secondary">
          {formatTime(model.disabledAt || undefined)}
        </Typography.Text>
      </Space>
    )
    : <Tag color={model.enabled ? 'success' : 'default'}>{model.enabled ? '已启用' : '已停用'}</Tag>
}
```

Extend `testModel()` with `enableOnSuccess = false`. Only after `result.ok`:

```ts
if (enableOnSuccess) {
  await adminRequest(`/models/${model.id}`, {
    method: 'PUT',
    body: JSON.stringify({ enabled: true }),
  });
  message.success('模型已重新启用');
  await refresh();
  return;
}
```

Render a “重新启用” button only for `quota_exhausted` models:

```tsx
{model.disabledReason === 'quota_exhausted' && (
  <Button
    size="small"
    loading={testingId === model.id}
    onClick={() => testModel(model, true)}
  >
    重新启用
  </Button>
)}
```

On test failure, do not call `PUT`; keep the existing error message and persisted marker.

- [ ] **Step 4: Run focused admin verification**

Run:

```powershell
pnpm.cmd run test:unit -- modelQuotaStatus.test.ts
pnpm.cmd run check:admin
pnpm.cmd run build:admin
```

Expected: all commands PASS.

- [ ] **Step 5: Commit Task 3**

```powershell
git add packages/admin/src/types/entities.ts packages/admin/src/pages/ModelManager/index.tsx tests/unit/modelQuotaStatus.test.ts
git commit -m "feat: show and recover exhausted models"
```

### Task 4: Synchronize documentation and run final verification

**Files:**
- Modify: `docs/project-server.md`
- Modify: `docs/project-admin.md`

**Interfaces:**
- Documents the persisted state and existing endpoint sequence implemented by Tasks 1-3.
- Produces no runtime interface.

- [ ] **Step 1: Update server and admin documentation**

Add to `docs/project-server.md`:

```md
- 明确的额度耗尽、余额不足或欠费响应会将模型持久化为
  `enabled = 0`、`disabled_reason = quota_exhausted` 并记录 `disabled_at`；
  当前请求继续使用玩家配置的单一备用模型。普通限流、超时和 5xx
  不写入额度耗尽标记。
```

Add to `docs/project-admin.md`:

```md
- 模型列表区分“已停用”和“额度已用完”。额度耗尽模型只能由管理员手动恢复：
  后台先调用现有连接测试，成功后再通过现有模型更新接口启用并清除标记。
```

- [ ] **Step 2: Run all relevant verification**

Run:

```powershell
pnpm.cmd run test:unit
pnpm.cmd run test:migration
pnpm.cmd run check:server
pnpm.cmd run check:admin
pnpm.cmd run build:server
pnpm.cmd run build:admin
git diff --check
```

Expected:

- Unit and migration suites report zero failures.
- Server and admin type checks pass.
- Server and admin production builds pass.
- `git diff --check` prints no errors.
- Any Vite chunk-size warning is informational and does not fail the build.

- [ ] **Step 3: Perform one browser smoke test**

Start the local server and admin app with the project's existing development commands. In the model management page, verify:

1. A fixture model with `disabledReason = quota_exhausted` shows “额度已用完” and a timestamp.
2. Clicking “重新启用” with a failing connection leaves the model disabled.
3. Clicking it with a successful connection changes the status to “已启用”.
4. Model search, edit, test, and delete actions still work.
5. The browser console has no errors.

- [ ] **Step 4: Commit Task 4**

```powershell
git add docs/project-server.md docs/project-admin.md
git commit -m "docs: describe model quota recovery"
```

- [ ] **Step 5: Request final code review**

Use `superpowers:requesting-code-review` against the full branch diff. Resolve any Critical or Important findings, rerun the affected checks, then use `superpowers:verification-before-completion` before claiming completion.
