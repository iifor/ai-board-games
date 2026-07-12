# Werewolf Mode 29 Wolf Escape Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the 10-player `wolf-escape-10` mode with a three-player Escape Hunter team, one shared nightly hunt, Thick Wolf armor, reversed Seer information, custom victory rules, debug execution, and C-side feedback.

**Architecture:** Add dedicated mode-only roles so normal Hunter and Werewolf behavior is untouched. Reuse the existing action-window, death-resolution, event, playback, and client state pipelines; add one small `escapeHunterTeam.ts` helper for private team context and deterministic vote resolution.

**Tech Stack:** TypeScript 6, Node test runner, React 18, existing werewolf workflow/action-window/event pipeline, pnpm workspace.

## Global Constraints

- Mode id is `wolf-escape-10`; display name is `狼狼大逃杀（10人）`.
- Role ids are `escape_hunter`, `tamed_werewolf`, and `thick_wolf`.
- Exactly three living Escape Hunters vote for one shared alive non-hunter target.
- Thick Wolf armor only absorbs the first unresolved `escape_hunter_hunt`; poison, exile, and daytime shots bypass it.
- `hunters` wins when all protected wolves are dead; otherwise `good` wins when all Escape Hunters are dead.
- Existing normal Hunter, Werewolf, REST, WebSocket start/control/ack, and database table behavior must not change.
- Use `pnpm.cmd` on Windows.
- Preserve all pre-existing dirty-worktree changes. Do not commit touched source files as a group.

---

### Task 1: Default Mode And Dedicated Role Configuration

**Files:**
- Modify: `tests/unit/werewolfDefaultConfig.test.ts`
- Modify: `packages/server/modules/werewolf-config/constants.ts`
- Modify: `packages/server/modules/werewolf-config/utils.ts`
- Modify: `packages/server/db/seed.ts`

**Interfaces:**
- Consumes: existing `mode(...)`, `role(...)`, `DEFAULT_WEREWOLF_MODES`, `DEFAULT_WEREWOLF_ROLES`.
- Produces: mode `wolf-escape-10`, role action `hunterHunt`, and `winCondition: 'wolf_escape'` for later tasks.

- [ ] **Step 1: Write the failing default-config test**

```ts
test('default config includes wolf escape mode 29', () => {
  const mode = DEFAULT_WEREWOLF_MODES.find((item) => item.id === 'wolf-escape-10');
  assert.ok(mode);
  assert.equal(mode.winCondition, 'wolf_escape');
  assert.equal(mode.roles.reduce((sum, item) => sum + item.count, 0), 10);
  assert.deepEqual(mode.roles, [
    { roleId: 'escape_hunter', count: 3 },
    { roleId: 'seer', count: 1 },
    { roleId: 'witch', count: 1 },
    { roleId: 'thick_wolf', count: 1 },
    { roleId: 'tamed_werewolf', count: 2 },
    { roleId: 'villager', count: 2 },
  ]);
  const hunter = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'escape_hunter');
  assert.ok(hunter?.rule.actions.some((action) => action.action === 'hunterHunt'));
  assert.ok(hunter?.rule.actions.some((action) => action.action === 'shootOnDeath'));
});
```

- [ ] **Step 2: Run the unit suite and verify the new assertion fails**

Run: `pnpm.cmd run test:unit`

Expected: FAIL because `wolf-escape-10` and `escape_hunter` do not exist.

- [ ] **Step 3: Add the minimal mode and role definitions**

```ts
mode('wolf-escape-10', '狼狼大逃杀（10人）', [
  ['escape_hunter', 3], ['seer', 1], ['witch', 1], ['thick_wolf', 1], ['tamed_werewolf', 2], ['villager', 2],
], 29, 'wolf_escape'),

role('escape_hunter', '猎人', 'hunters', 'hunter', [
  { trigger: 'night', action: 'hunterHunt', targetRule: 'alive-non-hunter', group: 'escape_hunters' },
  { trigger: 'death', action: 'shootOnDeath', disabledDeathReasons: ['witch_poison', '女巫毒杀'] },
], 47),
role('tamed_werewolf', '狼人', 'good', 'villager', [
  { trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' },
], 48),
role('thick_wolf', '厚皮狼', 'good', 'villager', [
  { trigger: 'day', action: 'speakOnly' }, { trigger: 'vote', action: 'voteOnly' },
], 49),
```

Change the helper signature and assignment to:

```ts
function mode(
  id: string,
  name: string,
  roleEntries: Array<[string, number]>,
  sortOrder: number,
  winCondition: string = 'side',
): DefaultWerewolfMode {
  return {
    id,
    name,
    description: name,
    roles: roleEntries.map(([roleId, count]) => ({ roleId, count })),
    sheriff,
    winCondition,
    sortOrder,
    enabled: true,
  };
}
```

Add `hunterHunt` to both executable-action allowlists used by seed/config validation.

- [ ] **Step 4: Run the unit suite and verify the mode test passes**

Run: `pnpm.cmd run test:unit`

Expected: the new mode assertion passes; unrelated pre-existing failures, if any, are recorded separately.

---

### Task 2: Escape Hunter Team Context And Shared Vote

**Files:**
- Create: `packages/server/modules/werewolf/escapeHunterTeam.ts`
- Modify: `tests/workflow/werewolfReducers.test.ts`
- Modify: `packages/server/modules/werewolf/reducers.ts`
- Modify: `packages/server/modules/werewolf/steps.ts`
- Modify: `packages/server/modules/werewolf/aiActions.ts`
- Modify: `packages/server/modules/werewolf/roles.ts`
- Modify: `packages/server/modules/werewolf/handlers/actionWindowHandler.ts`

**Interfaces:**
- Consumes: `Agent`, `Round`, `Runtime`, `sortBySeat`, `countTargets`, and existing ordered action-window behavior.
- Produces: `ensureEscapeHunterTeamContext(runtime, round)`, `resolveNightAttackTarget(night)`, `escape_hunter_speech`, `escape_hunter_vote`, and dedicated serialized night fields.

- [ ] **Step 1: Write the failing reducer test for legal deterministic voting**

```ts
test('escape hunters share one legal deterministic night target', () => {
  const round = createRound(1);
  const ctx = {
    agents: [
      actor(1, 'hunters', ['hunterHunt'], { role: 'escape_hunter' }),
      actor(2, 'hunters', ['hunterHunt'], { role: 'escape_hunter' }),
      actor(3, 'hunters', ['hunterHunt'], { role: 'escape_hunter' }),
      actor(4, 'good', [], { role: 'thick_wolf' }),
      actor(5, 'good', [], { role: 'villager' }),
    ],
    modeConfig: { id: 'wolf-escape-10', winCondition: 'wolf_escape' },
    state: { rounds: [round] },
  };
  applyActionResults(ctx as never, { config: { day: 1, actionType: 'escape_hunter_vote' } } as never, [
    { actorId: 1, payload: { target: 4 } },
    { actorId: 2, payload: { target: 4 } },
    { actorId: 3, payload: { target: 2 } },
  ] as never);
  assert.deepEqual(round.night.escapeHunterChoices, { 1: 4, 2: 4 });
  assert.equal(round.night.escapeHunterTarget, 4);
});
```

- [ ] **Step 2: Run the workflow suite and verify the reducer test fails**

Run: `pnpm.cmd run test:workflow`

Expected: FAIL because `escape_hunter_vote` is not handled.

- [ ] **Step 3: Add the focused team helper**

```ts
import { sortBySeat } from './utils';
import type { Agent, Round, Runtime } from './reducers';

function getLivingEscapeHunters(runtime: Runtime): Agent[] {
  return sortBySeat(runtime.agents.filter((agent) => agent.alive && String(agent.role || agent.roleConfig?.id) === 'escape_hunter'));
}

function ensureEscapeHunterTeamContext(runtime: Runtime, round: Round) {
  const hunters = getLivingEscapeHunters(runtime);
  round.night.escapeHunterIds = hunters.map((hunter) => hunter.id);
  round.night.escapeHunterSpeechOrder = hunters.map((hunter) => hunter.id);
  return hunters;
}

function resolveNightAttackTarget(night: { escapeHunterTarget?: number | null; wolfTarget?: number | null }): number | null {
  return Number(night.escapeHunterTarget || night.wolfTarget || 0) || null;
}

export { ensureEscapeHunterTeamContext, getLivingEscapeHunters, resolveNightAttackTarget };
```

- [ ] **Step 4: Wire speech, vote, actors, targets, and ordered partial application**

Add reducer dispatch and minimal handlers:

```ts
if (actionType === 'escape_hunter_speech') applyEscapeHunterSpeech(runtime, round, results);
if (actionType === 'escape_hunter_vote') applyEscapeHunterVote(runtime, round, results);

function applyEscapeHunterVote(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const hunters = new Set(ensureEscapeHunterTeamContext(runtime, round).map((agent) => Number(agent.id)));
  const aliveById = new Map(runtime.agents.filter((agent) => agent.alive).map((agent) => [Number(agent.id), agent]));
  round.night.escapeHunterChoices = {};
  for (const result of results) {
    const target = aliveById.get(Number(result.payload.target));
    if (!hunters.has(Number(result.actorId)) || !target || hunters.has(Number(target.id))) continue;
    round.night.escapeHunterChoices[String(result.actorId)] = Number(target.id);
  }
  round.night.escapeHunterVoteTally = countTargets(round.night.escapeHunterChoices);
  round.night.escapeHunterTarget = getTopCandidateIds(round.night.escapeHunterVoteTally)[0] || null;
}
```

Add the two night steps immediately before Seer:

```ts
step(`escape_hunter_speech_${day}`, 'action_window', { day, phase: 'night', actionType: 'escape_hunter_speech', ordered: true }),
step(`escape_hunter_vote_${day}`, 'action_window', { day, phase: 'night', actionType: 'escape_hunter_vote' }),
```

Map speech to `speakOnly`, vote to `hunterHunt`, include speech in `shouldApplyPartialResults`, and return alive non-hunter ids from `getTargetIds`.

- [ ] **Step 5: Run the workflow suite and verify reducer behavior passes**

Run: `pnpm.cmd run test:workflow`

Expected: the new Escape Hunter vote test passes.

---

### Task 3: Hunt Resolution, Witch Save, And Thick Wolf Armor

**Files:**
- Modify: `tests/workflow/werewolfEffects.test.ts`
- Modify: `packages/server/modules/werewolf/effects.ts`
- Modify: `packages/server/modules/werewolf/reducers.ts`
- Modify: `packages/server/modules/werewolf/handlers/resolveHandlers.ts`
- Modify: `packages/server/modules/werewolf/constants.ts`

**Interfaces:**
- Consumes: `resolveNightAttackTarget`, existing Witch eligibility/save logic, `resolveNightEffects`, and `publishGameEvent`.
- Produces: `thickWolfHuntHits`, `night.thickWolfArmorBreak`, source action `escape_hunter_hunt`, and public event `thick-wolf-armor`.

- [ ] **Step 1: Write failing effect tests for armor and antidote**

```ts
test('thick wolf absorbs only the first unresolved escape hunter hunt', () => {
  const thickWolf = agent(4, [], { role: 'thick_wolf', thickWolfHuntHits: 0 });
  const agents = [agent(1, ['hunterHunt'], { role: 'escape_hunter', faction: 'hunters' }), thickWolf];
  const first = { day: 1, night: { escapeHunterTarget: 4 } } as never;
  const firstResult = resolveNightEffects(agents as never, first, { id: 'wolf-escape-10' });
  assert.equal(firstResult.deaths.length, 0);
  assert.equal(thickWolf.thickWolfHuntHits, 1);
  assert.equal((first as any).night.thickWolfArmorBreak.targetId, 4);

  const second = { day: 2, night: { escapeHunterTarget: 4 } } as never;
  const secondResult = resolveNightEffects(agents as never, second, { id: 'wolf-escape-10' });
  assert.equal(secondResult.deaths[0]?.sourceAction, 'escape_hunter_hunt');
});

test('witch antidote prevents hunt without consuming thick wolf armor', () => {
  const thickWolf = agent(4, [], { role: 'thick_wolf', thickWolfHuntHits: 0 });
  const round = { day: 1, night: { escapeHunterTarget: 4, witchSave: true, witchSaveTarget: 4 } } as never;
  const result = resolveNightEffects([thickWolf] as never, round, { id: 'wolf-escape-10' });
  assert.equal(result.deaths.length, 0);
  assert.equal(thickWolf.thickWolfHuntHits, 0);
});
```

- [ ] **Step 2: Run workflow tests and verify armor tests fail**

Run: `pnpm.cmd run test:workflow`

Expected: FAIL because hunt resolution and armor state are missing.

- [ ] **Step 3: Resolve the hunt through the existing effect chain**

```ts
function appendEscapeHunterHuntDeath(
  agents: WerewolfAgent[],
  night: Night,
  targetId: number | null,
  savedTarget: number | null,
  effects: Effect[],
  deaths: Array<{ id: number; reason: string; sourceFaction?: string; sourceAction?: string }>,
): void {
  if (!targetId || Number(targetId) === Number(savedTarget)) return;
  const target = agents.find((agent) => agent.alive && Number(agent.id) === Number(targetId));
  if (!target) return;
  if (String(target.role || target.roleConfig?.id) === 'thick_wolf' && Number(target.thickWolfHuntHits || 0) === 0) {
    target.thickWolfHuntHits = 1;
    night.thickWolfArmorBreak = { targetId: Number(target.id) };
    effects.push({ type: WEREWOLF_EFFECT_TYPES.THICK_WOLF_ARMOR, target: Number(target.id), sourceFaction: 'hunters', sourceAction: 'escape_hunter_hunt' });
    return;
  }
  deaths.push({ id: Number(target.id), reason: '猎人夜袭', sourceFaction: 'hunters', sourceAction: 'escape_hunter_hunt' });
}
```

Use `resolveNightAttackTarget(round.night)` in Witch eligibility and `applyWitchSave`, but keep the dedicated hunt field unchanged. Publish `thick-wolf-armor` once from `createNightResolveHandler` when the returned effects contain `THICK_WOLF_ARMOR`.

- [ ] **Step 4: Run workflow tests and verify armor and antidote pass**

Run: `pnpm.cmd run test:workflow`

Expected: both new effect tests pass.

---

### Task 4: Seer Result, Death Shot, And Custom Winners

**Files:**
- Modify: `tests/workflow/werewolfEffects.test.ts`
- Modify: `tests/workflow/werewolfReducers.test.ts`
- Modify: `packages/server/modules/werewolf/reducers.ts`
- Modify: `packages/server/modules/werewolf/winCheck.ts`
- Modify: `packages/server/modules/werewolf/effects.ts`
- Modify: `packages/server/modules/werewolf/deathResolution/hunterStage.ts`

**Interfaces:**
- Consumes: role action `shootOnDeath`, `resolveSeerFactionResult`, `checkWin`, `checkDayWin`, and existing hunter-shot resolution.
- Produces: `checkWolfEscapeWin(agents, day)`, winner `hunters`, and mode-specific Seer output.

- [ ] **Step 1: Write failing tests for both winners and Seer output**

```ts
test('wolf escape winner ignores ordinary wolf parity', () => {
  const huntersDead = [
    agent(1, [], { role: 'escape_hunter', faction: 'hunters', alive: false }),
    agent(2, [], { role: 'tamed_werewolf', faction: 'good' }),
  ];
  assert.equal(checkWin(huntersDead as never, 2, { id: 'wolf-escape-10', winCondition: 'wolf_escape' }).winner, 'good');

  const wolvesDead = [
    agent(1, [], { role: 'escape_hunter', faction: 'hunters' }),
    agent(2, [], { role: 'thick_wolf', faction: 'good', alive: false }),
    agent(3, [], { role: 'tamed_werewolf', faction: 'good', alive: false }),
  ];
  assert.equal(checkWin(wolvesDead as never, 2, { id: 'wolf-escape-10', winCondition: 'wolf_escape' }).winner, 'hunters');
});
```

Add a reducer assertion that Seer checking `escape_hunter` stores `result: '狼人'`.

- [ ] **Step 2: Run workflow tests and verify winner/Seer tests fail**

Run: `pnpm.cmd run test:workflow`

Expected: FAIL because standard faction/parity rules still run.

- [ ] **Step 3: Add the mode-specific win function before standard checks**

```ts
function checkWolfEscapeWin(agents: WerewolfAgent[], day: number): WinResult {
  const alive = agents.filter((agent) => agent.alive);
  const protectedWolves = alive.filter((agent) => ['tamed_werewolf', 'thick_wolf'].includes(getRoleId(agent)));
  if (!protectedWolves.length) return { winner: 'hunters', winReason: `第 ${day} 天，受保护狼人全部出局，猎人阵营胜利。` };
  if (!alive.some((agent) => getRoleId(agent) === 'escape_hunter')) {
    return { winner: 'good', winReason: `第 ${day} 天，猎人全部出局，护狼阵营胜利。` };
  }
  return { winner: null, winReason: '' };
}
```

At the top of `checkWin` and `checkDayWin`, return this result when `modeConfig.id === 'wolf-escape-10'`. In `resolveSeerFactionResult`, return `狼人` for `escape_hunter`. Keep `shootOnDeath` action-based eligibility so the dedicated role reuses the existing hunter stage; ensure poison reasons remain disabled.

- [ ] **Step 4: Run workflow tests and verify winner, Seer, and death shot pass**

Run: `pnpm.cmd run test:workflow`

Expected: custom winner and Seer tests pass; the existing Hunter tests remain green.

---

### Task 5: Scoped Events, View Policy, And Presentation

**Files:**
- Modify: `packages/shared/types/gameEvent.ts`
- Modify: `packages/shared/constants/channelMaps.ts`
- Modify: `packages/server/modules/werewolf/handlers/actionChannel.ts`
- Modify: `packages/server/modules/werewolf/handlers/actionWindowHandler.ts`
- Modify: `packages/server/modules/werewolf/actionPhases.ts`
- Modify: `packages/server/modules/werewolf/presentation.ts`
- Modify: `packages/server/modules/werewolf/views/viewPolicy.ts`
- Modify: `packages/server/modules/werewolf/audienceStream.ts`
- Modify: `tests/unit/werewolfChannelGuard.test.ts`

**Interfaces:**
- Consumes: `resolveActionChannel`, `GameEventType`, scoped view filtering, and existing phase presentation.
- Produces: event types `escape-hunter-speech`, `escape-hunter-vote`, `escape-hunter-hunt`, `thick-wolf-armor` and scope `escape_hunters`.

- [ ] **Step 1: Write the failing scope test**

```ts
test('escape hunter private events stay inside escape_hunters scope', () => {
  assert.deepEqual(resolveActionChannel('escape_hunter_vote'), {
    channel: CHANNEL_TYPES.SCOPE,
    scopeKey: 'escape_hunters',
  });
});
```

- [ ] **Step 2: Run unit tests and verify the scope assertion fails**

Run: `pnpm.cmd run test:unit`

Expected: FAIL because the new action has no channel mapping.

- [ ] **Step 3: Add shared event and scope mappings**

```ts
// GameEventType additions
| 'escape-hunter-speech'
| 'escape-hunter-vote'
| 'escape-hunter-hunt'
| 'thick-wolf-armor'
```

```ts
escape_hunter_speech: 'escape_hunters',
escape_hunter_vote: 'escape_hunters',
escape_hunter: 'escape_hunters',
```

Allow player views with faction `hunters` or role `escape_hunter` to match `escape_hunters`; expose dedicated team fields only to that scope and god view. Add action-phase messages and map completed action events to the new event names.

- [ ] **Step 4: Run unit and workflow tests**

Run: `pnpm.cmd run test:unit`

Run: `pnpm.cmd run test:workflow`

Expected: scope, presentation, and existing visibility tests pass.

---

### Task 6: Client State, Badges, Armor Animation, And Winner Copy

**Files:**
- Modify: `tests/unit/werewolfClientDisplayState.test.ts`
- Modify: `packages/client/src/types/werewolf.ts`
- Modify: `packages/client/src/types/game.ts`
- Modify: `packages/client/src/types/player.ts`
- Modify: `packages/client/src/features/werewolf/constants.tsx`
- Modify: `packages/client/src/features/werewolf/utils/gameState.ts`
- Modify: `packages/client/src/features/werewolf/werewolfUtils.tsx`
- Modify: `packages/client/src/features/werewolf/components/RoundProgressPanel/index.tsx`
- Modify: `packages/client/src/features/werewolf/components/RoundProgressPanel/index.css`

**Interfaces:**
- Consumes: serialized `escapeHunter*`, `thickWolfArmorBreak`, `thickWolfHuntHits`, and winner `hunters`.
- Produces: merged client round state, role labels/icons, hunt target highlight, armor-break badge/animation, and winner label.

- [ ] **Step 1: Write the failing client merge test**

```ts
test('client merges escape hunter hunt and thick wolf armor events', () => {
  const initial = { rounds: [{ day: 1, night: {} }] } as never;
  const hunted = mergeWerewolfEventIntoGame(initial, {
    type: 'escape-hunter-hunt',
    day: 1,
    escapeHunterTarget: 4,
  } as never);
  const armored = mergeWerewolfEventIntoGame(hunted, {
    type: 'thick-wolf-armor',
    day: 1,
    thickWolfArmorBreak: { targetId: 4 },
  } as never);
  assert.equal((armored.rounds?.[0] as any).night.escapeHunterTarget, 4);
  assert.equal((armored.rounds?.[0] as any).night.thickWolfArmorBreak.targetId, 4);
});
```

- [ ] **Step 2: Run unit tests and verify the client merge test fails**

Run: `pnpm.cmd run test:unit`

Expected: FAIL because the event merge cases and types are absent.

- [ ] **Step 3: Add minimal client fields and rendering**

```ts
escapeHunterIds?: Array<string | number>;
escapeHunterSpeechOrder?: Array<string | number>;
escapeHunterSpeeches?: Array<{ playerId?: string | number; text?: string }>;
escapeHunterChoices?: Record<string, string | number>;
escapeHunterVoteTally?: Record<string, number>;
escapeHunterTarget?: string | number | null;
thickWolfArmorBreak?: { targetId?: string | number } | null;
```

Add `thickWolfHuntHits?: number` to player snapshots. Reuse the existing target-highlight classes for `escape-hunter-hunt`; add one CSS keyframe/class for the armor-break pulse and a compact shield badge. Map `hunters` to `猎人阵营胜利`.

- [ ] **Step 4: Run client type-check and unit tests**

Run: `pnpm.cmd --filter @ai-presenter/client run check`

Run: `pnpm.cmd run test:unit`

Expected: client check and the new merge test pass.

---

### Task 7: Debug Workflow, Documentation, And Final Verification

**Files:**
- Modify: `tests/workflow/werewolfDebugActions.test.ts`
- Modify: `tests/workflow/werewolfWorkflowStatus.test.ts`
- Modify: `packages/server/modules/werewolf/debugActions.ts`
- Modify: `docs/project-server.md`
- Modify: `docs/project-workflow.md`
- Modify: `docs/project-client.md`
- Modify: `docs/project-shared.md`
- Modify: `TODO.md`

**Interfaces:**
- Consumes: action types `escape_hunter_speech` and `escape_hunter_vote`, complete mode state, and existing debug runner.
- Produces: legal mandatory debug votes, a completed debug-mode match path, and synchronized project documentation.

- [ ] **Step 1: Write failing debug action and workflow tests**

```ts
test('debug mode creates legal escape hunter votes', () => {
  const hunters = [
    actor(1, 'hunters', ['hunterHunt'], { role: 'escape_hunter' }),
    actor(2, 'hunters', ['hunterHunt'], { role: 'escape_hunter' }),
    actor(3, 'hunters', ['hunterHunt'], { role: 'escape_hunter' }),
  ];
  const targets = [actor(4, 'good', [], { role: 'thick_wolf' }), actor(5, 'good', [], { role: 'villager' })];
  for (const hunter of hunters) {
    const result = buildDebugAction({ actionType: 'escape_hunter_vote', actor: hunter, agents: [...hunters, ...targets], round: createRound(1) } as never);
    assert.ok([4, 5].includes(Number(result.payload.target)));
  }
});
```

Add a workflow-status assertion that the 10-player debug configuration creates both Escape Hunter steps and reaches night resolution without a missing actor/action error.

- [ ] **Step 2: Run workflow tests and verify debug assertions fail**

Run: `pnpm.cmd run test:workflow`

Expected: FAIL because debug payloads for the new action types are absent.

- [ ] **Step 3: Implement mandatory legal debug payloads**

```ts
if (actionType === 'escape_hunter_speech') {
  return { payload: { text: `猎人${actor.id}确认本夜目标。`, speech: `猎人${actor.id}确认本夜目标。` } };
}
if (actionType === 'escape_hunter_vote') {
  const candidates = agents.filter((item) => item.alive && item.faction !== 'hunters');
  const target = pickRandom(candidates);
  return { payload: { target: target?.id || null, reason: 'debug-escape-hunter-vote' } };
}
```

Do not call the optional special-skill probability helper for this mandatory faction action.

- [ ] **Step 4: Update project documentation**

Document the 10-player lineup, dedicated factions, shared hunt, armor, winner values, scoped events, client animation state, unchanged APIs/database, and mark mode 29 as implemented in `TODO.md`.

- [ ] **Step 5: Run focused and cross-package verification**

Run:

```powershell
pnpm.cmd run test:unit
pnpm.cmd run test:workflow
pnpm.cmd run check:shared
pnpm.cmd run check:server
pnpm.cmd --filter @ai-presenter/client run check
git diff --check
```

Expected: all new mode-29 assertions pass. Any unrelated pre-existing failure is reported with its exact file and message; no mode-29 failure is hidden.

- [ ] **Step 6: Run one debug-mode smoke match**

Start the existing server/client development commands only if no server is already running, select `狼狼大逃杀（10人）`, enable debug mode, and confirm these observable checkpoints:

```text
10 players assigned
3 Escape Hunters receive private speech and vote windows
exactly 1 shared hunt target is selected
Thick Wolf first hunt produces armor-break state without death
the match advances through day/night without a stuck action window
```

Record the localhost URL and observed result in the completion report.
