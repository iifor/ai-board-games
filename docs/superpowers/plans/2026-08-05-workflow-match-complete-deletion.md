# Workflow Match Complete Deletion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 B 端工作流调试控制台安全地彻底删除一个终态 Match，并关联清理同 ID 历史对局、回放、AI 观测树和专属音频，同时保留其他对局与跨局玩家记忆。

**Architecture:** 继续以 workflow match 为删除主线。`workflow-engine/service.ts` 负责状态校验和单事务编排，复用 `debugRetentionRepository.deleteMatchCascade()`、games 现有删除规则和 observability 外键级联；数据库提交后再清理文件。B 端只提供已鉴权入口和精确 Match ID 二次确认，不承担最终状态判断。

**Tech Stack:** TypeScript、Express、React 18、Ant Design、SQLite/better-sqlite3、Node.js test runner、pnpm。

## Global Constraints

- 仅允许删除 `completed`、`failed`、`paused_debug`；服务端是最终校验边界。
- 不新增数据库表、migration、依赖、共享类型或 C 端改动。
- 不执行 `VACUUM` 或 WAL checkpoint；删除释放的页面只供 SQLite 后续复用。
- `player_game_memories`、其他 Match/Game/Trace 和被其他游戏引用的共享音频必须保留。
- 数据库删除必须同一事务完成；文件清理在提交后执行，失败必须记录错误但不能伪造数据库回滚。
- 保留工作区现有无关改动，不重写或还原它们。

---

## File Map

### New

- `tests/unit/workflowMatchDeletion.test.ts`：用内存 SQLite 覆盖终态级联删除、活动 Match 拒绝和 404。

### Modify

- `tests/unit/runUnitTests.cjs`：把新测试加入默认单元测试清单。
- `packages/server/modules/observability/db.ts`：按根 Span 的 `game.id` 删除 Trace 主记录并返回数量。
- `packages/server/modules/games/service.ts`：把现有游戏删除拆成“准备资源清单 / 删除数据库记录 / 提交后清理文件”三个可复用步骤。
- `packages/server/modules/workflow-engine/service.ts`：校验 Match 状态并编排完整删除事务。
- `packages/server/modules/workflow-engine/controller.ts`：将删除结果包装为统一后台响应。
- `packages/server/modules/workflow-engine/routes.ts`：绑定已鉴权的 DELETE 路由。
- `packages/admin/src/services/adminApi.ts`：增加删除结果类型和请求函数。
- `packages/admin/src/pages/WorkflowDebugConsole/index.tsx`：增加危险按钮、精确 ID 确认弹窗和成功后清空状态。
- `docs/project-admin.md`：记录 B 端入口、禁用条件和确认规则。
- `docs/project-server.md`：记录管理 API、删除范围和事务边界。
- `docs/project-workflow.md`：记录 Match 级联语义以及不自动物理压缩数据库。

### Reuse Unchanged

- `packages/server/modules/workflow-engine/debugRetentionRepository.ts`：直接复用现有 `deleteMatchCascade(matchId)`，不再新增重复 repository 方法。
- `packages/server/modules/games/repository.ts`：继续复用现有 `findGameById()`、`deleteGameById()`。
- `packages/server/modules/game-socket/playbackRepository.ts`：继续复用 `deletePlaybackEvents()`。
- `packages/server/modules/upload/service.ts`：继续复用已有路径校验和音频删除函数。
- `packages/server/middlewares/auth.ts` 及管理路由挂载：继续提供 `/api/admin` 鉴权。

---

## Task 1: Add the Failing Deletion Contract Test

**Files:**

- Create: `tests/unit/workflowMatchDeletion.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

- [ ] **Step 1: Build one isolated database fixture**

在测试中沿用 `workflowPersistence.test.ts` 的现有模式：创建内存 SQLite、开启外键、执行 migration，并临时替换 `dbModule.getDb`。

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import { migrate } from '../../packages/server/db/migrations';
import * as dbModule from '../../packages/server/db';
import { deleteWorkflowMatch } from '../../packages/server/modules/workflow-engine/service';

function withDatabase(run: (db: Database.Database) => void): void {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  migrate(db);
  const originalGetDb = dbModule.getDb;
  Object.assign(dbModule, { getDb: () => db });
  try {
    run(db);
  } finally {
    Object.assign(dbModule, { getDb: originalGetDb });
    db.close();
  }
}
```

- [ ] **Step 2: Seed target, control, and active records**

测试数据必须包含：

- `target-match`：`completed`，并拥有 workflow 子表记录、`memory_snapshots`、同 ID `games`、`game_playback_events`、根 Span 带 `{"game.id":"target-match"}` 的 Trace 及至少一个观测子表记录。
- `control-match`：同样具有关联记录，用于证明未误删。
- `running-match`：`running`，用于证明 409 前无任何写入。
- 两个玩家及一条 `player_game_memories`，用于证明跨局记忆保留。

workflow 子表断言清单固定为：

```ts
const workflowTables = [
  'workflow_events',
  'match_snapshots',
  'ai_tasks',
  'pending_actions',
  'outbox_messages',
  'action_window_epochs',
  'workflow_effects',
  'workflow_interrupts',
  'memory_snapshots',
];
```

- [ ] **Step 3: Specify terminal deletion behavior**

```ts
test('complete deletion removes only the terminal match graph', () => {
  withDatabase((db) => {
    seedDeletionGraph(db);

    assert.deepEqual(deleteWorkflowMatch('target-match'), {
      matchId: 'target-match',
      deleted: { match: true, game: true, traces: 1 },
    });

    assert.equal(count(db, 'matches', 'id', 'target-match'), 0);
    assert.equal(count(db, 'games', 'id', 'target-match'), 0);
    assert.equal(count(db, 'game_playback_events', 'game_id', 'target-match'), 0);
    assert.equal(count(db, 'game_traces', 'id', 'target-trace'), 0);
    for (const table of workflowTables) {
      assert.equal(count(db, table, 'match_id', 'target-match'), 0, table);
    }

    assert.equal(count(db, 'matches', 'id', 'control-match'), 1);
    assert.equal(count(db, 'games', 'id', 'control-match'), 1);
    assert.equal(count(db, 'game_traces', 'id', 'control-trace'), 1);
    assert.equal(
      (db.prepare('SELECT COUNT(*) AS count FROM player_game_memories').get() as { count: number }).count,
      1,
    );
  });
});
```

- [ ] **Step 4: Specify active and missing Match failures**

```ts
test('complete deletion rejects active matches without partial deletion', () => {
  withDatabase((db) => {
    seedDeletionGraph(db);
    assert.throws(
      () => deleteWorkflowMatch('running-match'),
      (error: unknown) => (
        error instanceof Error
        && 'httpStatus' in error
        && error.httpStatus === 409
      ),
    );
    assert.equal(count(db, 'matches', 'id', 'running-match'), 1);
  });
});

test('complete deletion returns 404 for an unknown match', () => {
  withDatabase(() => {
    assert.throws(
      () => deleteWorkflowMatch('missing-match'),
      (error: unknown) => (
        error instanceof Error
        && 'httpStatus' in error
        && error.httpStatus === 404
      ),
    );
  });
});
```

- [ ] **Step 5: Register and run the red test**

把 `workflowMatchDeletion.test.ts` 加到 `tests/unit/runUnitTests.cjs` 默认列表。

Run:

```powershell
pnpm.cmd run test:unit -- workflowMatchDeletion.test.ts
```

Expected: FAIL，因为 `deleteWorkflowMatch` 尚未导出或尚未实现。

- [ ] **Step 6: Commit the contract**

```powershell
git add tests/unit/workflowMatchDeletion.test.ts tests/unit/runUnitTests.cjs
git commit -m "test: define workflow match complete deletion"
```

---

## Task 2: Implement the Backend Deletion Transaction and API

**Files:**

- Modify: `packages/server/modules/observability/db.ts`
- Modify: `packages/server/modules/games/service.ts`
- Modify: `packages/server/modules/workflow-engine/service.ts`
- Modify: `packages/server/modules/workflow-engine/controller.ts`
- Modify: `packages/server/modules/workflow-engine/routes.ts`
- Test: `tests/unit/workflowMatchDeletion.test.ts`

- [ ] **Step 1: Add one observability deletion query**

在 `observability/db.ts` 增加并导出：

```ts
function deleteTracesByGameId(gameId: string): number {
  const db = getDb() as ReturnType<typeof getDb> & { isJsonFallback?: boolean };
  if (db.isJsonFallback) return 0;
  return db.prepare(`
    DELETE FROM game_traces
    WHERE id IN (
      SELECT DISTINCT trace_id
      FROM trace_spans
      WHERE parent_span_id IS NULL
        AND json_extract(attributes_json, '$."game.id"') = @gameId
    )
  `).run({ gameId }).changes;
}
```

只删除 `game_traces` 主记录；现有外键负责删除 span、LLM、decision、event、snapshot。

- [ ] **Step 2: Split the existing game deletion without adding a new abstraction layer**

在 `games/service.ts` 增加内部数据结构和三个函数：

```ts
interface GameDeletionPlan {
  gameId: string;
  generatedAudioUrls: string[];
}

function prepareGameDeletion(id: string): GameDeletionPlan | null {
  const game = getGame(id);
  if (!game) return null;
  return {
    gameId: game.id,
    generatedAudioUrls: Array.isArray(game.audioResources)
      ? game.audioResources.filter(
        (url): url is string => typeof url === 'string' && shouldCleanAudioUrl(url, id),
      )
      : [],
  };
}

function deleteGameRecords(id: string): boolean {
  if (!repo.findGameById(id)) return false;
  deletePlaybackEvents(id);
  repo.deleteGameById(id);
  return true;
}

function cleanupGameFiles(plan: GameDeletionPlan): void {
  try {
    upload.deleteGameAudioDirectory(plan.gameId);
    plan.generatedAudioUrls.forEach((url) => upload.deleteGeneratedAudioByUrl(url));
  } catch (error) {
    console.error('[deleteGame] audio cleanup failed:', (error as Error).message);
  }
}
```

改写现有 `deleteGame(id)` 为：

```ts
function deleteGame(id: string): { ok: boolean } {
  const plan = prepareGameDeletion(id);
  if (!plan) throw new AppError(ErrorCodes.NOT_FOUND, '游戏记录不存在', 404);
  getDb().transaction(() => deleteGameRecords(id))();
  cleanupGameFiles(plan);
  return { ok: true };
}
```

导出 `prepareGameDeletion`、`deleteGameRecords`、`cleanupGameFiles` 和 `GameDeletionPlan`，供 workflow service 复用；不修改 games repository。

- [ ] **Step 3: Implement the workflow service boundary**

在 `workflow-engine/service.ts` 导入：

```ts
import { AppError, ErrorCodes } from '../../utils/errors';
import { deleteMatchCascade } from './debugRetentionRepository';
import { deleteTracesByGameId } from '../observability/db';
import {
  prepareGameDeletion,
  deleteGameRecords,
  cleanupGameFiles,
} from '../games/service';
```

增加返回类型和实现：

```ts
interface WorkflowMatchDeletionResult {
  matchId: string;
  deleted: {
    match: boolean;
    game: boolean;
    traces: number;
  };
}

function deleteWorkflowMatch(matchId: string): WorkflowMatchDeletionResult {
  const match = repo.getMatch(matchId);
  if (!match) throw new AppError(ErrorCodes.NOT_FOUND, 'Match 不存在', 404);
  if (!TERMINAL_STATUSES.includes(match.status)) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, '进行中的 Match 不可删除', 409);
  }

  const gamePlan = prepareGameDeletion(matchId);
  let gameDeleted = false;
  let tracesDeleted = 0;
  let matchDeleted = false;

  getDb().transaction(() => {
    gameDeleted = deleteGameRecords(matchId);
    tracesDeleted = deleteTracesByGameId(matchId);
    matchDeleted = deleteMatchCascade(matchId);
    if (!matchDeleted) throw new AppError(ErrorCodes.NOT_FOUND, 'Match 不存在', 404);
  })();

  if (gamePlan && gameDeleted) cleanupGameFiles(gamePlan);
  return {
    matchId,
    deleted: {
      match: matchDeleted,
      game: gameDeleted,
      traces: tracesDeleted,
    },
  };
}
```

导出 `deleteWorkflowMatch` 和 `WorkflowMatchDeletionResult`。不新增新的错误码；复用 `VALIDATION_ERROR` 并明确返回 HTTP 409。

- [ ] **Step 4: Bind the authenticated admin route**

`controller.ts`：

```ts
function deleteMatch(req: Request, res: Response, next: NextFunction): void {
  try {
    res.json(formatSuccess(service.deleteWorkflowMatch(String(req.params.matchId))));
  } catch (error) {
    next(error);
  }
}
```

将 `deleteMatch` 加入导出；`routes.ts` 增加：

```ts
router.delete('/workflow/matches/:matchId', controller.deleteMatch);
```

该 router 已挂载在 `/api/admin` 鉴权链上，不增加第二套权限逻辑。

- [ ] **Step 5: Run the focused test and server type check**

Run:

```powershell
pnpm.cmd run test:unit -- workflowMatchDeletion.test.ts
pnpm.cmd run check:server
```

Expected: 新增测试全部 PASS；server TypeScript check exit 0。

- [ ] **Step 6: Commit the backend**

```powershell
git add packages/server/modules/observability/db.ts packages/server/modules/games/service.ts packages/server/modules/workflow-engine/service.ts packages/server/modules/workflow-engine/controller.ts packages/server/modules/workflow-engine/routes.ts
git commit -m "feat: delete complete workflow match data"
```

---

## Task 3: Add the B-End Guarded Deletion UI

**Files:**

- Modify: `packages/admin/src/services/adminApi.ts`
- Modify: `packages/admin/src/pages/WorkflowDebugConsole/index.tsx`

- [ ] **Step 1: Add the typed admin request**

在 `adminApi.ts` 增加：

```ts
export interface WorkflowMatchDeletionResult {
  matchId: string;
  deleted: {
    match: boolean;
    game: boolean;
    traces: number;
  };
}

export function deleteWorkflowMatch(matchId: string) {
  return adminRequest<WorkflowMatchDeletionResult>(
    `/workflow/matches/${encodeURIComponent(matchId)}`,
    { method: 'DELETE' },
  );
}
```

- [ ] **Step 2: Add minimal local deletion state**

在 `WorkflowDebugConsole` 中复用现有 `match`、`loadedMatchId` 和 `message`：

```ts
const DELETABLE_MATCH_STATUSES = new Set(['completed', 'failed', 'paused_debug']);

const [deleteOpen, setDeleteOpen] = useState(false);
const [deleteConfirmation, setDeleteConfirmation] = useState('');
const [deleting, setDeleting] = useState(false);

const loadedStatus = typeof match?.status === 'string' ? match.status : '';
const canDeleteLoadedMatch = Boolean(
  loadedMatchId
  && loadedMatchId === matchId.trim()
  && DELETABLE_MATCH_STATUSES.has(loadedStatus),
);
```

- [ ] **Step 3: Add the destructive action**

```ts
async function deleteLoadedMatch(): Promise<void> {
  if (!loadedMatchId || deleteConfirmation !== loadedMatchId) return;
  setDeleting(true);
  try {
    const result = await deleteWorkflowMatch(loadedMatchId);
    setDebug(null);
    setLoadedMatchId(null);
    setMatchId('');
    setDeleteOpen(false);
    setDeleteConfirmation('');
    message.success(
      `已删除 Match；历史对局 ${result.deleted.game ? 1 : 0} 条，Trace ${result.deleted.traces} 条`,
    );
  } catch (error) {
    message.error(error instanceof Error ? error.message : '删除失败');
  } finally {
    setDeleting(false);
  }
}
```

成功时清空当前页面；失败时保留已加载数据，便于用户判断与重试。

- [ ] **Step 4: Add the button and exact-ID confirmation modal**

按钮仅在已加载 Match 后显示。活动状态保持禁用，并通过原生 `title` 说明原因：

```tsx
{match && (
  <Button
    danger
    disabled={!canDeleteLoadedMatch}
    title={canDeleteLoadedMatch ? '' : '进行中的 Match 不可删除'}
    onClick={() => setDeleteOpen(true)}
  >
    彻底删除对局数据
  </Button>
)}
```

弹窗使用现有 Ant Design，不引入组件或依赖：

```tsx
<Modal
  title="彻底删除对局数据"
  open={deleteOpen}
  okText="确认彻底删除"
  cancelText="取消"
  okButtonProps={{
    danger: true,
    disabled: deleteConfirmation !== loadedMatchId,
  }}
  confirmLoading={deleting}
  onOk={deleteLoadedMatch}
  onCancel={() => {
    setDeleteOpen(false);
    setDeleteConfirmation('');
  }}
>
  <Alert
    type="error"
    showIcon
    message="此操作不可恢复"
    description="将删除该 Match 的工作流、历史回放、AI 观测数据和专属音频；不会删除跨局玩家记忆。"
  />
  <Paragraph style={{ marginTop: 16 }}>
    请输入完整 Match ID：<Text code>{loadedMatchId}</Text>
  </Paragraph>
  <Input
    value={deleteConfirmation}
    onChange={(event) => setDeleteConfirmation(event.target.value)}
    placeholder="输入完整 Match ID"
  />
</Modal>
```

- [ ] **Step 5: Run the admin type check**

Run:

```powershell
pnpm.cmd run check:admin
```

Expected: exit 0。

- [ ] **Step 6: Verify the running page**

在本地 B 端工作流调试控制台验证：

1. 未加载 Match 时不显示删除按钮。
2. `running` / `waiting` 时按钮禁用且说明原因。
3. 终态 Match 可打开弹窗。
4. Match ID 未完全匹配时确认按钮禁用。
5. 取消不改变页面数据。
6. 后端失败保留页面数据并显示错误。
7. 成功后输入框、统计卡片和所有 Tab 清空，摘要数量正确。
8. 浏览器控制台无错误。

- [ ] **Step 7: Commit the admin UI**

```powershell
git add packages/admin/src/services/adminApi.ts packages/admin/src/pages/WorkflowDebugConsole/index.tsx
git commit -m "feat: add guarded workflow match deletion"
```

---

## Task 4: Update Project Contracts and Run Final Verification

**Files:**

- Modify: `docs/project-admin.md`
- Modify: `docs/project-server.md`
- Modify: `docs/project-workflow.md`

- [ ] **Step 1: Update the admin contract**

在 `WorkflowDebugConsole` 小节记录：

- 只有已加载且输入框 ID 未变化的终态 Match 可删除。
- 必须重新输入完整 Match ID。
- 成功清空页面，失败保留页面。

- [ ] **Step 2: Update the server contract**

新增管理 API：

```http
DELETE /api/admin/workflow/matches/:matchId
```

记录 404、409、统一成功摘要和 `/api/admin` 鉴权边界。

- [ ] **Step 3: Update the workflow/storage contract**

明确 Match 删除会关联清理：

- workflow 外键子表与 `memory_snapshots`
- 同 ID game、players、playback
- 根 Span `game.id` 对应的 Trace 树
- 提交后的专属音频

同时明确保留 `player_game_memories`，且 DELETE 不会让 SQLite 文件立即缩小。

- [ ] **Step 4: Run focused and repository checks**

Run:

```powershell
pnpm.cmd run test:unit -- workflowMatchDeletion.test.ts
pnpm.cmd run check:server
pnpm.cmd run check:admin
pnpm.cmd run test:unit
pnpm.cmd run check
```

Expected:

- focused deletion tests PASS；
- server/admin TypeScript checks exit 0；
- full unit suite PASS；
- repository-wide checks exit 0。

如果无关工作区改动导致全量检查失败，记录精确失败文件和 targeted checks 结果，不宣称全量通过。

- [ ] **Step 5: Inspect the final diff**

Run:

```powershell
git diff --check
git status --short
```

Expected: 无 whitespace error；仅本计划列出的文件和用户原有无关改动出现。

- [ ] **Step 6: Commit the documentation**

```powershell
git add docs/project-admin.md docs/project-server.md docs/project-workflow.md
git commit -m "docs: document workflow match complete deletion"
```

---

## Completion Report Checklist

- 新增、修改、删除文件清单及每个文件职责。
- 前端改动点、后端改动点、API 变化。
- 数据库 schema：无变化；数据删除语义：有变化。
- 共享类型：无变化；admin 本地响应类型：新增。
- 测试命令和实际结果，不用计划结果代替运行证据。
- 明确说明 SQLite 逻辑空间已释放但文件不会因该 API 自动缩小。
- 后续可选项仅保留停服维护窗口的 checkpoint/backup/VACUUM，不把它混入在线删除功能。
