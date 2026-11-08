# Debate Debug Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Debate setup toggle that runs the normal Debate workflow with deterministic local output, browser speech/subtitles, and no formal history record.

**Architecture:** Reuse the existing `debugMode` WebSocket payload, generic game-session no-save branch, and client browser-speech path. Preserve the flag through both Debate match-creation paths, branch at the Debate skill boundary before any model call, serialize the flag into every game snapshot, and add one setup toggle that forwards it.

**Tech Stack:** React, TypeScript, Node.js, WebSocket, existing workflow engine, Node test runner, pnpm.

## Global Constraints

- Preserve unrelated dirty-worktree changes. Stage only the exact files listed in each task.
- Do not add dependencies, a second Debate page, a second workflow, or a debug-only agent abstraction.
- Do not modify the generic WebSocket schema, server TTS suppression, or history-save branch; they already accept `debugMode`, skip server TTS, and avoid formal persistence.
- Keep debug mode off by default and force it off for history replay.
- Fixed debug output must still pass the normal speech, judge-result, MVP-target, workflow-event, and completion validation paths.
- Do not change the public API shape, database schema, or shared package types.
- Use `pnpm.cmd` on Windows.
- Isolate workflow test data:

```powershell
$env:DATABASE_PATH = Join-Path $env:TEMP 'consensus-debate-debug-workflow.db'
$env:JSON_DATABASE_PATH = Join-Path $env:TEMP 'consensus-debate-debug-data.json'
```

## Existing Behavior to Reuse

| Concern | Existing implementation | Planned action |
|---|---|---|
| Start payload | `GameSocketStartPayload.debugMode` and `openGameSocket` | Forward the Debate toggle only |
| Session config | `game-socket/session.ts` and `game-socket/service.ts` | No change |
| Formal history | `runSession` skips `saveGameRecord` when `config.debugMode` | No change |
| Server TTS | `resolveEventVoice` returns `null` for debug games | Ensure serialized Debate snapshots expose the flag |
| Browser speech/subtitles | Existing Debate speech queue/playback | No change |
| Fixed speech text | Existing `fallbackFactory` values in `skillRegistry.ts` | Return them before model calls |

---

## Task 1: Preserve `debugMode` through the Debate workflow

**Files:**

- Modify: `packages/server/modules/debate-runner.ts`
- Modify: `packages/server/modules/debate/workflow.ts`
- Modify: `packages/server/modules/debate/helpers.ts`
- Modify: `packages/server/modules/debate/utils.ts`
- Test: `tests/workflow/debateSpeechEvents.test.ts`

**Interfaces:**

- `DebateConfig` already allows extra runtime keys; add an explicit optional `debugMode?: boolean`.
- `SerializedGame` gains an internal optional `debugMode?: boolean` field because the legacy serializer remains unchanged; workflow snapshots always emit a concrete boolean.
- No public route, WebSocket schema, database, or shared-type change.

- [ ] **Step 1: Add a failing serialization test**

Extend the first existing speech-event test by enabling debug mode on its match:

```ts
const match = createMatch({ debugMode: true });

const payload = events?.[0].payload as Record<string, unknown>;
assert.equal((payload.game as Record<string, unknown>).debugMode, true);
```

Adjust the local `createMatch` helper to accept a config argument without introducing a new fixture module:

```ts
function createMatch(config: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: 'm-debate',
    config,
    state: {},
    status: 'running',
    createdAt: 'now',
  };
}
```

- [ ] **Step 2: Run the test and confirm the expected failure**

```powershell
pnpm.cmd run test:workflow
```

Expected: the new assertion receives `undefined` because `serializeDebateState` does not yet expose `debugMode`.

- [ ] **Step 3: Make the internal types explicit**

In `packages/server/modules/debate/utils.ts`:

```ts
interface DebateConfig {
  players: Array<{ id: number; [key: string]: unknown }>;
  topic?: DebateTopic;
  debateTeams?: DebateTeamsConfig;
  host?: DebateHost;
  debugMode?: boolean;
  [key: string]: unknown;
}
```

Add the serialized field alongside the other top-level game metadata:

```ts
interface SerializedGame {
  id: string;
  gameType: string;
  type: string;
  mode: string;
  debugMode?: boolean;
  topic: DebateTopic;
  event: Record<string, unknown>;
  host: Record<string, unknown>;
  players: Array<Record<string, unknown>>;
  phases: DebatePhase[];
  rounds: Array<Record<string, unknown>>;
  mvp: Record<string, unknown> | null;
  winner: string | null;
  winReason: string;
  fallbackAudit: unknown[];
  shareReport: Record<string, unknown>;
  createdAt: string;
}
```

- [ ] **Step 4: Preserve the flag in both match-creation paths**

In `runDebateViaEngine`:

```ts
const runtimeConfig = {
  topic: config.topic,
  debateTeams: config.debateTeams,
  selectedPlayerIds:
    (config as Record<string, unknown>).selectedPlayerIds ||
    (config.players || []).map((player) => player.id),
  debugMode: Boolean(config.debugMode),
};
```

Apply the same single field in `createDebateWorkflowMatch`:

```ts
const runtimeConfig = {
  topic: config.topic,
  debateTeams: config.debateTeams,
  selectedPlayerIds:
    (config as Record<string, unknown>).selectedPlayerIds ||
    (config.players || []).map((player) => player.id),
  debugMode: Boolean(config.debugMode),
};
```

Both paths are required: the game socket uses the engine runner, while workflow tests and internal callers can use `runDebateWorkflow` directly.

- [ ] **Step 5: Restore the flag when constructing runtime state**

In `resolveRuntimeConfig`:

```ts
return {
  ...base,
  mode: 'real',
  topic: matchConfig.topic as Topic,
  debateTeams: matchConfig.debateTeams as DebateConfig['debateTeams'],
  selectedPlayerIds: [...selectedIds],
  debugMode: Boolean(matchConfig.debugMode),
  host: base.host || {},
  players,
};
```

- [ ] **Step 6: Include the flag in all serialized snapshots**

In `serializeDebateState`:

```diff
     mode: 'real',
+    debugMode: Boolean(match.config.debugMode),
     topic: state.topic,
```

This is the only media-path change needed: existing server media handling will now see `event.game.debugMode === true` and leave speech to the browser.

- [ ] **Step 7: Run the focused checks**

```powershell
pnpm.cmd run test:workflow
pnpm.cmd --filter @ai-presenter/server run check
```

Expected: the new serialization test passes and the server typecheck is clean.

- [ ] **Step 8: Commit only Task 1 files**

```powershell
git add packages/server/modules/debate-runner.ts packages/server/modules/debate/workflow.ts packages/server/modules/debate/helpers.ts packages/server/modules/debate/utils.ts tests/workflow/debateSpeechEvents.test.ts
git commit -m "feat(server): preserve debate debug mode"
```

---

## Task 2: Return deterministic Debate results without model calls

**Files:**

- Modify: `packages/server/modules/debate/skillRegistry.ts`
- Test: `tests/workflow/debateSpeechEvents.test.ts`

**Interfaces:**

- Keep the existing `SkillContext.config`.
- Keep existing speech fallback strings.
- Judge debug result must satisfy the current winner validator.
- MVP debug result must target a current contestant.

- [ ] **Step 1: Add one failing workflow-level debug test**

Add imports:

```ts
import { getAiConfig } from '../../packages/server/config';
import { runDebateWorkflow } from '../../packages/server/modules/debate/workflow';
```

Add one test that executes the complete normal workflow:

```ts
test('debate debug mode completes without model credentials', async () => {
  const base = getAiConfig();
  assert.ok(base.players.length >= 12, 'debug workflow requires the configured 12 debate seats');

  const players = base.players.slice(0, 12).map((player) => ({
    ...player,
    provider: '__debug__',
    model: '__debug__',
  }));
  const proIds = players.slice(0, 4).map((player) => player.id);
  const conIds = players.slice(4, 8).map((player) => player.id);
  const judgeIds = players.slice(8, 12).map((player) => player.id);

  const game = await runDebateWorkflow({
    ...base,
    players,
    debugMode: true,
    topic: {
      title: '调试模式是否应复用正式流程',
      proPosition: '应该复用',
      conPosition: '不应复用',
    },
    debateTeams: {
      proIds,
      conIds,
      judgeIds,
      captainEnabled: true,
      proCaptainId: proIds[0],
      conCaptainId: conIds[0],
    },
  });

  assert.equal(game.debugMode, true);
  assert.equal(game.winner, 'pro');
  assert.ok(game.phases.length > 0);
  assert.ok(game.phases.every((phase) =>
    phase.speeches.every((speech) => speech.text.trim().length > 0)
  ));
  assert.ok(game.mvp);
});
```

The test must use the normal `runDebateWorkflow` loop. Do not mock the workflow engine or bypass result validation.

- [ ] **Step 2: Run the test and confirm the expected failure**

```powershell
pnpm.cmd run test:workflow
```

Expected: the workflow cannot produce the required result because the current skill path attempts to use the deliberately nonexistent `__debug__` model.

- [ ] **Step 3: Short-circuit text skills at the shared Debate skill boundary**

Pass `config` through the existing `textSkill` executor:

```ts
execute: ({ actor, phase, config }: SkillContext) =>
  askDebateText(
    actor,
    phase,
    instruction,
    fallbackFactory(actor),
    action,
    Boolean(config.debugMode),
  ),
```

Extend the existing helper by one boolean and return its existing fallback before building a prompt or calling any agent method:

```diff
 async function askDebateText(
   actor: DebatePlayer,
   phase: DebatePhase,
   instruction: string,
   fallback: string,
   skillId: string,
+  debugMode = false,
 ): Promise<string | { content: string; thinking: string }> {
+  if (debugMode) return fallback;
   const limit = phase.limit || 200;
```

Pass the same boolean from the crossfire skill, which calls `askDebateText` directly:

```ts
execute: ({ actor, phase, target, config }: SkillContext) => askDebateText(
  actor,
  { ...phase, limit: PHASE_LIMITS.crossfire_question },
  `请向${getDebateRoleName(target || null)}只问一个具体、可回答的问题，瞄准其前提、证据或因果漏洞。`,
  '请问对方如何解释本方标准下的关键风险？',
  'crossfire_question',
  Boolean(config.debugMode),
),

execute: ({ actor, phase, target, config }: SkillContext) => askDebateText(
  actor,
  phase,
  `第一句直接回答${getDebateRoleName(target || null)}刚才的问题，再指出其前提漏洞并反击一句。`,
  '这个问题忽略了前提差异，我方标准更能处理边界情况。',
  'crossfire_answer',
  Boolean(config.debugMode),
),
```

Use the exact current instruction and fallback variables; do not rewrite the user's existing prompts.

- [ ] **Step 4: Return a valid deterministic judge result**

Accept `config` in the existing judge executor and insert this branch before the existing `askJson` assignment:

```diff
-      async execute({ actor, state }: SkillContext) {
+      async execute({ actor, state, config }: SkillContext) {
+        if (config.debugMode) {
+          return {
+            winner: 'pro',
+            text: `${actor.name}调试判定：正方胜。`,
+          };
+        }
         const parsed = await (actor as unknown as {
```

Keep the current `askJson` assignment and normalization after this branch. The debug result deliberately uses an allowed winner value and non-empty text so the normal validator remains active.

- [ ] **Step 5: Return a legal deterministic MVP vote**

Build the existing contestant list first, then branch before `askJson`:

```diff
-      async execute({ actor, contestants, fallbackAudit }: SkillContext) {
-        const fallback = (contestants as DebatePlayer[])[Math.floor(Math.random() * (contestants as DebatePlayer[]).length)];
+      async execute({ actor, contestants, fallbackAudit, config }: SkillContext) {
         const contestantList = (contestants as DebatePlayer[]);
+        if (!contestantList.length) {
+          throw new Error('Debate MVP contestants are required');
+        }
+        if (config.debugMode) {
+          return {
+            voterId: actor.id,
+            target: contestantList[0].id,
+          };
+        }
+        const fallback = contestantList[Math.floor(Math.random() * contestantList.length)];
         const parsed = await (actor as unknown as {
```

Keep the current `askJson`, seat-label matching, audit, and fallback return after this insertion. The existing result shape is exactly `{ voterId, target }`, and the debug `target` must come from `contestantList`.

- [ ] **Step 6: Run the focused checks**

```powershell
pnpm.cmd run test:workflow
pnpm.cmd --filter @ai-presenter/server run check
```

Expected: the full Debate debug workflow completes with fixed speeches, a valid judge winner, and a legal MVP result without requiring a model credential.

- [ ] **Step 7: Commit only Task 2 files**

```powershell
git add packages/server/modules/debate/skillRegistry.ts tests/workflow/debateSpeechEvents.test.ts
git commit -m "feat(server): add deterministic debate debug output"
```

---

## Task 3: Add the Debate setup toggle and forward the flag

**Files:**

- Modify: `packages/client/src/features/debate/DebateGame/index.tsx`
- Modify: `packages/client/src/features/debate/components/DebateTopicDialog/index.tsx`
- Modify: `packages/client/src/features/debate/components/DebateDialogFooter/index.tsx`

**Interfaces:**

- `DebateDialogFooter` gains `debugMode` and `onDebugModeChange`.
- `DebateTopicDialog` gains the same two props and adds `debugMode` to its `onStart` options.
- `DebateGame.startGame` forwards `debugMode` through the existing `startSession`.
- No new CSS file or style selector.

- [ ] **Step 1: Add the typed child-component contract and switch**

In `DebateDialogFooter` props:

```ts
debugMode: boolean;
onDebugModeChange: (enabled: boolean) => void;
```

Reuse the existing `.dialog-switch` markup inside `.debate-topic-switches`:

```tsx
<button
  type="button"
  className={classNames('dialog-switch', debugMode && 'active')}
  onClick={() => onDebugModeChange(!debugMode)}
  aria-pressed={debugMode}
  title="使用固定发言与浏览器语音跑完整流程"
>
  <span className="switch-track"><i /></span>
  <strong>{debugMode ? '调试开启' : '调试关闭'}</strong>
</button>
```

Do not add CSS: the footer already supports wrapped switches and active state.

- [ ] **Step 2: Thread the typed props through `DebateTopicDialog`**

Extend its props:

```ts
debugMode: boolean;
onDebugModeChange: (enabled: boolean) => void;
onStart: (
  topic: DebateTopic,
  teams: DebateTeamDraft,
  options: { hostId: number | null; debugMode: boolean },
) => void;
```

Pass both values to `DebateDialogFooter`, and include the flag in the existing start callback:

```tsx
onStart={() =>
  onStart(effectiveTopic, normalizedTeams, {
    hostId,
    debugMode,
  })
}
```

- [ ] **Step 3: Run the client typecheck and confirm the expected failure**

```powershell
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: `DebateGame` has not yet supplied the newly required dialog props or accepted the new start option.

- [ ] **Step 4: Add the page-level state and start payload**

In `DebateGame`:

```ts
const [debugMode, setDebugMode] = useState(false);
```

Extend the existing options type:

```ts
options: {
  replayGameId?: string;
  hostId?: number | null;
  debugMode?: boolean;
} = {},
```

Force replay to remain a formal replay rather than a debug game:

```ts
const nextDebugMode = options.replayGameId
  ? false
  : Boolean(options.debugMode ?? debugMode);

startSession({
  topic: nextTopic as unknown as Record<string, unknown>,
  hostId: hostId || undefined,
  debateTeams: shouldSendTeams
    ? (nextTeams as unknown as Record<string, unknown>)
    : null,
  replayGameId: options.replayGameId || '',
  debugMode: nextDebugMode
});
```

Pass state to the setup dialog:

```tsx
<DebateTopicDialog
  debugMode={debugMode}
  onDebugModeChange={setDebugMode}
  onStart={(topic, teams, opts) => startGame(topic, teams, opts)}
/>
```

- [ ] **Step 5: Run the client check**

```powershell
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: the client typecheck passes.

- [ ] **Step 6: Commit only Task 3 files**

```powershell
git add packages/client/src/features/debate/DebateGame/index.tsx packages/client/src/features/debate/components/DebateTopicDialog/index.tsx packages/client/src/features/debate/components/DebateDialogFooter/index.tsx
git commit -m "feat(client): add debate debug toggle"
```

---

## Task 4: Document behavior and verify the finished change

**Files:**

- Modify: `docs/project-client.md`
- Modify: `docs/project-workflow.md`

**Interfaces:**

- API: unchanged.
- Database: unchanged.
- Shared types: unchanged.
- Runtime behavior: Debate debug sessions use fixed local results, browser speech/subtitles, the full normal workflow, and no formal history save.

- [ ] **Step 1: Update the client documentation**

Add a compact Debate setup note to `docs/project-client.md`:

```md
- 辩论赛开局弹窗提供“调试模式”开关。开启后仍通过现有 WebSocket `start`
  消息发送 `debugMode: true`；回放入口强制关闭调试模式。
- 调试模式沿用正式事件队列、字幕和浏览器语音，不新增独立页面或播放链路。
```

- [ ] **Step 2: Update the workflow documentation**

Add the Debate-specific rule to `docs/project-workflow.md`:

```md
### 辩论赛调试模式

- `debugMode` 会在 GameEngine 和直接 workflow 两条创建路径中保留。
- 辩论技能层在调用模型前返回固定发言、合法裁判结果和合法 MVP 目标，
  但仍执行正式阶段、事件、校验和结束流程。
- 序列化快照包含 `debugMode: true`，因此通用媒体层不生成服务端 TTS；
  客户端继续使用浏览器语音和字幕。
- 通用 game-socket 保存逻辑已对调试对局跳过正式历史写入。
```

- [ ] **Step 3: Run the existing generic debug checks**

The generic start-payload and session parsing remain unchanged. Re-run their current test file:

```powershell
node --preserve-symlinks --preserve-symlinks-main ./tests/unit/runUnitTests.cjs gameSocketSession.test.ts
```

Expected: existing `debugMode` parsing coverage passes. Do not add a second persistence helper solely for testing; the unchanged `runSession` no-save guard remains the single source of truth.

- [ ] **Step 4: Run final verification**

```powershell
pnpm.cmd run test:workflow
pnpm.cmd --filter @ai-presenter/server run check
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd run check
git diff --check
```

Expected:

- The normal Debate workflow completes in debug mode without model credentials.
- Every emitted Debate snapshot exposes `debugMode: true`.
- Client and server checks pass.
- No whitespace errors are introduced.
- No changes exist in game-socket persistence, database schema, shared types, or package dependencies.

- [ ] **Step 5: Manually smoke the user-visible flow**

1. Open Debate setup.
2. Enable **调试开启**.
3. Start a game with valid teams.
4. Confirm opening, crossfire, closing, judge, MVP, and completion stages appear in normal order.
5. Confirm subtitles and browser speech play.
6. Confirm the network start message includes `debugMode: true`.
7. Confirm the completed debug game does not appear in formal history.
8. Start a normal game with the switch off and confirm the normal model path is unchanged.

- [ ] **Step 6: Commit only the documentation**

```powershell
git add docs/project-client.md docs/project-workflow.md
git commit -m "docs: document debate debug mode"
```

## Completion Report

Report:

- Added files: none during implementation.
- Modified files: the exact server, client, test, and documentation files listed above.
- Deleted files: none.
- Frontend: one reused setup switch and one forwarded boolean.
- Backend: preserve one boolean, return existing fixed text before model calls, serialize the boolean.
- API/database/shared types: unchanged.
- Tests: one workflow debug path plus existing generic debug parsing checks.
- Deferred work: no admin control, no configurable debug scripts, no debug history browser, and no new styling; add only if a separate product requirement appears.
