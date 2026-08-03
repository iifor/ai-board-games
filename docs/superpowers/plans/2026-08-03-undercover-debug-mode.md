# Undercover Debug Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete Undercover V2 debug mode with deterministic AI/TTS bypass, key-stage workflow breakpoints controlled from the authenticated admin console, and `1× / 2× / 4×` browser playback speed.

**Architecture:** Keep the existing public `debugMode: boolean` start flag and add no new database tables or cross-game debug framework. Undercover handlers produce deterministic, schema-validated results in debug matches; the workflow engine gates only steps explicitly marked `config.debugBreakpoint`, while one authenticated admin action endpoint resolves, skips, or disables those gates for the current match.

**Tech Stack:** TypeScript, React 18, Express, Zod, WebSocket, SQLite workflow repositories, browser SpeechSynthesis, Node test runners.

## Global Constraints

- C-side debug controls exist only on `/game/v2/undercover`; `/games/undercover` remains unchanged.
- `debugMode: boolean` remains the only public start flag; do not add `debugConfig`.
- Normal matches must not enter deterministic AI, breakpoint, speed, or debug-control branches.
- The server remains authoritative for legal votes, workflow steps, results, authorization, and secret projection.
- Normal breakpoints must not reuse `paused_debug`; that status remains a failure/diagnostic terminal state.
- Debug matches do not call real LLMs or cloud TTS, do not save formal game history, and do not create formal Undercover traces.
- Debug speech still passes `undercoverSpeechSchema` and `validatePublicSpeech`; debug votes still pass `undercoverVoteSchema` and legal-target checks.
- Do not add a database migration, dependency, new page, cross-game DSL, or C-side workflow mutation API.
- Use `pnpm.cmd` on Windows.

---

## File Map

### Create

- `packages/server/modules/undercover/debug.ts`
  - Deterministic debug speech and vote generation only.
- `packages/server/modules/workflow-engine/debugBreakpoint.ts`
  - Breakpoint lookup, gate decision, and admin-control validation only.

### Modify

- `packages/server/modules/undercover/handlers.ts`
  - Select deterministic task results in debug matches; emit the debug-ready public state.
- `packages/server/modules/game-socket/service.ts`
  - Preserve the existing `debugMode` marker on every live/completed event so the shared media layer bypasses cloud TTS.
- `packages/server/modules/undercover/workflow.ts`
  - Mark key steps as breakpoints and wait for external debug control without busy-looping.
- `packages/server/modules/workflow-engine/tick.ts`
  - Apply the breakpoint gate before marked handlers execute.
- `packages/server/modules/workflow-engine/service.ts`
  - Expose one validated Undercover debug-control service.
- `packages/server/modules/workflow-engine/controller.ts`
  - Parse the admin debug-control action and return the unified response.
- `packages/server/modules/workflow-engine/routes.ts`
  - Bind the authenticated admin route.
- `packages/admin/src/services/adminApi.ts`
  - Add the typed debug-control request.
- `packages/admin/src/pages/WorkflowDebugConsole/index.tsx`
  - Add continue, skip, and continuous controls for eligible Undercover debug matches.
- `packages/client/src/types/speech.ts`
  - Add an optional playback-rate multiplier to queued browser speech.
- `packages/client/src/hooks/speech/browserSpeech.ts`
  - Apply the multiplier without changing normal voice profiles.
- `packages/client/src/features/undercover/types.ts`
  - Add the debug start option and playback-rate type.
- `packages/client/src/features/undercover/hooks/useUndercoverGame.ts`
  - Send debug mode, derive Match ID from real events, and scale ACK delay.
- `packages/client/src/features/undercover/UndercoverGame/index.tsx`
  - Own the V2-only debug toggle and render the compact debug panel.
- `packages/client/src/features/undercover/UndercoverGame/index.css`
  - Style the debug toggle/panel without overlapping the 16:9 speaker strip or lower-right dock.
- `tests/unit/undercoverGameRunner.test.ts`
  - Cover deterministic generation and real-agent bypass.
- `tests/unit/gameSocketSession.test.ts`
  - Prove debug runtime/completed events retain the marker consumed by the existing TTS bypass.
- `tests/workflow/undercoverWorkflow.test.ts`
  - Cover breakpoints, control actions, persistence boundaries, and normal-match regression.
- `tests/unit/undercoverClient.test.ts`
  - Cover the V2-only UI/start contract and classic isolation.
- `tests/unit/gameSocketClientSession.test.ts`
  - Cover playback-rate propagation and ACK delay.
- `docs/project-workflow.md`
  - Document deterministic tasks, breakpoint semantics, control API, and `paused_debug` boundary.
- `docs/project-client.md`
  - Document the V2 toggle, Match ID, browser voice, and speed behavior.
- `docs/project-admin.md`
  - Document authenticated debug controls and rejection rules.

---

### Task 1: Deterministic Undercover AI/TTS bypass

**Files:**
- Create: `packages/server/modules/undercover/debug.ts`
- Modify: `packages/server/modules/undercover/handlers.ts`
- Modify: `packages/server/modules/game-socket/service.ts`
- Test: `tests/unit/undercoverGameRunner.test.ts`
- Test: `tests/unit/gameSocketSession.test.ts`

**Interfaces:**
- Consumes: `UndercoverState`, `validatePublicSpeech`, `undercoverSpeechSchema`, `undercoverVoteSchema`, and the handler-provided `legalIds`.
- Produces:

```ts
function buildUndercoverDebugSpeech(
  state: UndercoverState,
  actorId: number,
): { speech: string };

function buildUndercoverDebugVote(
  state: UndercoverState,
  actorId: number,
  legalIds: number[],
  runoff: boolean,
): { targetId: number; reason: string };
```

- [ ] **Step 1: Write deterministic-generator tests**

Add focused assertions to `tests/unit/undercoverGameRunner.test.ts`:

```ts
test('undercover debug generation is deterministic and legal', () => {
  const state = createInitialUndercoverState(players, {
    seed: 42,
    wordPair: { civilian: '咖啡', undercover: '奶茶' },
    undercoverPlayerId: 2,
  });
  state.round = 2;

  const first = buildUndercoverDebugSpeech(state, 1);
  const second = buildUndercoverDebugSpeech(state, 1);
  assert.deepEqual(second, first);
  assert.equal(validatePublicSpeech(first.speech, state.wordPair).ok, true);

  const vote = buildUndercoverDebugVote(state, 1, [2, 3, 4], false);
  assert.equal([2, 3, 4].includes(vote.targetId), true);
});
```

Add a handler-path test that creates a debug match with players lacking usable model credentials and asserts the first speech task succeeds without calling `BasePlayerAgent.prototype.askJson`.

Add one session test that emits a runtime event and a completed event in debug mode, then asserts both outgoing payloads retain `debugMode: true`. This is the marker already consumed by `resolveEventVoice`; the test is the no-cloud-TTS regression proof.

- [ ] **Step 2: Run the unit suite and confirm RED**

Run:

```powershell
pnpm.cmd run test:unit
```

Expected: FAIL because `debug.ts` and the deterministic exports do not exist, or because the handler still reaches `askJson`.

- [ ] **Step 3: Implement the deterministic generator**

Create `packages/server/modules/undercover/debug.ts` with a small fixed template list and seeded selection:

```ts
const DEBUG_SPEECH_TEMPLATES = [
  '它在日常生活里很常见，但不同场景下体验差异很大',
  '多数人接触过它，不过使用习惯往往不完全相同',
  '它通常容易辨认，但只看一个特点也可能判断错误',
] as const;

function buildUndercoverDebugSpeech(state: UndercoverState, actorId: number) {
  const index = seededIndex(
    state.seed,
    DEBUG_SPEECH_TEMPLATES.length,
    Math.imul(state.round, 31) ^ Math.imul(actorId, 131),
  );
  const candidate = DEBUG_SPEECH_TEMPLATES[index];
  const validated = validatePublicSpeech(candidate, state.wordPair);
  return { speech: validated.ok ? validated.text : '这个事物在生活中并不少见' };
}

function buildUndercoverDebugVote(
  state: UndercoverState,
  actorId: number,
  legalIds: number[],
  runoff: boolean,
) {
  if (!legalIds.length) throw new Error(`Undercover debug voter ${actorId} has no legal targets`);
  const index = seededIndex(
    state.seed,
    legalIds.length,
    Math.imul(state.round, 31) ^ Math.imul(actorId, 131) ^ (runoff ? 1 : 0),
  );
  return { targetId: legalIds[index], reason: '' };
}
```

Validate returned objects with the existing Zod schemas before exporting.
The existing vote handler already filters voters with no legal targets before creating tasks; preserve that skip behavior rather than creating an invalid debug vote.

- [ ] **Step 4: Branch the existing AI task handlers at the server trust boundary**

In each `runAiTask`, read debug mode from the persisted match config:

```ts
const debugMode = (match as { config?: { debugMode?: boolean } }).config?.debugMode === true;
if (debugMode) {
  return aiResult(
    task.action as string,
    buildUndercoverDebugSpeech(current, actorId),
  );
}
```

For votes, pass the already validated `legalIds` and `context.runoff === true` to `buildUndercoverDebugVote`. Do not construct `BasePlayerAgent` in the debug branch and do not catch debug validation failures by calling the real model.

- [ ] **Step 5: Preserve the existing TTS bypass marker across the socket pipeline**

In `runSession`, normalize runner and completed events through one small helper:

```ts
function withSessionDebugMode(
  event: Record<string, unknown>,
  debugMode: boolean,
): Record<string, unknown> {
  return debugMode ? { ...event, debugMode: true } : event;
}
```

Apply it before runtime events enter `liveSource`/`playbackSourceEvents`, and before `completedEvent` is prepared. Do not add a second TTS option: `media.ts` already returns no server voice when the event or `event.game` carries `debugMode`.

- [ ] **Step 6: Run unit and server checks**

Run:

```powershell
pnpm.cmd run test:unit
pnpm.cmd run check:server
```

Expected: all unit tests and the server type check pass.

- [ ] **Step 7: Commit Task 1**

```powershell
git add packages/server/modules/undercover/debug.ts packages/server/modules/undercover/handlers.ts packages/server/modules/game-socket/service.ts tests/unit/undercoverGameRunner.test.ts tests/unit/gameSocketSession.test.ts
git commit -m "feat(server): add deterministic undercover debug tasks"
```

---

### Task 2: Key-stage breakpoint gate and authenticated control API

**Files:**
- Create: `packages/server/modules/workflow-engine/debugBreakpoint.ts`
- Modify: `packages/server/modules/undercover/workflow.ts`
- Modify: `packages/server/modules/undercover/handlers.ts`
- Modify: `packages/server/modules/workflow-engine/tick.ts`
- Modify: `packages/server/modules/workflow-engine/service.ts`
- Modify: `packages/server/modules/workflow-engine/controller.ts`
- Modify: `packages/server/modules/workflow-engine/routes.ts`
- Test: `tests/workflow/undercoverWorkflow.test.ts`

**Interfaces:**
- Consumes: existing `workflow_interrupts`, match `config_json`, workflow step config, repository transaction helpers, and `wakeTick`.
- Produces:

```ts
type UndercoverDebugAction = 'continue' | 'skip' | 'continuous';

type DebugBreakpointDecision =
  | { kind: 'run' }
  | { kind: 'pause'; interruptId: string }
  | { kind: 'skip'; interruptId: string };

function evaluateDebugBreakpoint(
  match: Match,
  step: WorkflowStep,
): DebugBreakpointDecision;

function controlUndercoverDebugMatch(
  matchId: string,
  action: UndercoverDebugAction,
): Match;
```

Admin route:

```http
POST /api/admin/workflow/matches/:matchId/debug-control
Content-Type: application/json

{ "action": "continue" | "skip" | "continuous" }
```

- [ ] **Step 1: Add failing workflow tests for the breakpoint lifecycle**

Extend `tests/workflow/undercoverWorkflow.test.ts` with a debug match using fixed players/seed:

```ts
test('undercover debug match pauses once at each marked step', async () => {
  const match = createUndercoverWorkflowMatch({
    players,
    debugMode: true,
    debug: { seed: 42, civilianWord: '咖啡', undercoverWord: '奶茶', undercoverPlayerId: 2 },
  });

  const ready = getDebugState(match.id)!;
  const pending = ready.interrupts.filter((item) =>
    item.interruptType === 'undercover_debug_breakpoint' && item.status === 'pending'
  );
  assert.equal(pending.length, 1);
  assert.equal(pending[0].stepId, 'round_1_start');

  controlUndercoverDebugMatch(match.id, 'continue');
  const advanced = getDebugState(match.id)!;
  assert.equal(advanced.interrupts.filter((item) => item.stepId === 'round_1_start').length, 1);
});
```

Add separate tests for:

- `skip` records one `step_skipped` system event and moves to the next step.
- `continuous` sets `debugRunMode: 'continuous'` and reaches `completed`.
- normal matches never create `undercover_debug_breakpoint`.
- non-Undercover, non-debug, missing-match, and repeated action requests throw explicit errors.
- `paused_debug` is not produced by normal breakpoint flow.
- a debug-ready public outbox event exposes the real `game.id` without secret fields.

- [ ] **Step 2: Run workflow tests and confirm RED**

Run:

```powershell
pnpm.cmd run test:workflow
```

Expected: FAIL because the breakpoint module and debug-control service do not exist.

- [ ] **Step 3: Mark Undercover key steps**

In `packages/server/modules/undercover/workflow.ts`, add `debugBreakpoint: true` to:

```ts
round_start
speech
vote
runoff
resolve
result
```

Do not mark `setup`. Keep existing `nextStepId` behavior so an unused runoff step is never reached.

- [ ] **Step 4: Emit one debug-ready public event from setup**

In the setup handler, only when persisted `match.config.debugMode === true`, return:

```ts
publicEvent(
  match.id as string,
  step.id,
  'undercover-debug-ready',
  next,
  '调试对局已就绪',
  { matchId: match.id },
)
```

The event must use `toUndercoverPublicState` through the existing `publicEvent` path; do not include `wordPair`, `playerWords`, or `undercoverPlayerId`.

- [ ] **Step 5: Implement the breakpoint decision module**

Create `debugBreakpoint.ts` so it:

1. Returns `run` unless `gameType === 'undercover'`, `debugMode === true`, `debugRunMode !== 'continuous'`, and `step.config.debugBreakpoint === true`.
2. Finds an existing `undercover_debug_breakpoint` for the current `step.id`.
3. Creates one pending interrupt if none exists and returns `pause`.
4. Returns `pause` for pending, `skip` for skipped, and `run` for resolved.
5. Never creates a second interrupt for the same match/step.

Keep repository access in this module; do not add a database table or raw SQL outside the repository layer.

- [ ] **Step 6: Gate marked steps in `tickMatch`**

After the existing condition check and before `getStepHandler`, apply:

```ts
const breakpoint = evaluateDebugBreakpoint(match, step);
if (breakpoint.kind === 'pause') {
  status = MATCH_STATUS.WAITING;
  break;
}
if (breakpoint.kind === 'skip') {
  repo.commitWorkflowChange({
    matchId,
    events: [{
      type: 'step_skipped',
      stepId: step.id,
      payload: { reason: 'undercover_debug_skip' },
      visibility: 'system',
      idempotencyKey: `${matchId}:${step.id}:debug-skipped`,
    }],
  });
  currentStepIndex += 1;
  stepsProcessed += 1;
  continue;
}
```

Do not add `WAITING` to terminal statuses and do not change `paused_debug`.

- [ ] **Step 7: Make the Undercover runtime wait for admin control**

When `drainAiTasks` returns no work and the match is a debug match waiting on a pending debug breakpoint, wait for a bounded polling interval before checking persisted match version/status again:

```ts
await new Promise<void>((resolve) => setTimeout(resolve, 100));
```

Use a named helper with a 100 ms constant, and exit on completed, failed, `paused_debug`, or session error. Do not spin synchronously and do not auto-resolve a breakpoint after timeout.

- [ ] **Step 8: Add one service action and one route**

Implement `controlUndercoverDebugMatch(matchId, action)` with an explicit action allowlist:

```ts
const UNDERCOVER_DEBUG_ACTIONS = new Set(['continue', 'skip', 'continuous']);
```

Validate the match and current pending breakpoint before mutation. For:

- `continue`: resolve the interrupt as `resolved`, then `wakeTick(matchId)`.
- `skip`: resolve it as `skipped`, then `wakeTick(matchId)`.
- `continuous`: update `config_json.debugRunMode` to `continuous`, resolve the pending interrupt, then `wakeTick(matchId)`.

Add controller parsing and:

```ts
router.post(
  '/workflow/matches/:matchId/debug-control',
  controller.controlUndercoverDebug,
);
```

The workflow router is already mounted beneath authenticated `/api/admin`; do not expose a TOC route.

- [ ] **Step 9: Run workflow, server, and whitespace checks**

Run:

```powershell
pnpm.cmd run test:workflow
pnpm.cmd run check:server
git diff --check
```

Expected: all checks pass and breakpoint tests prove the normal-match path is unchanged.

- [ ] **Step 10: Commit Task 2**

```powershell
git add packages/server/modules/workflow-engine/debugBreakpoint.ts packages/server/modules/workflow-engine/tick.ts packages/server/modules/workflow-engine/service.ts packages/server/modules/workflow-engine/controller.ts packages/server/modules/workflow-engine/routes.ts packages/server/modules/undercover/workflow.ts packages/server/modules/undercover/handlers.ts tests/workflow/undercoverWorkflow.test.ts
git commit -m "feat(server): add undercover workflow debug controls"
```

---

### Task 3: Admin debug controls

**Files:**
- Modify: `packages/admin/src/services/adminApi.ts`
- Modify: `packages/admin/src/pages/WorkflowDebugConsole/index.tsx`
- Test: `tests/unit/undercoverClient.test.ts`

**Interfaces:**
- Consumes: `POST /api/admin/workflow/matches/:matchId/debug-control` from Task 2 and the existing debug-state response.
- Produces:

```ts
export type UndercoverDebugAction = 'continue' | 'skip' | 'continuous';

export function controlUndercoverDebugMatch(
  matchId: string,
  action: UndercoverDebugAction,
): Promise<Record<string, unknown>>;
```

- [ ] **Step 1: Add failing admin source-contract assertions**

Add focused assertions to `tests/unit/undercoverClient.test.ts` that:

- `adminApi.ts` posts to the exact authenticated admin path.
- only `continue`, `skip`, and `continuous` are represented by the exported union.
- Workflow Debug Console renders the three Chinese labels only when:

```ts
match.gameType === 'undercover' && match.config?.debugMode === true
```

- [ ] **Step 2: Run unit tests and confirm RED**

Run:

```powershell
pnpm.cmd run test:unit
```

Expected: FAIL because the admin request and controls do not exist.

- [ ] **Step 3: Add the typed admin service function**

In `adminApi.ts`:

```ts
export type UndercoverDebugAction = 'continue' | 'skip' | 'continuous';

export function controlUndercoverDebugMatch(
  matchId: string,
  action: UndercoverDebugAction,
) {
  return adminRequest<Record<string, unknown>>(
    `/workflow/matches/${encodeURIComponent(matchId)}/debug-control`,
    {
      method: 'POST',
      body: JSON.stringify({ action }),
    },
  );
}
```

- [ ] **Step 4: Add compact controls to the existing debug card**

Derive:

```ts
const matchConfig = (match?.config || {}) as Record<string, unknown>;
const isUndercoverDebug = match?.gameType === 'undercover' && matchConfig.debugMode === true;
```

When true, render three buttons beside the existing load/tick controls:

```tsx
<Button onClick={() => runAction(() => controlUndercoverDebugMatch(matchId, 'continue'))}>
  继续一步
</Button>
<Button onClick={() => runAction(() => controlUndercoverDebugMatch(matchId, 'skip'))}>
  跳过当前步骤
</Button>
<Button onClick={() => runAction(() => controlUndercoverDebugMatch(matchId, 'continuous'))}>
  连续运行
</Button>
```

Use the existing `runAction` error/success handling and reload path. Do not create a new page or local API wrapper.

- [ ] **Step 5: Run unit, admin type, and admin build checks**

Run:

```powershell
pnpm.cmd run test:unit
pnpm.cmd run check:admin
pnpm.cmd run build:admin
```

Expected: all checks pass.

- [ ] **Step 6: Commit Task 3**

```powershell
git add packages/admin/src/services/adminApi.ts packages/admin/src/pages/WorkflowDebugConsole/index.tsx tests/unit/undercoverClient.test.ts
git commit -m "feat(admin): control undercover debug workflow"
```

---

### Task 4: Undercover V2 debug toggle, Match ID, and playback speed

**Files:**
- Modify: `packages/client/src/types/speech.ts`
- Modify: `packages/client/src/hooks/speech/browserSpeech.ts`
- Modify: `packages/client/src/features/undercover/types.ts`
- Modify: `packages/client/src/features/undercover/hooks/useUndercoverGame.ts`
- Modify: `packages/client/src/features/undercover/UndercoverGame/index.tsx`
- Modify: `packages/client/src/features/undercover/UndercoverGame/index.css`
- Test: `tests/unit/undercoverClient.test.ts`
- Test: `tests/unit/gameSocketClientSession.test.ts`

**Interfaces:**
- Consumes: existing WebSocket `debugMode`, `presentation.speakableText`, `game.id`, and browser speech fallback.
- Produces:

```ts
type UndercoverPlaybackRate = 1 | 2 | 4;

type UndercoverStartOptions =
  | { playerIds: number[]; debugMode?: boolean }
  | { replayGameId: string };

interface QueueItem {
  // existing fields
  playbackRate?: number;
}
```

- [ ] **Step 1: Add failing client tests**

Extend `tests/unit/undercoverClient.test.ts` to assert:

- `buildUndercoverStartOptions(ids, '', true)` returns `{ playerIds: ids, debugMode: true }`.
- replay options never include `debugMode`.
- only the V2 branch renders “调试模式”, “调试中”, Match ID, and the `1× / 2× / 4×` group.
- the classic branch has no debug controls.
- debug mode defaults to `2`.

Extend `tests/unit/gameSocketClientSession.test.ts`:

```ts
test('browser speech multiplies and clamps the debug playback rate', () => {
  const utterance = createBrowserSpeechUtterance(
    { text: '测试', playerId: '1', playbackRate: 2 },
    [],
  )!;
  assert.equal(utterance.rate, normalizeVoiceProfile(getProfileForItem({
    text: '测试',
    playerId: '1',
  })).rate * 2);
});
```

Use a valid bounded expectation if the base profile multiplied by `4` exceeds the browser-supported limit.

- [ ] **Step 2: Run unit tests and confirm RED**

Run:

```powershell
pnpm.cmd run test:unit
```

Expected: FAIL because start options, queue items, and V2 controls do not support debug state.

- [ ] **Step 3: Add playback-rate support without changing normal speech**

Add `playbackRate?: number` to `QueueItem`. In `createBrowserSpeechUtterance`:

```ts
utterance.rate = clampFinite(
  profile.rate * clampFinite(item.playbackRate, 1, 1, 4),
  profile.rate,
  0.1,
  10,
);
```

Import and reuse the existing `clampFinite`; do not add a second clamp helper.

- [ ] **Step 4: Extend Undercover start options and state**

Change:

```ts
buildUndercoverStartOptions(
  playerIds: number[],
  replayGameId: string,
  debugMode = false,
): UndercoverStartOptions
```

Return `debugMode: true` only for a non-replay debug start. Update `useUndercoverGame` params to accept `debugMode` and keep:

```ts
const [playbackRate, setPlaybackRate] = useState<UndercoverPlaybackRate>(2);
```

Derive Match ID only from the real public event state:

```ts
const matchId = view.game?.id || '';
```

Pass `playbackRate` through `getSpeechOptions`, and divide the debug no-speech ACK delay by the selected rate with a minimum of 60 ms. Normal and replay sessions retain current delay behavior.

- [ ] **Step 5: Add the V2-only setup toggle and debug panel**

In `UndercoverGame`, keep `debugMode` local to the V2 setup:

```ts
const [debugMode, setDebugMode] = useState(false);
const controller = useUndercoverGame({
  playerIds,
  replayGameId,
  debugMode: variant === 'v2' && !replayGameId && debugMode,
});
```

Before start, render one accessible switch inside the existing V2 empty state. After start, render a compact top-left panel with:

- `调试中`
- the real Match ID and a native copy button
- a `role="group"` speed selector for `1× / 2× / 4×`

Do not render the panel in classic or replay mode. Use existing Lucide `Bug` and `Copy` icons rather than SVG or CSS-drawn assets.

- [ ] **Step 6: Preserve the 16:9 no-overlap layout**

In `UndercoverGame/index.css`, reserve the upper-left debug panel outside the central poster and lower-third:

```css
.undercover-debug-panel {
  position: fixed;
  z-index: 11;
  top: 16px;
  left: 20px;
  max-width: min(360px, 32vw);
}
```

Keep every button at least `44px` high, retain visible `:focus-visible`, and add a narrow-screen wrap rule. Do not widen the existing lower-right control dock or modify classic selectors.

- [ ] **Step 7: Run client tests, type check, and build**

Run:

```powershell
pnpm.cmd run test:unit
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd run build:client
git diff --check
```

Expected: all checks pass and the existing Undercover V2 overlap assertions remain green.

- [ ] **Step 8: Commit Task 4**

```powershell
git add packages/client/src/types/speech.ts packages/client/src/hooks/speech/browserSpeech.ts packages/client/src/features/undercover/types.ts packages/client/src/features/undercover/hooks/useUndercoverGame.ts packages/client/src/features/undercover/UndercoverGame/index.tsx packages/client/src/features/undercover/UndercoverGame/index.css tests/unit/undercoverClient.test.ts tests/unit/gameSocketClientSession.test.ts
git commit -m "feat(client): add undercover v2 debug controls"
```

---

### Task 5: Documentation and end-to-end acceptance

**Files:**
- Modify: `docs/project-workflow.md`
- Modify: `docs/project-client.md`
- Modify: `docs/project-admin.md`
- Test: `tests/workflow/undercoverWorkflow.test.ts`
- Test: `tests/unit/undercoverClient.test.ts`

**Interfaces:**
- Consumes: completed Tasks 1–4.
- Produces: current project contracts and runtime evidence for the full debug flow.

- [ ] **Step 1: Update workflow documentation**

Document all of the following in `docs/project-workflow.md`:

- `debugMode: true` uses deterministic Undercover task results.
- marked steps pause through `undercover_debug_breakpoint`.
- `continue`, `skip`, and `continuous` semantics.
- `paused_debug` remains a failure terminal state.
- debug matches do not become formal history or formal Undercover traces.

- [ ] **Step 2: Update client and admin documentation**

In `docs/project-client.md`, document:

- V2-only toggle.
- browser voice fallback.
- Match ID source.
- default `2×` and available `1× / 2× / 4×`.
- classic and replay exclusions.

In `docs/project-admin.md`, document:

- authenticated debug-control endpoint.
- three allowed actions.
- rejection of normal, non-Undercover, missing, stale, and repeated operations.

- [ ] **Step 3: Run the complete static verification matrix**

Run:

```powershell
pnpm.cmd run check
pnpm.cmd run build
pnpm.cmd run test:unit
pnpm.cmd run test:workflow
git diff --check
```

Expected: all commands pass on the complete branch result.

- [ ] **Step 4: Run real C/B debug acceptance**

Using the existing in-app browser and an isolated workflow database:

1. Open `/game/v2/undercover`.
2. Select six configured players and enable debug mode.
3. Start without model/TTS provider credentials.
4. Verify `undercover-debug-ready`, real Match ID, first breakpoint, subtitles, and browser voice.
5. Load the Match ID in `#/workflow-debug`.
6. Execute “继续一步” through one speech breakpoint.
7. Execute “跳过当前步骤” and verify one system `step_skipped`.
8. Select `4×` and verify visibly faster browser speech/ACK.
9. Execute “连续运行” and reach the result.
10. Confirm no formal history record, model call, cloud TTS request, secret leak, console error, or console warning.

Capture same-state evidence at `1280×720` for:

- V2 setup with debug toggle.
- paused debug stage with Match ID/speed panel.
- B-side breakpoint controls.
- completed result.

Also open `/games/undercover` and confirm no debug UI regression.

- [ ] **Step 5: Commit Task 5**

```powershell
git add docs/project-workflow.md docs/project-client.md docs/project-admin.md tests/workflow/undercoverWorkflow.test.ts tests/unit/undercoverClient.test.ts
git commit -m "docs: document undercover debug mode"
```

- [ ] **Step 6: Request final whole-branch review**

Review from the design commit through Task 5 for:

- spec compliance,
- authorization and secret-information boundaries,
- deterministic no-LLM/no-cloud-TTS proof,
- breakpoint idempotency and recovery,
- classic/normal-match regression,
- real C/B runtime evidence.

Do not mark the feature complete if any required runtime state is unavailable; report the precise environment blocker instead.
