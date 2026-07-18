# AI Undercover Engine Validation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a complete six-player AI “谁是卧底” game that validates registered third-game execution through the existing workflow, Agent, playback, TTS/ACK, persistence, replay, and Trace pipelines.

**Architecture:** Reuse `GameDefinition` and `GameDefinition.runtime`; do not introduce a parallel plugin abstraction. Keep debate/werewolf legacy runners stable, add a generic registered-runtime fallback for new games, and keep Undercover secrets server-side until the terminal reveal event.

**Tech Stack:** TypeScript, Node.js, React 18, Zod, Express/ws, SQLite-backed workflow-engine, Node `node:test`, pnpm workspace.

## Global Constraints

- Game scope is AI multi-agent, turn-based, language-driven social interaction; do not add generic board/card/economy systems.
- Exactly 6 AI players, 1 undercover, 5 civilians.
- Do not add a database table, REST route, WebSocket message type, rules DSL, word-list admin page, or new dependency.
- Reuse `useGameSocketSession`, PlaybackPipeline, TTS/ACK, saved playback events, and Trace.
- Before game completion, public/audience payloads must contain neither secret word nor `undercoverPlayerId`.
- Keep debate and werewolf behavior unchanged.
- Use `pnpm.cmd`, not `pnpm`, in PowerShell.
- Follow TDD: every non-trivial behavior starts with one focused failing test.

## File Map

**Create — shared**

- `packages/shared/types/undercover.ts`: public Undercover state/event contracts.
- `packages/shared/schemas/undercover.ts`: start, speech, and vote Zod schemas.

**Create — server**

- `packages/server/modules/undercover/types.ts`: secret runtime/workflow state types.
- `packages/server/modules/undercover/rules.ts`: deterministic initialization, vote, tie, elimination, winner, and leak checks.
- `packages/server/modules/undercover/prompts.ts`: secret-scoped system/speech/vote prompts.
- `packages/server/modules/undercover/presentation.ts`: public state and playback event projection.
- `packages/server/modules/undercover/handlers.ts`: workflow step handlers and AI task execution.
- `packages/server/modules/undercover/workflow.ts`: bounded three-round workflow registration.
- `packages/server/modules/undercover/definition.ts`: `undercover@1.0.0` definition and runtime.
- `packages/server/modules/undercover/index.ts`: module exports.
- `packages/server/modules/game-socket/gameRunner.ts`: registered game resolution and legacy runner compatibility.

**Create — client**

- `packages/client/src/features/undercover/types.ts`: feature-local view state.
- `packages/client/src/features/undercover/hooks/useUndercoverGame.ts`: socket/event/playback state controller.
- `packages/client/src/features/undercover/components/UndercoverArena.tsx`: accessible six-seat arena and reveal.
- `packages/client/src/features/undercover/components/UndercoverControls.tsx`: return/start/pause/replay-skip controls.
- `packages/client/src/features/undercover/UndercoverGame/index.tsx`: page composition.
- `packages/client/src/features/undercover/index.ts`: feature export.
- Component-adjacent CSS files only where the corresponding component needs styles.

**Create — tests**

- `tests/unit/undercoverSchemas.test.ts`
- `tests/unit/undercoverRules.test.ts`
- `tests/unit/undercoverVisibility.test.ts`
- `tests/unit/undercoverGameRunner.test.ts`
- `tests/workflow/undercoverWorkflow.test.ts`

**Modify**

- `packages/shared/types/gameTypes.ts`: add `GAME_TYPES.UNDERCOVER`.
- `packages/shared/types/gameEvent.ts`: add the seven Undercover public event names.
- `packages/shared/types/gameEngine.ts`: type session/playback definition metadata.
- `packages/server/modules/engine-registry.ts`: register the Undercover workflow and definition.
- `packages/server/modules/debate/definition.ts`: preserve debate session/playback values in typed metadata.
- `packages/server/modules/werewolf/definition.ts`: preserve werewolf session/playback values in typed metadata.
- `packages/server/modules/game-socket/service.ts`: delegate game resolution/runner metadata and use playback for registered games.
- `packages/client/src/App.tsx`: render the Undercover feature.
- `packages/client/src/pages/GameSelectPage/index.tsx`: add the third game and exact-six player rule.
- `packages/client/src/pages/GameSelectPage/index.css`: third-card tone/layout only.
- `packages/client/src/types/game.ts`: accept Undercover public state fields without `any`.
- `packages/admin/src/types/game.ts`: add `undercover` to history type.
- `packages/admin/src/constants/adminConstants.ts`: add the Undercover display label if the existing label map is there.
- `tests/unit/runUnitTests.cjs`: include new unit files.
- `tests/workflow/runWorkflowTests.cjs`: include the workflow file.
- `docs/project-summary.md`, `docs/project-workflow.md`, `docs/project-client.md`, `docs/project-shared.md`: document the new engine path and contracts.

---

### Task 1: Shared Undercover Contracts and Typed Session Metadata

**Files:**

- Create: `packages/shared/types/undercover.ts`
- Create: `packages/shared/schemas/undercover.ts`
- Create: `tests/unit/undercoverSchemas.test.ts`
- Modify: `packages/shared/types/gameTypes.ts`
- Modify: `packages/shared/types/gameEvent.ts`
- Modify: `packages/shared/types/gameEngine.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**

- Produces: `UndercoverPublicPlayer`, `UndercoverSpeech`, `UndercoverVoteResult`, `UndercoverPublicState`, `undercoverStartSchema`, `undercoverSpeechSchema`, `undercoverVoteSchema`, `GameSessionMetadata`.
- Consumed by: Tasks 2-6.

- [ ] **Step 1: Add the failing schema test and register it in the unit runner**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  undercoverSpeechSchema,
  undercoverStartSchema,
  undercoverVoteSchema,
} from '../../packages/shared/schemas/undercover';

test('undercover start requires six unique positive player ids', () => {
  assert.equal(undercoverStartSchema.safeParse({ playerIds: [1, 2, 3, 4, 5, 6] }).success, true);
  assert.equal(undercoverStartSchema.safeParse({ playerIds: [1, 2, 3, 4, 5] }).success, false);
  assert.equal(undercoverStartSchema.safeParse({ playerIds: [1, 2, 3, 4, 5, 5] }).success, false);
});

test('undercover AI contracts bound speech and vote reason', () => {
  assert.equal(undercoverSpeechSchema.safeParse({ speech: '它通常很常见' }).success, true);
  assert.equal(undercoverSpeechSchema.safeParse({ speech: 'x'.repeat(121) }).success, false);
  assert.equal(undercoverVoteSchema.safeParse({ targetId: 2, reason: '描述最可疑' }).success, true);
  assert.equal(undercoverVoteSchema.safeParse({ targetId: 2, reason: 'x'.repeat(81) }).success, false);
});
```

Append `'undercoverSchemas.test.ts'` to the default file list in `tests/unit/runUnitTests.cjs`.

- [ ] **Step 2: Run the focused test and verify the missing module failure**

Run: `node .\tests\unit\runUnitTests.cjs undercoverSchemas.test.ts`

Expected: FAIL with `Cannot find module '../../packages/shared/schemas/undercover'`.

- [ ] **Step 3: Add the minimal shared schemas and types**

```ts
// packages/shared/schemas/undercover.ts
import { z } from 'zod';

const undercoverStartSchema = z.object({
  playerIds: z.array(z.coerce.number().int().positive()).length(6)
    .refine((ids) => new Set(ids).size === ids.length, 'playerIds must be unique'),
});

const undercoverSpeechSchema = z.object({
  speech: z.string().trim().min(1).max(120),
});

const undercoverVoteSchema = z.object({
  targetId: z.coerce.number().int().positive(),
  reason: z.string().trim().max(80).default(''),
});

export { undercoverSpeechSchema, undercoverStartSchema, undercoverVoteSchema };
```

```ts
// packages/shared/types/undercover.ts
interface UndercoverPublicPlayer {
  id: number;
  nickname: string;
  avatar?: string;
  alive: boolean;
  eliminatedRound?: number;
}

interface UndercoverSpeech {
  round: number;
  playerId: number;
  text: string;
}

interface UndercoverVoteResult {
  round: number;
  runoff: boolean;
  votes: Record<string, number>;
  tally: Record<string, number>;
  tiedCandidateIds: number[];
  eliminatedPlayerId?: number;
}

interface UndercoverReveal {
  civilianWord: string;
  undercoverWord: string;
  undercoverPlayerId: number;
}

interface UndercoverPublicState {
  id: string;
  gameType: 'undercover';
  mode: 'standard-6';
  status: 'setup' | 'speaking' | 'voting' | 'completed';
  round: number;
  players: UndercoverPublicPlayer[];
  speeches: UndercoverSpeech[];
  voteResult?: UndercoverVoteResult;
  winner?: 'civilians' | 'undercover';
  winReason?: string;
  reveal?: UndercoverReveal;
}

export type {
  UndercoverPublicPlayer,
  UndercoverPublicState,
  UndercoverReveal,
  UndercoverSpeech,
  UndercoverVoteResult,
};
```

Add `UNDERCOVER: 'undercover'` to `GAME_TYPES`.

Add these literals to `GameEventType` in `gameEvent.ts`:

```ts
| 'undercover-game-start'
| 'undercover-round-start'
| 'undercover-speech'
| 'undercover-vote-start'
| 'undercover-vote-result'
| 'undercover-eliminated'
| 'undercover-game-result'
```

Replace `metadata?: Record<string, unknown>` in `GameDefinition` with:

```ts
interface GameSessionMetadata {
  startMessage: string;
  doneMessage: string;
  playerSelection?: {
    min: number;
    max: number;
    errorMessage: string;
  };
  playback?: {
    prefetchCount?: number;
    phaseLookahead?: number;
  };
}

interface GameDefinitionMetadata extends Record<string, unknown> {
  session?: GameSessionMetadata;
}

// GameDefinition
metadata?: GameDefinitionMetadata;
```

Export both metadata interfaces from `gameEngine.ts`.

- [ ] **Step 4: Run shared and focused checks**

Run:

```powershell
node .\tests\unit\runUnitTests.cjs undercoverSchemas.test.ts
pnpm.cmd run check:shared
```

Expected: schema tests PASS; shared TypeScript check exits 0.

- [ ] **Step 5: Commit**

```powershell
git add packages/shared/types/gameTypes.ts packages/shared/types/gameEvent.ts packages/shared/types/gameEngine.ts packages/shared/types/undercover.ts packages/shared/schemas/undercover.ts tests/unit/undercoverSchemas.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat: add undercover shared contracts"
```

---

### Task 2: Deterministic Undercover Rules

**Files:**

- Create: `packages/server/modules/undercover/types.ts`
- Create: `packages/server/modules/undercover/rules.ts`
- Create: `tests/unit/undercoverRules.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**

- Consumes: shared public types from Task 1.
- Produces: `createInitialUndercoverState`, `getLegalVoteTargets`, `resolveVote`, `eliminatePlayer`, `checkWinner`, `containsSecretWord`, `seededIndex`.

- [ ] **Step 1: Write failing pure-rule tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import {
  checkWinner,
  createInitialUndercoverState,
  eliminatePlayer,
  getLegalVoteTargets,
  resolveVote,
} from '../../packages/server/modules/undercover/rules';

const players = Array.from({ length: 6 }, (_, index) => ({
  id: index + 1,
  nickname: `${index + 1}号`,
}));

test('undercover setup assigns one secret holder without exposing it publicly', () => {
  const state = createInitialUndercoverState(players, {
    seed: 7,
    wordPair: { civilian: '咖啡', undercover: '茶' },
    undercoverPlayerId: 6,
  });
  assert.equal(state.undercoverPlayerId, 6);
  assert.deepEqual(state.playerWords, { 1: '咖啡', 2: '咖啡', 3: '咖啡', 4: '咖啡', 5: '咖啡', 6: '茶' });
});

test('vote targets exclude self, eliminated players, and non-runoff candidates', () => {
  const state = createInitialUndercoverState(players, { seed: 7, wordPair: { civilian: '咖啡', undercover: '茶' }, undercoverPlayerId: 6 });
  state.players[4].alive = false;
  assert.deepEqual(getLegalVoteTargets(state, 1), [2, 3, 4, 6]);
  assert.deepEqual(getLegalVoteTargets(state, 1, [2, 6]), [2, 6]);
});

test('first tie requests runoff and second tie uses stable seeded elimination', () => {
  const state = createInitialUndercoverState(players, { seed: 7, wordPair: { civilian: '咖啡', undercover: '茶' }, undercoverPlayerId: 6 });
  const votes = { 1: 2, 2: 1, 3: 2, 4: 1, 5: 2, 6: 1 };
  assert.deepEqual(resolveVote(state, votes, false), { kind: 'runoff', candidateIds: [1, 2], tally: { 1: 3, 2: 3 } });
  const result = resolveVote(state, votes, true);
  assert.equal(result.kind, 'eliminate');
  assert.ok([1, 2].includes(result.playerId));
});

test('winner is civilians when undercover leaves and undercover at three alive', () => {
  const state = createInitialUndercoverState(players, { seed: 7, wordPair: { civilian: '咖啡', undercover: '茶' }, undercoverPlayerId: 6 });
  assert.deepEqual(checkWinner(eliminatePlayer(state, 6, 1)), { winner: 'civilians', reason: '卧底被淘汰' });
  const reduced = eliminatePlayer(eliminatePlayer(eliminatePlayer(state, 1, 1), 2, 2), 3, 3);
  assert.deepEqual(checkWinner(reduced), { winner: 'undercover', reason: '卧底存活至最后三人' });
});
```

Register `undercoverRules.test.ts` in the unit runner.

- [ ] **Step 2: Run and confirm missing rule functions**

Run: `node .\tests\unit\runUnitTests.cjs undercoverRules.test.ts`

Expected: FAIL because `modules/undercover/rules` does not exist.

- [ ] **Step 3: Implement the minimum internal state and rules**

Define in `types.ts`:

```ts
interface UndercoverWordPair { civilian: string; undercover: string }
interface UndercoverPlayerState { id: number; nickname: string; avatar?: string; alive: boolean; eliminatedRound?: number }
interface UndercoverState {
  id: string;
  status: 'setup' | 'speaking' | 'voting' | 'completed';
  round: number;
  seed: number;
  wordPair: UndercoverWordPair;
  undercoverPlayerId: number;
  playerWords: Record<string, string>;
  players: UndercoverPlayerState[];
  speeches: Array<{ round: number; playerId: number; text: string }>;
  votes: Record<string, number>;
  runoffCandidateIds: number[];
  winner?: 'civilians' | 'undercover';
  winReason?: string;
}
```

Implement in `rules.ts` using only copies, `Map`, `Set`, array methods, and this deterministic index:

```ts
const UNDERCOVER_WORD_PAIRS: UndercoverWordPair[] = [
  { civilian: '咖啡', undercover: '茶' },
  { civilian: '牛奶', undercover: '豆浆' },
  { civilian: '火锅', undercover: '麻辣烫' },
  { civilian: '手机', undercover: '平板电脑' },
  { civilian: '地铁', undercover: '公交车' },
  { civilian: '雨伞', undercover: '雨衣' },
  { civilian: '电影', undercover: '电视剧' },
  { civilian: '饺子', undercover: '包子' },
];

function seededIndex(seed: number, size: number, salt = 0): number {
  if (size < 1) throw new Error('Cannot choose from an empty collection');
  const value = Math.imul((seed ^ salt) >>> 0, 1664525) + 1013904223;
  return (value >>> 0) % size;
}
```

`resolveVote()` must count only submitted legal votes, sort tied IDs ascending before seeded selection, return `runoff` on the first top tie, and return `eliminate` on the runoff tie. `eliminatePlayer()` must return a copied state. `checkWinner()` must check undercover death before the three-alive rule.

- [ ] **Step 4: Run the focused test**

Run: `node .\tests\unit\runUnitTests.cjs undercoverRules.test.ts`

Expected: all four tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/modules/undercover/types.ts packages/server/modules/undercover/rules.ts tests/unit/undercoverRules.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat: add undercover game rules"
```

---

### Task 3: Prompt Privacy, Leak Guard, and Public Presentation

**Files:**

- Create: `packages/server/modules/undercover/prompts.ts`
- Create: `packages/server/modules/undercover/presentation.ts`
- Create: `tests/unit/undercoverVisibility.test.ts`
- Modify: `packages/server/modules/undercover/rules.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**

- Consumes: `UndercoverState` and shared public contracts.
- Produces: `buildUndercoverSystemPrompt`, `buildUndercoverSpeechPrompt`, `buildUndercoverVotePrompt`, `validatePublicSpeech`, `toUndercoverPublicState`, `createUndercoverPresentationEvent`.

- [ ] **Step 1: Write the failing visibility tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialUndercoverState } from '../../packages/server/modules/undercover/rules';
import { buildUndercoverSpeechPrompt } from '../../packages/server/modules/undercover/prompts';
import { createUndercoverPresentationEvent, toUndercoverPublicState } from '../../packages/server/modules/undercover/presentation';

const state = createInitialUndercoverState(
  Array.from({ length: 6 }, (_, i) => ({ id: i + 1, nickname: `${i + 1}号` })),
  { seed: 7, wordPair: { civilian: '咖啡', undercover: '茶' }, undercoverPlayerId: 6 },
);

test('each speech prompt contains only the actor secret word', () => {
  const civilianPrompt = buildUndercoverSpeechPrompt(state, 1);
  const undercoverPrompt = buildUndercoverSpeechPrompt(state, 6);
  assert.match(civilianPrompt, /咖啡/);
  assert.doesNotMatch(civilianPrompt, /卧底词|茶/);
  assert.match(undercoverPrompt, /你的词是“茶”/);
  assert.doesNotMatch(undercoverPrompt, /咖啡/);
});

test('public state and pre-result events contain no secrets', () => {
  const publicState = toUndercoverPublicState(state);
  const event = createUndercoverPresentationEvent('undercover-game-start', state, { message: '游戏开始' });
  const serialized = JSON.stringify({ publicState, event });
  assert.doesNotMatch(serialized, /咖啡|茶|undercoverPlayerId/);
});

test('result event reveals both words and the undercover id', () => {
  const completed = { ...state, status: 'completed' as const, winner: 'civilians' as const, winReason: '卧底被淘汰' };
  const event = createUndercoverPresentationEvent('undercover-game-result', completed, { message: '平民获胜' });
  assert.match(JSON.stringify(event), /咖啡/);
  assert.match(JSON.stringify(event), /茶/);
  assert.equal(event.game?.reveal?.undercoverPlayerId, 6);
});
```

Register `undercoverVisibility.test.ts` in the unit runner.

- [ ] **Step 2: Run and confirm missing projection modules**

Run: `node .\tests\unit\runUnitTests.cjs undercoverVisibility.test.ts`

Expected: FAIL because prompts/presentation modules do not exist.

- [ ] **Step 3: Implement secret-scoped prompts and projection**

`buildUndercoverSpeechPrompt(state, actorId)` must interpolate only `state.playerWords[String(actorId)]`, public speeches, alive names, and this output contract:

```text
Return JSON only: {"speech":"不超过120字的描述"}
Do not say the secret word directly. You do not know whether you are undercover.
```

`buildUndercoverVotePrompt(state, actorId, candidateIds)` must contain public speeches and legal IDs, never `wordPair` or `undercoverPlayerId`.

Add to `rules.ts`:

```ts
function containsSecretWord(text: string, secretWord: string): boolean {
  return Boolean(secretWord.trim()) && text.toLocaleLowerCase().includes(secretWord.trim().toLocaleLowerCase());
}

function validatePublicSpeech(text: string, secretWord: string): { ok: true; text: string } | { ok: false; reason: 'secret-leak' } {
  const speech = text.trim().slice(0, 120);
  if (!speech || containsSecretWord(speech, secretWord)) return { ok: false, reason: 'secret-leak' };
  return { ok: true, text: speech };
}
```

`toUndercoverPublicState()` must explicitly construct public fields; never spread secret state. Add `reveal` only when `state.status === 'completed'`. `createUndercoverPresentationEvent()` returns `channel: 'public'`, `presentation.speakableText`, `displayText`, `uiHint`, and the projected `game`.

- [ ] **Step 4: Run visibility and rules tests**

Run:

```powershell
node .\tests\unit\runUnitTests.cjs undercoverVisibility.test.ts undercoverRules.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/modules/undercover/prompts.ts packages/server/modules/undercover/presentation.ts packages/server/modules/undercover/rules.ts tests/unit/undercoverVisibility.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat: protect undercover private information"
```

---

### Task 4: Persistent Undercover Workflow and Registered Runtime

**Files:**

- Create: `packages/server/modules/undercover/handlers.ts`
- Create: `packages/server/modules/undercover/workflow.ts`
- Create: `packages/server/modules/undercover/definition.ts`
- Create: `packages/server/modules/undercover/index.ts`
- Create: `tests/workflow/undercoverWorkflow.test.ts`
- Modify: `tests/workflow/runWorkflowTests.cjs`

**Interfaces:**

- Consumes: Tasks 1-3 rules, schemas, prompts, presentation.
- Produces: `UNDERCOVER_WORKFLOW_ID`, `registerUndercoverWorkflow`, `createUndercoverWorkflowMatch`, `createUndercoverGameDefinition`.

- [ ] **Step 1: Write a failing bounded-workflow test**

The test must create a debug match with fixed word pair, undercover ID, seed, and six public players; then repeatedly claim queued AI tasks, complete speech tasks with `{ speech: '常见描述' }`, complete vote tasks with deterministic target IDs, and tick until `completed`.

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { createUndercoverWorkflowMatch, registerUndercoverWorkflow } from '../../packages/server/modules/undercover/workflow';
import { claimNextAiTask, completeAiTask, getDebugState } from '../../packages/server/modules/workflow-engine';

test('undercover workflow completes a civilian win and persists public events', () => {
  registerUndercoverWorkflow();
  const match = createUndercoverWorkflowMatch({
    selectedPlayerIds: [1, 2, 3, 4, 5, 6],
    debugMode: true,
    debug: { seed: 7, civilianWord: '咖啡', undercoverWord: '茶', undercoverPlayerId: 6 },
    players: Array.from({ length: 6 }, (_, i) => ({ id: i + 1, nickname: `${i + 1}号` })),
  });

  for (let guard = 0; guard < 80; guard += 1) {
    const current = getDebugState(match.id).match;
    if (current.status === 'completed') break;
    const task = claimNextAiTask({ matchId: match.id, workerId: 'undercover-test' });
    assert.ok(task, `expected queued task at ${current.currentStepIndex}`);
    const payload = task.action === 'undercover_speech'
      ? { action: task.action, speech: '常见描述' }
      : { action: task.action, targetId: task.playerId === 6 ? 1 : 6, reason: '测试票' };
    completeAiTask(task.id, { eventType: 'ai_task_succeeded', payload });
  }

  const completed = getDebugState(match.id);
  assert.equal(completed.match.status, 'completed');
  assert.equal(completed.match.state.winner, 'civilians');
  assert.doesNotMatch(JSON.stringify(completed.events.filter((event) => event.visibility !== 'system').slice(0, -1)), /咖啡|茶|undercoverPlayerId/);
});
```

Register the file in `tests/workflow/runWorkflowTests.cjs`.

- [ ] **Step 2: Run and verify the workflow module is missing**

Run: `node .\tests\workflow\runWorkflowTests.cjs`

Expected: FAIL loading `modules/undercover/workflow`.

- [ ] **Step 3: Build the bounded workflow definition**

Generate steps programmatically:

```ts
const steps = [
  { id: 'setup', type: 'undercover.setup', name: '初始化', config: {} },
  ...[1, 2, 3].flatMap((round) => [
    { id: `round_${round}_start`, type: 'undercover.round_start', name: `第${round}轮开始`, config: { round } },
    ...Array.from({ length: 6 }, (_, orderIndex) => ({
      id: `round_${round}_speech_${orderIndex}`,
      type: 'undercover.speech',
      name: `第${round}轮发言${orderIndex + 1}`,
      config: { round, orderIndex },
    })),
    { id: `round_${round}_vote`, type: 'undercover.vote', name: `第${round}轮投票`, config: { round, runoff: false } },
    { id: `round_${round}_runoff`, type: 'undercover.vote', name: `第${round}轮复投`, config: { round, runoff: true } },
    { id: `round_${round}_resolve`, type: 'undercover.resolve', name: `第${round}轮结算`, config: { round } },
  ]),
  { id: 'result', type: 'undercover.result', name: '结果揭晓', config: {} },
];
```

Handlers must be idempotent through `completedSteps`. Speech steps select the rotated alive speaker by `(round - 1 + orderIndex) % players.length`, skip eliminated speakers, create one AI task, and emit one public speech event only after success. Vote steps create private AI tasks for every alive voter; first ties jump to runoff, non-ties skip runoff, and terminal winners jump to result via `nextStepId`.

- [ ] **Step 4: Implement AI task execution and fallback**

Use the existing `BasePlayerAgent` from `agent-core/playerAgent` and `askJson` for both speech and vote. Reconstruct the configured player by ID from `getAiConfig()`; use `gameType: 'undercover'` and `gameId: match.id` so calls enter Trace.

Speech execution order:

1. Parse `undercoverSpeechSchema`.
2. Run `validatePublicSpeech`.
3. If it reports `secret-leak`, call `askJson` once more with the leak correction.
4. If still invalid, return `{ speech: '这个事物在生活中并不少见', fallbackReason: 'secret-leak' }`.

Vote execution must call `askJson(prompt, { skillId: 'undercover-vote', phase: 'vote', promptHasContract: true })`, parse with `undercoverVoteSchema`, and verify `legalIds.includes(targetId)`. Invalid output receives one correction call containing the same legal IDs; a second failure falls back through `seededIndex`. Do not use `askVoteTarget()`, because its established contract reads `targetSeat/target`, while Undercover deliberately uses `targetId`.

- [ ] **Step 5: Implement definition runtime and outbox delivery**

`createUndercoverGameDefinition()` returns:

```ts
{
  gameType: 'undercover',
  version: '1.0.0',
  workflowId: UNDERCOVER_WORKFLOW_ID,
  actionSchemas: {
    undercover_speech: undercoverSpeechSchema,
    undercover_vote: undercoverVoteSchema,
  },
  metadata: {
    label: 'AI 谁是卧底',
    session: {
      startMessage: '谁是卧底开始',
      doneMessage: '谁是卧底结束，身份已经揭晓。',
      playerSelection: {
        min: 6,
        max: 6,
        errorMessage: 'AI 谁是卧底需要选择恰好 6 位 AI 玩家。',
      },
      playback: { phaseLookahead: 1 },
    },
  },
  runtime: {
    createMatch: ({ config }) => createUndercoverWorkflowMatch(config as UndercoverRuntimeConfig),
    run: async (matchId, context) => runUndercoverWorkflow(matchId, context),
  },
}
```

`runUndercoverWorkflow` follows the debate loop: flush initial outbox, call `drainAiTasks(matchId, { maxTasks: 1 })`, flush outbox after each task, stop only on `completed|failed|paused_debug`, and return `toUndercoverPublicState(finalMatch.state)`.

- [ ] **Step 6: Run focused workflow and server checks**

Run:

```powershell
node .\tests\workflow\runWorkflowTests.cjs
pnpm.cmd run check:server
```

Expected: Undercover workflow test PASS; server check exits 0.

- [ ] **Step 7: Commit**

```powershell
git add packages/server/modules/undercover tests/workflow/undercoverWorkflow.test.ts tests/workflow/runWorkflowTests.cjs
git commit -m "feat: add undercover workflow runtime"
```

---

### Task 5: Generic Registered Game Socket Runner and Playback

**Files:**

- Create: `packages/server/modules/game-socket/gameRunner.ts`
- Create: `tests/unit/undercoverGameRunner.test.ts`
- Modify: `packages/server/modules/engine-registry.ts`
- Modify: `packages/server/modules/debate/definition.ts`
- Modify: `packages/server/modules/werewolf/definition.ts`
- Modify: `packages/server/modules/game-socket/service.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**

- Consumes: `createUndercoverGameDefinition`, `registerUndercoverWorkflow`, `GameSessionMetadata`.
- Produces: `resolveGameRunner(gameType) -> { gameType, run, session }`.

- [ ] **Step 1: Write failing runner contract tests**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { resetGameEngine } from '../../packages/server/modules/engine-registry';
import { resolveGameRunner } from '../../packages/server/modules/game-socket/gameRunner';

test('registered undercover resolves through generic runtime metadata', () => {
  resetGameEngine();
  const resolved = resolveGameRunner('undercover');
  assert.equal(resolved.gameType, 'undercover');
  assert.equal(resolved.session.startMessage, '谁是卧底开始');
  assert.equal(resolved.session.doneMessage, '谁是卧底结束，身份已经揭晓。');
  assert.equal(typeof resolved.run, 'function');
});

test('unknown games fail instead of falling back to werewolf', () => {
  resetGameEngine();
  assert.throws(() => resolveGameRunner('not-a-game'), /GameDefinition not registered/);
});
```

Register `undercoverGameRunner.test.ts` in the unit runner.

- [ ] **Step 2: Run and verify missing generic runner**

Run: `node .\tests\unit\runUnitTests.cjs undercoverGameRunner.test.ts`

Expected: FAIL because `game-socket/gameRunner` does not exist.

- [ ] **Step 3: Register Undercover in the engine singleton**

Add imports and registration after werewolf:

```ts
registerUndercoverWorkflow();
engine.registerDefinition(createUndercoverGameDefinition());
```

Add session metadata to the existing definitions without changing their runtime behavior:

```ts
// debate
session: {
  startMessage: '辩论赛开始',
  doneMessage: '辩论赛结束，完整赛果已生成。',
  playback: { phaseLookahead: 1 },
}

// werewolf
session: {
  startMessage: '游戏开始',
  doneMessage: '狼人杀结束，完整战报已生成。',
  playback: { prefetchCount: 2 },
}
```

- [ ] **Step 4: Implement the generic runner resolver**

```ts
function resolveGameRunner(gameType: string): ResolvedGameRunner {
  const engine = getGameEngine();
  const definition = engine.getDefinition(gameType);
  if (!definition) throw new Error(`GameDefinition not registered: ${gameType}`);

  const session = definition.metadata?.session || {
    startMessage: '游戏开始',
    doneMessage: '游戏结束。',
  };

  if (gameType === 'debate') return { gameType, run: runDebateViaEngine, session };
  if (gameType === 'werewolf') return { gameType, run: runWerewolfViaEngine, session };
  if (!definition.runtime) throw new Error(`GameDefinition runtime not registered: ${gameType}`);

  return {
    gameType,
    session,
    run: (config, context) => engine.runGame(gameType, { config }, context),
  };
}
```

The only hard-coded branches are the two legacy compatibility runners; Undercover and later games use the generic runtime branch.

- [ ] **Step 5: Replace socket normalization and runner branching**

In `runSession`, call `resolveGameRunner(gameType)` once. Use its normalized `gameType`, runner, start/done messages, and playback settings. Remove `normalizeGameType`, `getRunner`, `getStartMessage`, and `getDoneMessage` from `service.ts`.

Create PlaybackPipeline for every resolved game. Preserve werewolf-only player projection and existing debate/werewolf prefetch values by storing those values in their definition metadata; Undercover uses `{ phaseLookahead: 1 }`.

Update `selectPlayersForGame()` with one generic trust-boundary rule driven by
the registered definition, so Undercover and later games do not add socket
branches:

```ts
const selection = getGameEngine()
  .getDefinition(gameType)
  ?.metadata?.session?.playerSelection;

if (selection && (selected.length < selection.min || selected.length > selection.max)) {
  throw new Error(selection.errorMessage);
}
```

- [ ] **Step 6: Run runner, socket, and engine tests**

Run:

```powershell
node .\tests\unit\runUnitTests.cjs undercoverGameRunner.test.ts gameSocketSession.test.ts gameEngineContracts.test.ts
pnpm.cmd run check:server
```

Expected: all focused tests PASS; server check exits 0.

- [ ] **Step 7: Commit**

```powershell
git add packages/server/modules/engine-registry.ts packages/server/modules/debate/definition.ts packages/server/modules/werewolf/definition.ts packages/server/modules/game-socket/gameRunner.ts packages/server/modules/game-socket/service.ts tests/unit/undercoverGameRunner.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat: run registered games through socket engine"
```

---

### Task 6: C-End Undercover Vertical Slice

**Files:**

- Create: `packages/client/src/features/undercover/types.ts`
- Create: `packages/client/src/features/undercover/hooks/useUndercoverGame.ts`
- Create: `packages/client/src/features/undercover/components/UndercoverArena.tsx`
- Create: `packages/client/src/features/undercover/components/UndercoverArena.css`
- Create: `packages/client/src/features/undercover/components/UndercoverControls.tsx`
- Create: `packages/client/src/features/undercover/components/UndercoverControls.css`
- Create: `packages/client/src/features/undercover/UndercoverGame/index.tsx`
- Create: `packages/client/src/features/undercover/UndercoverGame/index.css`
- Create: `packages/client/src/features/undercover/index.ts`
- Modify: `packages/client/src/App.tsx`
- Modify: `packages/client/src/pages/GameSelectPage/index.tsx`
- Modify: `packages/client/src/pages/GameSelectPage/index.css`
- Modify: `packages/client/src/types/game.ts`
- Modify: `packages/admin/src/types/game.ts`
- Modify: `packages/admin/src/constants/adminConstants.ts`

**Interfaces:**

- Consumes: shared public state, existing `useGameSocketSession`, `useSpeechQueue`, game selection/history services.
- Produces: one `UndercoverGame` page for both live and replay routes.

- [ ] **Step 1: Extend the existing navigation test before UI code**

In `tests/unit/gameNavigation.test.ts`, add an assertion that `buildGamePath('undercover', { version: 'v2' })` produces `/game/v2/undercover`. Run:

```powershell
node .\tests\unit\runUnitTests.cjs gameNavigation.test.ts
```

Expected before route changes: PASS if routing is already generic. This is a characterization check; do not modify the router if it passes.

- [ ] **Step 2: Add the game-selection entry and exact-six validation**

Add `UsersRound` (or another already-installed lucide icon), then:

```ts
undercover: { min: 6, max: 6, recommended: 6, label: '固定 6 人' }
```

Add a game catalog entry `{ key: 'undercover', title: 'AI 谁是卧底', subtitle: '6人语言推理局', tone: 'undercover', ... }`.

Replace separate `onStartDebate`/`onStartWerewolf` props with one typed callback:

```ts
interface GameSelectPageProps {
  onStartGame: (gameType: string, playerIds: number[]) => void;
  onReplayGame?: (gameType: string, gameId: string, playerIds?: number[]) => void;
}
```

`startGame(gameKey)` calls `onStartGame(gameKey, getSelection(gameKey))`; this removes the current two-game branch.

- [ ] **Step 3: Implement the feature-local event reducer hook**

`useUndercoverGame` owns only Undercover view state and delegates transport/playback:

```ts
function applyServerEvent(event: GameEvent): void {
  if (event.game?.gameType === 'undercover') setGame(event.game as UndercoverPublicState);
  if (event.type === 'error') setError(String(event.message || '游戏发生错误'));
}

function getNarration(event: GameEvent): string {
  return String(event.presentation?.speakableText || event.speech?.text || event.message || '');
}
```

Call `useGameSocketSession({ gameType: 'undercover', ... })`; start live with `{ playerIds }`, replay with `{ replayGameId }`. Keep secret fields absent from feature state before result.

- [ ] **Step 4: Implement accessible arena and controls**

`UndercoverArena` receives only `UndercoverPublicState`. Render six seat `<article>` elements with text labels for “发言中” and “第 N 轮淘汰”; use CSS classes only for visual enhancement. Render reveal only when `game.status === 'completed' && game.reveal`.

`UndercoverControls` mirrors the existing debate/werewolf control contract:

```ts
interface UndercoverControlsProps {
  autoPlay: boolean;
  started: boolean;
  replayMode: boolean;
  onReturn: () => void;
  onStart: () => void;
  onTogglePlayback: (enabled: boolean) => void;
  onSkipPhase: () => void;
}
```

Buttons must be `type="button"`, have visible text, titles, and correct disabled state.

- [ ] **Step 5: Wire App and history/admin labels**

In `App.tsx`, resolve Undercover before the werewolf default:

```tsx
if (route.gameKey === 'undercover') {
  return <UndercoverGame replayGameId={replayGameId} onReturnToSelect={openSelectPage} />;
}
```

Pass `onStartGame={(gameType, playerIds) => startGame(gameType, playerIds)}` to `GameSelectPage`.

Add `'undercover'` to the admin `GameType` union and map it to `谁是卧底`; do not add an Undercover management page.

- [ ] **Step 6: Run client/admin checks and build**

Run:

```powershell
pnpm.cmd run build:client
pnpm.cmd run check:admin
```

Expected: client build exits 0; admin check exits 0 or reports only pre-existing errors outside touched files, which must be recorded verbatim before proceeding.

- [ ] **Step 7: Commit**

```powershell
git add packages/client/src/features/undercover packages/client/src/App.tsx packages/client/src/pages/GameSelectPage packages/client/src/types/game.ts packages/admin/src/types/game.ts packages/admin/src/constants/adminConstants.ts tests/unit/gameNavigation.test.ts
git commit -m "feat: add undercover client experience"
```

---

### Task 7: Documentation, Full Regression, and Engine Acceptance

**Files:**

- Modify: `docs/project-summary.md`
- Modify: `docs/project-workflow.md`
- Modify: `docs/project-client.md`
- Modify: `docs/project-shared.md`
- Modify: code/tests only if verification exposes a regression caused by Tasks 1-6.

**Interfaces:**

- Consumes: completed third-game vertical slice.
- Produces: synchronized project contracts and final verification evidence.

- [ ] **Step 1: Update documentation with verified facts**

Document:

- `undercover` as the third registered game.
- The generic definition-runtime fallback and two legacy compatibility runners.
- Six-player bounded workflow, secret visibility, fallback, and terminal reveal.
- Shared Undercover schemas/types.
- C-end single-page live/replay behavior.
- No database/API/WebSocket protocol changes.

Do not add source call-path inventories that CodeGraph already provides.

- [ ] **Step 2: Run targeted Undercover suites**

Run:

```powershell
node .\tests\unit\runUnitTests.cjs undercoverSchemas.test.ts undercoverRules.test.ts undercoverVisibility.test.ts undercoverGameRunner.test.ts gameNavigation.test.ts
node .\tests\workflow\runWorkflowTests.cjs
```

Expected: all Undercover and workflow tests PASS.

- [ ] **Step 3: Run full project verification**

Run in order:

```powershell
pnpm.cmd run check
pnpm.cmd run test:unit
pnpm.cmd run test:workflow
pnpm.cmd run build
```

Expected: every command exits 0. If a command fails before business assertions with `safe-buffer`, `es-errors/type`, or another module-linking error, record it as a dependency blocker, run the targeted tests above, and do not claim the full suite passed.

- [ ] **Step 4: Verify the no-secret and no-special-runner acceptance criteria**

Run:

```powershell
Select-String -Path 'packages\server\modules\game-socket\*.ts' -Pattern "gameType\s*===\s*['\"]undercover['\"]"
```

Expected: no matches.

Then inspect the completed workflow test’s public event serialization and saved playback list; both must contain reveal data only in the final result event.

- [ ] **Step 5: Review the final diff for scope**

Run:

```powershell
git diff --check
git status --short
git diff --stat
```

Expected: no whitespace errors, no database migration, no new dependency, no unrelated file.

- [ ] **Step 6: Commit documentation and verification fixes**

```powershell
git add docs/project-summary.md docs/project-workflow.md docs/project-client.md docs/project-shared.md
git commit -m "docs: document undercover engine integration"
```

If verification required source/test fixes, stage those exact files in the same final commit only when they are directly caused by the Undercover integration; otherwise create a separate focused fix commit.
