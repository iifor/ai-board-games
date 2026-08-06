# Model Display Names Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为模型增加独立的官方显示名称，同时保持现有 `name` 字段继续作为供应商调用所需的模型 ID，并在模型管理、玩家主/备选模型和玩家调试界面统一显示 `官方名称（模型 ID）`。

**Architecture:** 在现有 `models` 表上增加一个可为空字符串的 `display_name` 列，通过现有模型 mapper 和 REST API 暴露为 `displayName`。后台复用一个格式化函数处理所有显示位置；运行时调用仍只读取 `model.name`。已配置的阿里云百炼与火山方舟模型通过一次事务从当前控制台数据回填，不引入模型目录服务或新依赖。

**Tech Stack:** TypeScript、Node.js、SQLite (`better-sqlite3`)、React、Ant Design、Node test runner。

## Global Constraints

- 保留 `models.name` 的现有语义：它是供应商 API 的模型 ID。
- `displayName` 只用于管理后台展示，不能进入 LLM 请求的 `model` 字段。
- 显示格式统一为：名称非空且不同于 ID 时使用 `名称（ID）`，否则只显示 ID。
- `displayName` 接受空字符串，去除首尾空白，最长 120 个字符；非字符串或超长输入返回 HTTP 400。
- 不新增依赖、模型目录表、同步服务或定时任务。
- 不修改当前工作区中与本功能无关的用户改动。

---

## Task 1: Add the idempotent database column

**Files:**

- Create: `tests/migration/modelDisplayName.test.ts`
- Modify: `tests/migration/runMigrationTests.cjs`
- Modify: `packages/server/db/migrations.ts`
- Modify: `packages/server/types/database.ts`

- [ ] **Step 1: Write the failing migration test**

Create `tests/migration/modelDisplayName.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../packages/server/db/migrations';

test('SQLite migration adds an empty model display name without changing the model ID', () => {
  const db = new Database(':memory:');
  try {
    db.exec(`
      CREATE TABLE models (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        provider_id INTEGER,
        provider TEXT NOT NULL,
        name TEXT NOT NULL,
        base_url TEXT NOT NULL DEFAULT '',
        api_format TEXT NOT NULL DEFAULT 'openai-compatible',
        api_key_cipher TEXT NOT NULL DEFAULT '',
        api_key_iv TEXT NOT NULL DEFAULT '',
        api_key_tag TEXT NOT NULL DEFAULT '',
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
      INSERT INTO models (provider, name) VALUES ('阿里云百炼', 'qwen3.7-plus');
    `);

    migrate(db);

    const row = db.prepare('SELECT name, display_name FROM models').get() as {
      name: string;
      display_name: string;
    };
    assert.deepEqual(row, { name: 'qwen3.7-plus', display_name: '' });
  } finally {
    db.close();
  }
});
```

Add `'modelDisplayName.test.ts'` to the explicit `testFiles` list in `tests/migration/runMigrationTests.cjs`.

- [ ] **Step 2: Run the migration suite and confirm the new test fails**

Run:

```powershell
pnpm.cmd run test:migration
```

Expected: FAIL because `display_name` does not exist.

- [ ] **Step 3: Add the column to fresh and existing databases**

In the `CREATE TABLE IF NOT EXISTS models` statement in `packages/server/db/migrations.ts`, add:

```sql
display_name TEXT NOT NULL DEFAULT '',
```

Beside the existing `thinking_enabled` migration, add:

```ts
ensureColumn(db, 'models', 'display_name', "TEXT NOT NULL DEFAULT ''");
```

In `ModelRow` in `packages/server/types/database.ts`, add:

```ts
display_name: string;
```

- [ ] **Step 4: Run the migration suite and typecheck**

Run:

```powershell
pnpm.cmd run test:migration
pnpm.cmd run check:server
```

Expected: migration tests PASS. The server check may still fail only where the next task has not yet mapped the new required row field; record that exact failure and continue to Task 2.

- [ ] **Step 5: Commit the migration**

```powershell
git add packages/server/db/migrations.ts packages/server/types/database.ts tests/migration/modelDisplayName.test.ts tests/migration/runMigrationTests.cjs
git commit -m "feat: add model display name column"
```

---

## Task 2: Map, validate, and persist `displayName`

**Files:**

- Create: `tests/unit/modelDisplayName.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`
- Modify: `packages/server/types/api.ts`
- Modify: `packages/server/modules/models/utils.ts`
- Modify: `packages/server/modules/models/repository.ts`

- [ ] **Step 1: Write focused failing mapper and validation tests**

Create `tests/unit/modelDisplayName.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import { AppError } from '../../packages/server/utils/errors';
import { modelToRow, rowToModel } from '../../packages/server/modules/models/utils';
import type { ModelRow } from '../../packages/server/types/database';

const existing: ModelRow = {
  id: 1,
  provider_id: 2,
  provider: '阿里云百炼',
  name: 'qwen3.7-plus',
  display_name: 'Qwen3.7 Plus',
  base_url: '',
  api_format: 'openai-compatible',
  api_key_cipher: '',
  api_key_iv: '',
  api_key_tag: '',
  thinking_enabled: 0,
  enabled: 1,
  created_at: '2026-08-06',
  updated_at: '2026-08-06',
};

test('maps the display name without replacing the provider model ID', () => {
  const model = rowToModel(existing);
  assert.equal(model?.name, 'qwen3.7-plus');
  assert.equal(model?.displayName, 'Qwen3.7 Plus');
});

test('trims a supplied display name and preserves it on unrelated updates', () => {
  assert.equal(modelToRow({ displayName: '  Qwen3.7 Plus  ' }, null, existing).display_name, 'Qwen3.7 Plus');
  assert.equal(modelToRow({ enabled: false }, null, existing).display_name, 'Qwen3.7 Plus');
});

test('rejects invalid display names with HTTP 400', () => {
  for (const displayName of [42, 'x'.repeat(121)]) {
    assert.throws(
      () => modelToRow({ displayName } as never, null, existing),
      (error: unknown) => error instanceof AppError && error.httpStatus === 400,
    );
  }
});
```

Add `'modelDisplayName.test.ts'` to `tests/unit/runUnitTests.cjs`.

- [ ] **Step 2: Run the focused unit test and confirm it fails**

Run:

```powershell
pnpm.cmd run test:unit -- modelDisplayName.test.ts
```

Expected: FAIL because `displayName` and `display_name` are not mapped.

- [ ] **Step 3: Extend the existing types and mapper**

In `packages/server/types/api.ts`, add to `Model`:

```ts
displayName: string;
```

In `packages/server/modules/models/utils.ts`:

```ts
import { AppError, ErrorCodes } from '../../utils/errors';
```

Add the optional input field and required row field:

```ts
interface ModelInput {
  // existing fields
  displayName?: unknown;
}

interface ModelRowInput {
  // existing fields
  display_name: string;
}
```

Add the minimal validator:

```ts
function normalizeDisplayName(value: unknown, existing = ''): string {
  if (value === undefined) return existing;
  if (typeof value !== 'string') {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '模型名称必须是字符串', 400);
  }
  const text = value.trim();
  if (text.length > 120) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '模型名称不能超过 120 个字符', 400);
  }
  return text;
}
```

Map the field in both directions:

```ts
// rowToModel
displayName: row.display_name || '',

// modelToRow
display_name: normalizeDisplayName(input.displayName, existing?.display_name || ''),
```

Keep `name` mapping unchanged.

- [ ] **Step 4: Persist the field in the existing repository**

Update `insertModel` in `packages/server/modules/models/repository.ts`:

```sql
INSERT INTO models (
  provider_id, provider, name, display_name, base_url, api_format,
  api_key_cipher, api_key_iv, api_key_tag, enabled, created_at, updated_at
)
VALUES (
  @provider_id, @provider, @name, @display_name, @base_url, @api_format,
  @api_key_cipher, @api_key_iv, @api_key_tag, @enabled, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
)
```

Update `updateModel`:

```sql
SET provider_id = @provider_id,
    provider = @provider,
    name = @name,
    display_name = @display_name,
    thinking_enabled = @thinking_enabled,
    enabled = @enabled,
    updated_at = CURRENT_TIMESTAMP
```

- [ ] **Step 5: Prove the runtime request still uses `name`**

Keep this existing line in `packages/server/modules/models/service.ts` unchanged:

```ts
model: model.name,
```

Run:

```powershell
pnpm.cmd run test:unit -- modelDisplayName.test.ts playerModelFallback.test.ts
pnpm.cmd run check:server
```

Expected: both focused test files PASS and server typecheck PASS.

- [ ] **Step 6: Commit the server contract**

```powershell
git add packages/server/types/api.ts packages/server/modules/models/utils.ts packages/server/modules/models/repository.ts tests/unit/modelDisplayName.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat: expose model display names"
```

---

## Task 3: Use one admin formatter everywhere

**Files:**

- Modify: `tests/unit/modelDisplayName.test.ts`
- Modify: `packages/admin/src/types/entities.ts`
- Modify: `packages/admin/src/utils/adminHelpers.ts`
- Modify: `packages/admin/src/pages/ModelManager/index.tsx`
- Modify: `packages/admin/src/pages/PlayerManager/index.tsx`

- [ ] **Step 1: Add failing formatter tests**

Append to `tests/unit/modelDisplayName.test.ts`:

```ts
import { formatModelLabel } from '../../packages/admin/src/utils/adminHelpers';

test('formats a model label once for every admin surface', () => {
  assert.equal(
    formatModelLabel({ name: 'qwen3.7-plus', displayName: 'Qwen3.7 Plus' }),
    'Qwen3.7 Plus（qwen3.7-plus）',
  );
  assert.equal(
    formatModelLabel({ name: 'qwen3.7-plus', displayName: '' }),
    'qwen3.7-plus',
  );
  assert.equal(
    formatModelLabel({ name: 'qwen3.7-plus', displayName: 'qwen3.7-plus' }),
    'qwen3.7-plus',
  );
});
```

- [ ] **Step 2: Run the focused unit test and confirm it fails**

Run:

```powershell
pnpm.cmd run test:unit -- modelDisplayName.test.ts
```

Expected: FAIL because `formatModelLabel` is not exported.

- [ ] **Step 3: Add the admin type and shared formatter**

In `packages/admin/src/types/entities.ts`, add:

```ts
displayName: string;
```

In `packages/admin/src/utils/adminHelpers.ts`, add:

```ts
export function formatModelLabel(model: { name: string; displayName?: string }): string {
  const displayName = String(model.displayName || '').trim();
  return displayName && displayName !== model.name
    ? `${displayName}（${model.name}）`
    : model.name;
}
```

Change the existing `modelName` signature and linked-model branch:

```ts
export function modelName(
  player: { modelId?: number | null; model?: string },
  models: Array<{ id: number; provider: string; name: string; displayName?: string }>,
): string {
  const linked = models.find((model) => model.id === player.modelId);
  if (linked) return `${linked.provider}/${formatModelLabel(linked)}`;
  return player.model || '-';
}
```

- [ ] **Step 4: Update model management without duplicating formatting logic**

In `packages/admin/src/pages/ModelManager/index.tsx`:

- Import `formatModelLabel`.
- Search both `displayName` and `name`.
- Show separate `模型名称` and `模型 ID` columns.
- Use `formatModelLabel(model)` in delete confirmations.
- Add a required `displayName` input with a 120-character limit.
- Relabel the existing `name` input as `模型 ID`.

Use these exact changes:

```tsx
const filteredModels = filterByQuery(models, filters.q, ['displayName', 'name']);

{ title: '模型名称', dataIndex: 'displayName', render: (_: unknown, model: Model) => model.displayName || model.name },
{ title: '模型 ID', dataIndex: 'name' },

<Form.Item
  name="displayName"
  label="模型名称"
  rules={[
    { required: true, whitespace: true, message: '请输入模型名称' },
    { max: 120, message: '模型名称不能超过 120 个字符' },
  ]}
>
  <Input />
</Form.Item>
<Form.Item name="name" label="模型 ID" rules={[{ required: true, message: '请输入模型 ID' }]}>
  <Input />
</Form.Item>
```

- [ ] **Step 5: Update player selectors, table, search, and debug display**

In `packages/admin/src/pages/PlayerManager/index.tsx`, import `formatModelLabel` and change the three direct labels:

```ts
const modelOptions = models.map((model) => ({
  value: model.id,
  label: `${model.provider}/${formatModelLabel(model)}`,
  disabled: !model.enabled,
}));
```

```tsx
<Descriptions.Item label="模型">
  {model ? `${model.provider}/${formatModelLabel(model)}` : '未绑定'}
</Descriptions.Item>
<Descriptions.Item label="备选模型">
  {fallbackModel ? `${fallbackModel.provider}/${formatModelLabel(fallbackModel)}` : '未配置'}
</Descriptions.Item>
```

The existing table and search continue through `modelName`, so no second formatter is added.

- [ ] **Step 6: Run unit tests and admin checks**

Run:

```powershell
pnpm.cmd run test:unit -- modelDisplayName.test.ts
pnpm.cmd run check:admin
pnpm.cmd run build:admin
```

Expected: formatter tests, admin typecheck, and admin production build PASS.

- [ ] **Step 7: Commit the admin display**

```powershell
git add packages/admin/src/types/entities.ts packages/admin/src/utils/adminHelpers.ts packages/admin/src/pages/ModelManager/index.tsx packages/admin/src/pages/PlayerManager/index.tsx tests/unit/modelDisplayName.test.ts
git commit -m "feat: show model display names in admin"
```

---

## Task 4: Backfill official names in the existing database

**Files:**

- Modify data only: `packages/data/ai-presenter.sqlite`
- Do not create or commit a permanent catalog file or backfill script.

- [ ] **Step 1: Re-read the two authenticated console pages**

Use the existing logged-in browser sessions:

- `https://bailian.console.aliyun.com/cn-beijing?tab=costing-balance#/costing-balance/free-quota`
- `https://console.volcengine.com/ark/region:cn-beijing/openManagement?LLM=%7B%7D&advancedActiveKey=model`

Collect exact triples:

```text
provider name | model ID | console display name
```

Rules:

- Include only models already configured in the database for these two providers.
- Use the console's exact visible official name.
- If a console exposes only `Model Code`, use that exact code as `display_name`; do not invent a translated marketing name.
- Do not open new models or change `enabled`.
- Skip paused/unavailable models already excluded by the prior configuration work.

- [ ] **Step 2: Preview the transaction input against the database**

Before writing, query:

```sql
SELECT p.name AS provider_name, m.id, m.name, m.display_name, m.enabled
FROM models m
JOIN model_providers p ON p.id = m.provider_id
WHERE p.name IN ('阿里云百炼', '火山方舟')
ORDER BY p.name, m.name, m.id;
```

Assert:

- Every collected ID resolves to at least one row under the intended provider.
- Duplicate configured IDs, if any, receive the same official display name.
- No row outside the two target providers is selected.

- [ ] **Step 3: Update all target rows in one SQLite transaction**

Use a temporary in-memory list and a prepared statement:

```ts
const update = db.prepare(`
  UPDATE models
  SET display_name = ?, updated_at = CURRENT_TIMESTAMP
  WHERE provider_id = (
    SELECT id FROM model_providers WHERE name = ?
  ) AND name = ?
`);

db.transaction((rows: Array<{ provider: string; id: string; displayName: string }>) => {
  for (const row of rows) {
    const result = update.run(row.displayName, row.provider, row.id);
    if (result.changes < 1) throw new Error(`Missing configured model: ${row.provider}/${row.id}`);
  }
})(rows);
```

Run this as a one-off operation; do not save credentials, API keys, or the temporary script in the repository.

- [ ] **Step 4: Verify the persisted result and unchanged runtime IDs**

Run database assertions equivalent to:

```sql
SELECT COUNT(*) AS blank_count
FROM models m
JOIN model_providers p ON p.id = m.provider_id
WHERE p.name IN ('阿里云百炼', '火山方舟')
  AND TRIM(m.display_name) = '';
```

Expected: `blank_count = 0`.

Also compare the before/after `(id, provider_id, name, enabled)` sets byte-for-byte. Only `display_name` and `updated_at` may differ.

- [ ] **Step 5: Re-test one model per provider**

From the existing model management UI, run:

- Alibaba: `qwen3.7-plus`
- Ark: `doubao-seed-2-1-turbo-260628`

Expected: both return the existing successful `pong` result, proving display names did not replace provider model IDs.

No Git commit is required for the live SQLite data unless the repository intentionally tracks this database.

---

## Task 5: Document and verify the complete change

**Files:**

- Modify: `docs/project-server.md`
- Modify: `docs/project-admin.md`

- [ ] **Step 1: Update only the affected project documentation**

In `docs/project-server.md`, document:

- `models.name` remains the outbound provider model ID.
- `models.display_name` is an optional human-readable label exposed as `displayName`.
- Create/update validation: string, trimmed, maximum 120 characters.

In `docs/project-admin.md`, document:

- Model management edits both `模型名称` and `模型 ID`.
- Player model locations use `名称（ID）`, with ID-only fallback.

Do not update `docs/project-shared.md`; no shared package type changes.

- [ ] **Step 2: Run all relevant automated checks**

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

- Unit tests PASS, including the new mapper/formatter checks.
- Migration tests PASS, including upgrading an old `models` table.
- Server/admin typechecks and builds PASS.
- `git diff --check` reports no whitespace errors.

- [ ] **Step 3: Perform browser verification**

Verify in the running admin:

- Model management table shows separate `模型名称` and `模型 ID`.
- Create/edit round-trips `displayName`.
- Search matches both official name and model ID.
- Player primary and fallback selectors show `供应商/名称（ID）`.
- Player list and debug modal show the same format.
- A blank or equal display name falls back to ID without empty parentheses.
- Browser console has no errors.

- [ ] **Step 4: Commit documentation**

```powershell
git add docs/project-server.md docs/project-admin.md
git commit -m "docs: document model display names"
```

- [ ] **Step 5: Review the final diff**

Run:

```powershell
git status --short
git diff --stat HEAD~4..HEAD
```

Confirm:

- No unrelated dirty files were staged or committed.
- No dependency or permanent catalog/sync abstraction was added.
- `testModelConnection` and runtime LLM paths still send `model.name`.
