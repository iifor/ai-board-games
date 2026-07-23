# Shadow Seer Mode Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task in the current task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the official `shadow-seer-12` Werewolf mode with two independently acting seer identities, server-authoritative inverted Shadow Seer results, and per-player private delivery.

**Architecture:** Keep `shadow_seer` as the real server role and reuse the existing `inspectFaction`/`seer_check` workflow. Put faction-result calculation in one focused server helper used by both the legacy reducer and GameEngine projection, then alias only the player-facing role boundary to `seer`. Preserve the existing single-seer field while adding canonical multi-check records and route every result through `player:<actorId>`.

**Tech Stack:** TypeScript, Node.js built-in test runner, pnpm workspaces, existing Werewolf reducer/GameEngine bridge, EventBus, projection, TTS/ACK/playback pipeline.

## Global Constraints

- Mode ID is exactly `shadow-seer-12`; display name is `灯影预言家（12人）`.
- Lineup is `werewolf × 3 + wolf_king + seer + witch + guard + knight + villager × 3 + shadow_seer`.
- `shadow_seer` is `faction: "good"` and `roleType: "villager"`.
- The real server role remains `shadow_seer`; player prompts and player-private views must show only `seer` / `预言家`.
- True Seer receives the server-derived faction; Shadow Seer receives its inverse.
- Never trust `payload.result` or other model-provided faction text.
- Both living `inspectFaction` actors act independently during the same `seer_check` step.
- Each private result uses `channel: "scope"` and `scopeKey: "player:<actorId>"`.
- No prompt may designate fake seers, require sheriff signup, force claims, or prescribe strategy.
- No database schema, REST API, WebSocket control protocol, dependency, or dedicated Shadow Seer workflow is added.
- Existing single-seer modes, Wolf King, Knight, Witch, Guard, sheriff, TTS/ACK, live playback, and replay behavior remain compatible.

---

## File Map

**Create**

- `packages/server/modules/werewolf/seerChecks.ts` — single source of truth for target substitution, special-role faction results, Shadow Seer inversion, and check-history upsert.
- `tests/unit/werewolfShadowSeerVisibility.test.ts` — focused player/god projection and identity-leak regression tests.

**Modify**

- `packages/server/modules/werewolf-config/constants.ts` — register the role and 12-player mode.
- `packages/server/modules/werewolf/reducers.ts` — select all checkers and apply every server-calculated result.
- `packages/server/modules/werewolf/definition.ts` — make the GameEngine effect/projector use the same result calculator and multi-check state.
- `packages/server/modules/werewolf/actionEngineBridge.ts` — audit canonical `seerChecks` as well as the legacy field.
- `packages/server/modules/werewolf/utils.ts` — expose the player-facing Seer identity facade.
- `packages/server/modules/werewolf/prompts/system.ts` — build all role prompts from the private identity facade.
- `packages/server/modules/werewolf/prompts/context.ts` — show Shadow Seer the Seer label and only their own check history.
- `packages/server/modules/werewolf/views/viewPolicy.ts` — alias the viewer identity and project only that viewer's check.
- `packages/shared/utils/channelResolution.ts` — resolve `seer_check + actorId` to `player:<actorId>`.
- `packages/server/modules/werewolf/handlers/actionChannel.ts` — pass the optional actor ID to the shared resolver.
- `packages/server/modules/werewolf/handlers/channelGuard.ts` — enforce actor-specific Seer result channels.
- `packages/server/modules/werewolf/handlers/actionWindowHandler.ts` — create two action tasks, two private request/result events, and one public wake/close narration.
- `packages/server/modules/werewolf/interactionFeedbackTrace.ts` — record the server result under the actor's private scope.
- `packages/shared/types/gameEvent.ts` — add backward-compatible `actorId` to Seer result payloads.
- `packages/client/src/types/werewolf.ts` — type the singular compatibility record and canonical record array.
- `tests/unit/runUnitTests.cjs` — include the new focused visibility test in the full unit suite.
- `tests/unit/werewolfDefaultConfig.test.ts` — verify the exact role and lineup.
- `tests/unit/werewolfPromptContext.test.ts` — verify private identity and prompt history without Shadow Seer leakage.
- `tests/unit/werewolfChannelGuard.test.ts` — verify actor-specific channel enforcement.
- `tests/unit/werewolfInteractionFeedbackTrace.test.ts` — verify private Trace routing and server-derived result.
- `tests/unit/gameEngineActionEffect.test.ts` — verify actor-scoped `seer_checked`.
- `tests/unit/werewolfActionEngineBridge.test.ts` — verify two GameEngine-projected checks.
- `tests/workflow/werewolfReducers.test.ts` — verify actor selection, inversion, no overwrite, and single-mode compatibility.
- `tests/workflow/werewolfEffects.test.ts` — verify Shadow Seer counts as a civilian for side victory.
- `tests/workflow/werewolfDebugActions.test.ts` — verify debug first-night double checks through the reducer.
- `tests/workflow/werewolfFakeWorkflow.test.ts` — verify two action tasks and two independently scoped result events.
- `docs/project-server.md` — document role/mode seeding and lack of schema change.
- `docs/project-workflow.md` — document dual actor execution, authoritative result calculation, and event privacy.
- `docs/project-client.md` — document singular compatibility plus viewer-filtered multi-check state.
- `docs/project-admin.md` — document existing manager visibility and Trace semantics.
- `docs/project-shared.md` — document the additive Seer payload/state fields and private scope.

---

### Task 1: Register the Role and Mode

**Files:**

- Modify: `packages/server/modules/werewolf-config/constants.ts:42-209`
- Test: `tests/unit/werewolfDefaultConfig.test.ts`

**Interfaces:**

- Consumes: existing `mode()` and `role()` helpers.
- Produces: default role ID `shadow_seer` and mode ID `shadow-seer-12`, automatically upserted by the existing seed service.

- [ ] **Step 1: Write the failing default-config test**

Append:

```ts
test('default werewolf config includes shadow seer 12-player mode', () => {
  const shadowSeer = DEFAULT_WEREWOLF_ROLES.find((item) => item.id === 'shadow_seer');
  assert.equal(shadowSeer?.name, '灯影预言家');
  assert.equal(shadowSeer?.faction, 'good');
  assert.equal(shadowSeer?.roleType, 'villager');
  assert.equal(
    shadowSeer?.rule.actions.some((item) => item.action === 'inspectFaction'),
    true,
  );

  const mode = DEFAULT_WEREWOLF_MODES.find((item) => item.id === 'shadow-seer-12');
  assert.equal(mode?.name, '灯影预言家（12人）');
  assert.equal(totalPlayers('shadow-seer-12'), 12);
  assert.equal(roleCount('shadow-seer-12', 'werewolf'), 3);
  assert.equal(roleCount('shadow-seer-12', 'wolf_king'), 1);
  assert.equal(roleCount('shadow-seer-12', 'seer'), 1);
  assert.equal(roleCount('shadow-seer-12', 'shadow_seer'), 1);
  assert.equal(roleCount('shadow-seer-12', 'witch'), 1);
  assert.equal(roleCount('shadow-seer-12', 'guard'), 1);
  assert.equal(roleCount('shadow-seer-12', 'knight'), 1);
  assert.equal(roleCount('shadow-seer-12', 'villager'), 3);
});
```

- [ ] **Step 2: Run the focused test and confirm the missing config**

Run:

```powershell
pnpm.cmd run test:unit -- werewolfDefaultConfig.test.ts
```

Expected: FAIL because `shadow_seer` and `shadow-seer-12` do not exist.

- [ ] **Step 3: Add the minimum default role and mode**

Add the mode after the current highest 12-player mode:

```ts
mode('shadow-seer-12', '灯影预言家（12人）', [
  ['wolf_king', 1],
  ['werewolf', 3],
  ['seer', 1],
  ['shadow_seer', 1],
  ['witch', 1],
  ['guard', 1],
  ['knight', 1],
  ['villager', 3],
], 33),
```

Add the real role before `villager`:

```ts
role(
  'shadow_seer',
  '灯影预言家',
  'good',
  'villager',
  [{ trigger: 'night', action: 'inspectFaction', targetRule: 'alive-not-self' }],
  89,
),
```

Do not add a special action, workflow step, strategy field, database migration, or admin component.

- [ ] **Step 4: Run the focused config test**

Run:

```powershell
pnpm.cmd run test:unit -- werewolfDefaultConfig.test.ts
```

Expected: PASS.

- [ ] **Step 5: Commit**

```powershell
git add packages/server/modules/werewolf-config/constants.ts tests/unit/werewolfDefaultConfig.test.ts
git commit -m "feat: add shadow seer werewolf mode"
```

---

### Task 2: Make Check Calculation Server-Authoritative and Multi-Actor

**Files:**

- Create: `packages/server/modules/werewolf/seerChecks.ts`
- Modify: `packages/server/modules/werewolf/reducers.ts:382-436,1169-1249`
- Modify: `packages/server/modules/werewolf/definition.ts:97-158,274-294,372-413`
- Modify: `packages/server/modules/werewolf/actionEngineBridge.ts:126-193`
- Test: `tests/workflow/werewolfReducers.test.ts`
- Test: `tests/workflow/werewolfEffects.test.ts`
- Test: `tests/unit/werewolfActionEngineBridge.test.ts`

**Interfaces:**

- Consumes: real agent snapshots, current night state, actor ID, chosen target ID.
- Produces:

```ts
export interface SeerCheckRecord {
  actorId: number;
  target: number;
  result: '好人' | '狼人' | '无法验出结果';
  reason?: string | null;
}

export function resolveSeerCheckRecord(
  agents: SeerCheckAgent[],
  night: SeerCheckNight,
  actorId: unknown,
  targetId: unknown,
  reason?: unknown,
): SeerCheckRecord | null;

export function upsertSeerHistory(
  checks: Array<Record<string, unknown>>,
  day: number,
  check: SeerCheckRecord,
): Array<Record<string, unknown>>;
```

- [ ] **Step 1: Write failing reducer tests for two actors and inverted results**

Add:

```ts
test('seer check selects every inspector and stores independent authoritative results', () => {
  const round = createRound(1);
  const seer = actor(1, 'good', ['inspectFaction'], {
    role: 'seer',
    roleConfig: { id: 'seer', roleType: 'god', rule: { actions: [{ action: 'inspectFaction' }] } },
  });
  const shadowSeer = actor(2, 'good', ['inspectFaction'], {
    role: 'shadow_seer',
    roleConfig: { id: 'shadow_seer', roleType: 'villager', rule: { actions: [{ action: 'inspectFaction' }] } },
  });
  const wolf = actor(3, 'wolves', ['kill'], { role: 'werewolf' });
  const villager = actor(4, 'good', [], { role: 'villager' });
  const ctx = {
    agents: [seer, shadowSeer, wolf, villager],
    modeConfig: { id: 'shadow-seer-12', sheriff: {}, winCondition: 'side' },
    state: { rounds: [round] },
  };

  assert.deepEqual(
    getActorsForStep(
      ctx as never,
      { config: { day: 1, actionType: 'seer_check' } } as never,
      round as never,
    ).map((item: TestAgent) => item.id),
    [1, 2],
  );

  applyActionResults(
    ctx as never,
    { config: { day: 1, actionType: 'seer_check' } } as never,
    [
      { actorId: 1, payload: { target: 3, result: '好人', reason: 'true check' } },
      { actorId: 2, payload: { target: 3, result: '狼人', reason: 'shadow check' } },
    ],
  );

  assert.deepEqual(round.night.seerChecks, [
    { actorId: 1, target: 3, result: '狼人', reason: 'true check' },
    { actorId: 2, target: 3, result: '好人', reason: 'shadow check' },
  ]);
  assert.equal(round.night.seerCheck, undefined);
  assert.equal(seer.seerChecks[0].result, '狼人');
  assert.equal(shadowSeer.seerChecks[0].result, '好人');

  const secondRound = createRound(2);
  ctx.state.rounds.push(secondRound);
  applyActionResults(
    ctx as never,
    { config: { day: 2, actionType: 'seer_check' } } as never,
    [{ actorId: 2, payload: { target: 4, result: '好人' } }],
  );
  assert.equal(secondRound.night.seerCheck?.result, '狼人');
});
```

Update the existing single-seer assertion so the model value is deliberately wrong and the stored result is server-derived:

```ts
assert.deepEqual(round.night.seerCheck, {
  target: 1,
  result: '狼人',
  reason: '确认前置位',
});
```

Add a side-victory regression in `werewolfEffects.test.ts`:

```ts
test('shadow seer counts as a civilian for side victory', () => {
  const roster = getAliveRosterStats([
    { id: 1, alive: true, faction: 'wolves', canVote: true, role: 'werewolf' },
    {
      id: 2,
      alive: true,
      faction: 'good',
      canVote: true,
      role: 'shadow_seer',
      roleConfig: { id: 'shadow_seer', roleType: 'villager' },
    },
    {
      id: 3,
      alive: true,
      faction: 'good',
      canVote: true,
      role: 'seer',
      roleConfig: { id: 'seer', roleType: 'god' },
    },
  ]);

  assert.deepEqual(roster, { wolves: 1, gods: 1, villagers: 1, good: 2 });
});
```

- [ ] **Step 2: Run focused workflow tests and confirm current single-result behavior**

Run:

```powershell
pnpm.cmd run test:workflow
```

Expected: FAIL on actor selection, trusted model result, and missing `seerChecks`.

- [ ] **Step 3: Implement the shared result calculator**

Create `seerChecks.ts` with:

```ts
interface SeerCheckAgent {
  id: number | string;
  role?: string;
  faction?: string;
  deathDay?: number | null;
  wolfElderBrotherDeathDay?: number | null;
  spiritWolfLearnedRole?: string | null;
  roleConfig?: { id?: string };
}

interface SeerCheckNight {
  magicianSwap?: {
    firstTarget?: number | string | null;
    secondTarget?: number | string | null;
  } | null;
}

interface SeerCheckRecord {
  actorId: number;
  target: number;
  result: '好人' | '狼人' | '无法验出结果';
  reason?: string | null;
}

function resolveSeerCheckRecord(
  agents: SeerCheckAgent[],
  night: SeerCheckNight,
  actorIdValue: unknown,
  targetIdValue: unknown,
  reasonValue?: unknown,
): SeerCheckRecord | null {
  const actorId = Number(actorIdValue);
  const target = Number(targetIdValue);
  const actor = agents.find((item) => Number(item.id) === actorId);
  const actualTargetId = resolveSeerTarget(night, target);
  const actualTarget = agents.find((item) => Number(item.id) === actualTargetId);
  if (!actor || !target || !actualTarget) return null;

  const baseResult = resolveBaseResult(agents, actualTarget);
  const result = roleId(actor) === 'shadow_seer'
    ? invertResult(baseResult)
    : baseResult;
  const reason = String(reasonValue || '').trim().slice(0, 80);
  return {
    actorId,
    target,
    result,
    ...(reason ? { reason } : {}),
  };
}

function resolveSeerTarget(night: SeerCheckNight, target: number): number {
  const first = Number(night.magicianSwap?.firstTarget || 0);
  const second = Number(night.magicianSwap?.secondTarget || 0);
  if (target === first && second) return second;
  if (target === second && first) return first;
  return target;
}

function resolveBaseResult(
  agents: SeerCheckAgent[],
  target: SeerCheckAgent,
): SeerCheckRecord['result'] {
  const targetRole = roleId(target);
  if (targetRole === 'escape_hunter') return '狼人';
  if (targetRole === 'hidden_wolf') return '好人';
  if (targetRole === 'spirit_wolf' && target.spiritWolfLearnedRole === 'villager') return '好人';
  if (targetRole === 'wolf_younger_brother' && !wolfElderDeathDay(agents)) return '好人';
  if (target.faction === 'wolves') return '狼人';
  if (target.faction) return '好人';
  return '无法验出结果';
}

function invertResult(result: SeerCheckRecord['result']): SeerCheckRecord['result'] {
  if (result === '好人') return '狼人';
  if (result === '狼人') return '好人';
  return result;
}

function wolfElderDeathDay(agents: SeerCheckAgent[]): number | null {
  const elder = agents.find((item) => roleId(item) === 'wolf_elder_brother');
  const direct = Number(elder?.deathDay || 0);
  if (direct > 0) return direct;
  const younger = agents.find((item) => roleId(item) === 'wolf_younger_brother');
  const stored = Number(younger?.wolfElderBrotherDeathDay || 0);
  return stored > 0 ? stored : null;
}

function roleId(agent: SeerCheckAgent): string {
  return String(agent.role || agent.roleConfig?.id || '').toLowerCase();
}

function upsertSeerHistory(
  checks: Array<Record<string, unknown>>,
  day: number,
  check: SeerCheckRecord,
): Array<Record<string, unknown>> {
  const value = { day, target: check.target, result: check.result, reason: check.reason || null };
  const index = checks.findIndex((item) => Number(item.day) === day);
  if (index < 0) return [...checks, value];
  return checks.map((item, itemIndex) => itemIndex === index ? value : item);
}

export {
  resolveSeerCheckRecord,
  upsertSeerHistory,
};

export type {
  SeerCheckAgent,
  SeerCheckNight,
  SeerCheckRecord,
};
```

- [ ] **Step 4: Apply every reducer result without overwriting**

Import the shared calculator and extend the reducer-only night shape:

```ts
import {
  resolveSeerCheckRecord,
  upsertSeerHistory,
} from './seerChecks';
import type { SeerCheckAgent, SeerCheckRecord } from './seerChecks';

interface Night {
  // keep the existing fields
  seerCheck?: Omit<SeerCheckRecord, 'actorId'>;
  seerChecks?: SeerCheckRecord[];
}
```

Replace the `results[0]` implementation with:

```ts
function applySeerCheck(runtime: Runtime, round: Round, results: ActionResult[]): void {
  const checks = results
    .map((result) => resolveSeerCheckRecord(
      runtime.agents,
      round.night,
      result.actorId,
      result.payload.target,
      result.payload.reason,
    ))
    .filter((check): check is SeerCheckRecord => Boolean(check));

  round.night.seerChecks = checks;
  if (checks.length === 1) {
    const { actorId: _actorId, ...legacyCheck } = checks[0];
    round.night.seerCheck = legacyCheck;
  } else {
    delete round.night.seerCheck;
  }

  for (const check of checks) {
    const actor = runtime.agents.find((item) => Number(item.id) === check.actorId);
    if (!actor) continue;
    actor.seerChecks = upsertSeerHistory(actor.seerChecks || [], round.day, check);
  }
}
```

Change only the Seer selector:

```ts
if (actionType === 'seer_check') return actors('inspectFaction');
```

Keep every other `.slice(0, 1)` unchanged.

- [ ] **Step 5: Apply the same calculation in the GameEngine bridge**

Pass `context` into `createInspectEffect`, calculate from `context.state`, and never copy `action.payload.result`:

```ts
if (action.actionType === 'seer_check') {
  return [createInspectEffect(action, day, context)];
}
```

```ts
function createInspectEffect(
  action: DomainAction,
  day: number,
  context: Partial<CreateEffectsContext>,
): WorkflowEffect {
  const state = context.state || {};
  const round = ensureRound(state, day);
  const night = ensureNestedRecord(round, 'night');
  const check = resolveSeerCheckRecord(
    getStatePlayers(state) as SeerCheckAgent[],
    night,
    action.actorId,
    action.payload.target,
    action.payload.reason,
  );
  return {
    id: `${action.id}:inspect`,
    matchId: action.matchId,
    effectType: 'inspect',
    status: 'proposed',
    priority: 50,
    sourceActionId: action.id,
    causationId: action.id,
    correlationId: action.correlationId || action.id,
    payload: {
      sourceActionId: action.id,
      actionType: action.actionType,
      actorId: action.actorId,
      day,
      target: Number(action.payload.target),
      result: check?.result || '无法验出结果',
      decisionReason: check?.reason || null,
    },
  };
}
```

In `projectWerewolfStateFromEvent`, append an actor-bearing check, retain the singular field only for one record, and upsert only the actor's history:

```ts
if (event.type === 'seer_checked') {
  const result = String(event.payload.result || '无法验出结果');
  const reason = normalizeDecisionReason(event.payload.reason);
  const check = { actorId, target, result, ...(reason ? { reason } : {}) };
  const previous = Array.isArray(night.seerChecks)
    ? night.seerChecks as Record<string, unknown>[]
    : [];
  const checks = [
    ...previous.filter((item) => Number(item.actorId) !== actorId),
    check,
  ].sort((left, right) => Number(left.actorId) - Number(right.actorId));
  night.seerChecks = checks;
  if (checks.length === 1) {
    night.seerCheck = { target, result, ...(reason ? { reason } : {}) };
  } else {
    delete night.seerCheck;
  }
  upsertPlayerRecord(next, actorId, (player) => {
    player.seerChecks = upsertSeerHistory(
      Array.isArray(player.seerChecks) ? player.seerChecks as Record<string, unknown>[] : [],
      day,
      check as SeerCheckRecord,
    );
  });
}
```

Add `seerChecks` to `snapshotNightActionState().night` so legacy/GameEngine audit compares both records:

```ts
seerChecks: night.seerChecks || [],
```

- [ ] **Step 6: Run reducer and bridge tests**

Run:

```powershell
pnpm.cmd run test:workflow
pnpm.cmd run test:unit -- werewolfActionEngineBridge.test.ts gameEngineActionEffect.test.ts
```

Expected: PASS; single-seer tests retain `night.seerCheck`, while the new mode stores two `night.seerChecks`.

- [ ] **Step 7: Commit**

```powershell
git add packages/server/modules/werewolf/seerChecks.ts packages/server/modules/werewolf/reducers.ts packages/server/modules/werewolf/definition.ts packages/server/modules/werewolf/actionEngineBridge.ts tests/workflow/werewolfReducers.test.ts tests/workflow/werewolfEffects.test.ts tests/unit/werewolfActionEngineBridge.test.ts
git commit -m "feat: resolve dual seer checks on server"
```

---

### Task 3: Hide the Real Shadow Seer Identity at Player Boundaries

**Files:**

- Modify: `packages/server/modules/werewolf/utils.ts:446-464`
- Modify: `packages/server/modules/werewolf/prompts/system.ts:134-286`
- Modify: `packages/server/modules/werewolf/prompts/context.ts:150-186`
- Modify: `packages/server/modules/werewolf/views/viewPolicy.ts:110-175,178-312`
- Create: `tests/unit/werewolfShadowSeerVisibility.test.ts`
- Modify: `tests/unit/runUnitTests.cjs:9-53`
- Test: `tests/unit/werewolfPromptContext.test.ts`

**Interfaces:**

- Consumes: a real player/agent snapshot and optional mode config.
- Produces:

```ts
export interface PlayerRoleIdentity {
  role: string;
  roleLabel: string;
  roleConfig: RoleConfigFull;
}

export function isSeerIdentity(agent: AgentForLabel): boolean;
export function getPlayerRoleIdentity(
  agent: AgentForLabel,
  modeConfig?: ModeConfigForRole,
): PlayerRoleIdentity;
```

- [ ] **Step 1: Write failing prompt tests**

Extend imports:

```ts
import {
  buildLightweightSystemPrompt,
  buildSystemPrompt,
} from '../../packages/server/modules/werewolf/prompts/system';
```

Add:

```ts
test('shadow seer private prompts expose only the seer identity and own checks', () => {
  const shadowSeer = player(2, 'shadow_seer', 'good', {
    roleLabel: '灯影预言家',
    roleConfig: {
      id: 'shadow_seer',
      name: '灯影预言家',
      faction: 'good',
      roleType: 'villager',
      rule: { actions: [{ action: 'inspectFaction' }] },
    },
    seerChecks: [{ day: 1, target: 1, result: '好人' }],
  });
  const players = [player(1, 'werewolf', 'wolves'), shadowSeer];
  const modeConfig = {
    id: 'shadow-seer-12',
    name: '灯影预言家（12人）',
    roleMap: {
      seer: {
        id: 'seer',
        name: '预言家',
        faction: 'good',
        roleType: 'god',
        responsibility: '查验玩家阵营',
        ability: '每晚查验一名玩家',
        rule: { actions: [{ action: 'inspectFaction' }] },
      },
    },
  };
  const skillRegistry = {
    get: (action: string) => action === 'inspectFaction'
      ? { prompt: '每晚可以查验一名存活玩家。' }
      : null,
  };

  const basePrompt = buildSystemPrompt(
    shadowSeer as never,
    [1],
    skillRegistry,
    players as never,
    modeConfig,
  );
  const actionPrompt = buildWerewolfActionPrompt({
    runtime: {
      ...runtime(players, [{ day: 2, night: {} }]),
      modeConfig,
    } as never,
    round: { day: 2, night: {} } as never,
    actor: shadowSeer as never,
    actionType: 'day_speech',
  });

  assert.match(basePrompt, /你的身份是：预言家/);
  assert.match(basePrompt, /每晚可以查验一名存活玩家/);
  assert.doesNotMatch(basePrompt, /灯影预言家|shadow_seer/);
  assert.match(actionPrompt, /身份：预言家/);
  assert.match(actionPrompt, /第1晚查验1号，结果：好人/);
  assert.doesNotMatch(actionPrompt, /灯影预言家|shadow_seer/);
  assert.doesNotMatch(buildLightweightSystemPrompt(shadowSeer as never, players as never), /灯影预言家|shadow_seer/);
});
```

- [ ] **Step 2: Write failing projection tests**

Create `werewolfShadowSeerVisibility.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createProjectionContext,
  projectWerewolfEvent,
  projectWerewolfGame,
} from '../../packages/server/modules/werewolf/views/viewPolicy';

const game = {
  players: [
    { id: 1, role: 'seer', roleLabel: '预言家', faction: 'good', alive: true, seerChecks: [{ day: 1, target: 3, result: '狼人' }] },
    { id: 2, role: 'shadow_seer', roleLabel: '灯影预言家', faction: 'good', alive: true, seerChecks: [{ day: 1, target: 3, result: '好人' }] },
    { id: 3, role: 'werewolf', roleLabel: '狼人', faction: 'wolves', alive: true, seerChecks: [] },
  ],
  rounds: [{
    day: 1,
    night: {
      seerChecks: [
        { actorId: 1, target: 3, result: '狼人' },
        { actorId: 2, target: 3, result: '好人' },
      ],
    },
  }],
};

test('shadow seer player view aliases identity and keeps only its own check', () => {
  const context = createProjectionContext(game, {
    mode: 'player',
    viewerPlayerId: 2,
  });
  const projected = projectWerewolfGame(game, context);
  const players = projected.players as Array<Record<string, unknown>>;
  const night = (projected.rounds as Array<{
    night: {
      seerCheck?: Record<string, unknown> | null;
      seerChecks: Array<Record<string, unknown>>;
    };
  }>)[0].night;

  assert.equal(context.viewerRoleId, 'seer');
  assert.equal(players[1].role, 'seer');
  assert.equal(players[1].roleLabel, '预言家');
  assert.deepEqual(players[1].seerChecks, [{ day: 1, target: 3, result: '好人' }]);
  assert.deepEqual(night.seerChecks, [
    { actorId: 2, target: 3, result: '好人' },
  ]);
  assert.deepEqual(night.seerCheck, {
    target: 3,
    result: '好人',
  });
  assert.equal(JSON.stringify(projected).includes('shadow_seer'), false);
  assert.equal(JSON.stringify(projected).includes('灯影预言家'), false);
});

test('god view retains the real role and both check records', () => {
  const projected = projectWerewolfGame(game, { mode: 'god' });
  const players = projected.players as Array<Record<string, unknown>>;
  const night = (projected.rounds as Array<{
    night: { seerChecks: Array<Record<string, unknown>> };
  }>)[0].night;
  assert.equal(players[1].role, 'shadow_seer');
  assert.equal(players[1].roleLabel, '灯影预言家');
  assert.equal(night.seerChecks.length, 2);
});

test('private check events are invisible to the other seer and public replay viewer', () => {
  const event = {
    type: 'seer-check',
    channel: 'scope',
    scopeKey: 'player:2',
    seerCheck: { actorId: 2, target: 3, result: '好人' },
  };
  assert.ok(projectWerewolfEvent(event, {
    mode: 'player',
    viewerPlayerId: 2,
    viewerRoleId: 'seer',
    viewerFaction: 'good',
  }));
  assert.equal(projectWerewolfEvent(event, {
    mode: 'player',
    viewerPlayerId: 1,
    viewerRoleId: 'seer',
    viewerFaction: 'good',
  }), null);
  assert.equal(projectWerewolfEvent(event, {
    mode: 'player',
    viewerPlayerId: 3,
    viewerRoleId: 'werewolf',
    viewerFaction: 'wolves',
  }), null);
  assert.equal(projectWerewolfEvent(event, {
    mode: 'player',
  }), null);
});
```

Register `werewolfShadowSeerVisibility.test.ts` in `runUnitTests.cjs`.

- [ ] **Step 3: Run the focused prompt and projection tests**

Run:

```powershell
pnpm.cmd run test:unit -- werewolfPromptContext.test.ts werewolfShadowSeerVisibility.test.ts
```

Expected: FAIL because the real role currently appears in prompts and the viewer projection.

- [ ] **Step 4: Add one player-role identity facade to existing utilities**

Add beside `getRoleLabel`:

```ts
interface PlayerRoleIdentity {
  role: string;
  roleLabel: string;
  roleConfig: RoleConfigFull;
}

function isSeerIdentity(agent: AgentForLabel): boolean {
  const roleId = String(agent?.role || (agent?.roleConfig as RoleConfigFull | undefined)?.id || '').toLowerCase();
  return roleId === 'seer' || roleId === 'shadow_seer';
}

function getPlayerRoleIdentity(
  agent: AgentForLabel,
  modeConfig: ModeConfigForRole = {},
): PlayerRoleIdentity {
  const actualRoleId = String(agent?.role || (agent?.roleConfig as RoleConfigFull | undefined)?.id || '');
  const role = actualRoleId === 'shadow_seer' ? 'seer' : actualRoleId;
  const roleConfig = actualRoleId === 'shadow_seer'
    ? getRoleConfig(modeConfig, 'seer')
    : (agent?.roleConfig as RoleConfigFull | undefined) || getRoleConfig(modeConfig, role);
  return {
    role,
    roleLabel: roleConfig.name || agent?.roleLabel || role,
    roleConfig,
  };
}
```

Export the interface and functions.

- [ ] **Step 5: Use the facade in every private prompt path**

In `buildSystemPrompt`, `buildLightweightSystemPrompt`, and `appendOpeningPrivateMemory`, replace direct use of `agent.roleConfig`, `agent.role`, and `agent.roleLabel` with `getPlayerRoleIdentity(agent, modeConfig)`.

In `buildSeerCheckPrivateMemory`, replace the role equality:

```ts
if (!isSeerIdentity(agent) || !Array.isArray(agent.seerChecks) || !agent.seerChecks.length) return '';
```

In `prompts/context.ts`, build the first private line with the facade and treat either real role as a Seer:

```ts
const identity = getPlayerRoleIdentity(actor);
const lines = [
  `你是${getSeatNumber(actor.id, agents)}号；身份：${identity.roleLabel}；阵营：${actor.faction || '未知'}；状态：${actor.alive === false ? '已出局' : '存活'}。`,
];
if (isSeerIdentity(actor)) lines.push(formatSeerChecks(actor, agents));
```

Do not change sheriff, claim, speech, or strategy text.

- [ ] **Step 6: Alias only the viewer boundary and filter round checks**

In `createAudienceSession` and `createProjectionContext`, store `getPlayerRoleIdentity(viewer).role` as `viewerRoleId`.

In `projectPlayer`, retain the actual role for god view; for the viewer return the aliased role/label and only the viewer's `player.seerChecks`.

Add `seerChecks?: unknown[]` to `NightData`. In player projection:

```ts
const viewerCheck = (Array.isArray(night.seerChecks) ? night.seerChecks : [])
  .find((item) => Number((item as { actorId?: unknown }).actorId) === Number(context.viewerPlayerId));
const privateSeerCheck = viewerRoleId === 'seer'
  ? viewerCheck || night.seerCheck || null
  : null;
```

Return:

```ts
seerCheck: privateSeerCheck
  ? withoutActorId(privateSeerCheck)
  : null,
seerChecks: viewerRoleId === 'seer' && viewerCheck ? [viewerCheck] : [],
```

In god projection, include:

```ts
seerCheck: night.seerCheck || null,
seerChecks: Array.isArray(night.seerChecks) ? night.seerChecks : [],
```

Implement `withoutActorId()` locally in `viewPolicy.ts`; it only removes `actorId` from the singular compatibility field.

- [ ] **Step 7: Run focused identity tests**

Run:

```powershell
pnpm.cmd run test:unit -- werewolfPromptContext.test.ts werewolfShadowSeerVisibility.test.ts
```

Expected: PASS with no `shadow_seer` or “灯影预言家” in player-private output.

- [ ] **Step 8: Commit**

```powershell
git add packages/server/modules/werewolf/utils.ts packages/server/modules/werewolf/prompts/system.ts packages/server/modules/werewolf/prompts/context.ts packages/server/modules/werewolf/views/viewPolicy.ts tests/unit/werewolfPromptContext.test.ts tests/unit/werewolfShadowSeerVisibility.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat: mask shadow seer player identity"
```

---

### Task 4: Route Every Check to Its Actor

**Files:**

- Modify: `packages/shared/utils/channelResolution.ts:16-28`
- Modify: `packages/server/modules/werewolf/handlers/actionChannel.ts:1-18`
- Modify: `packages/server/modules/werewolf/handlers/channelGuard.ts:31-56`
- Modify: `packages/server/modules/werewolf/handlers/actionWindowHandler.ts:74-258,435-579,581-606,887-1025`
- Modify: `packages/server/modules/werewolf/definition.ts:274-294`
- Modify: `packages/server/modules/werewolf/interactionFeedbackTrace.ts:44-70`
- Test: `tests/unit/werewolfChannelGuard.test.ts`
- Test: `tests/unit/werewolfInteractionFeedbackTrace.test.ts`
- Test: `tests/unit/gameEngineActionEffect.test.ts`
- Test: `tests/unit/werewolfActionEngineBridge.test.ts`
- Test: `tests/workflow/werewolfFakeWorkflow.test.ts`

**Interfaces:**

- Consumes: `actionType` and optional `actorId`.
- Produces:

```ts
export function resolveActionChannel(
  actionType: string,
  actorId?: number | string | null,
): ChannelInfo;
```

- [ ] **Step 1: Write failing channel and Trace tests**

Change the Seer guard tests to include the actor:

```ts
const guarded = guardWerewolfWorkflowEventChannel({
  workflowEvent: 'werewolf_phase_result',
  payload: {
    actionType: 'seer_check',
    actorId: 3,
    seerResult: '狼人',
    target: 8,
  },
  channel: 'public',
});

assert.equal(guarded.channel, 'scope');
assert.equal(guarded.scopeKey, 'player:3');

const missingActor = guardWerewolfWorkflowEventChannel({
  workflowEvent: 'werewolf_phase_result',
  payload: {
    actionType: 'seer_check',
    seerResult: '狼人',
    target: 8,
  },
  channel: 'public',
});

assert.equal(missingActor.channel, 'system');
assert.equal(missingActor.scopeKey, undefined);
assert.equal(missingActor.invariantIssues?.[0].code, 'PRIVATE_ACTION_ACTOR_MISSING');
```

Change the Trace test to prove the raw model result is ignored:

```ts
const event = buildWerewolfInteractionFeedbackEvent({
  matchId: 'match-trace',
  actionType: 'seer_check',
  actorId: 3,
  payload: { day: 1, target: '8', result: '好人' },
  round: {
    night: {
      seerChecks: [{ actorId: 3, target: 8, result: '狼人' }],
    },
  },
  phase: 'night',
});

assert.equal(event?.result, '狼人');
assert.equal(event?.scopeKey, 'player:3');
assert.deepEqual(event?.visibleTo, ['player:3', 'system']);
```

Update GameEngine assertions:

```ts
assert.equal(events[0].scopeKey, `player:${action.actorId}`);
```

- [ ] **Step 2: Extend the fake workflow test to two checkers**

Replace the existing single Seer fixture with:

```ts
state.players = [
  player(1, 'werewolf', 'wolves', ['kill']),
  player(2, 'villager', 'good', []),
  player(4, 'seer', 'good', ['inspectFaction']),
  player(5, 'shadow_seer', 'good', ['inspectFaction'], {
    roleConfig: {
      id: 'shadow_seer',
      name: '灯影预言家',
      faction: 'good',
      roleType: 'villager',
      rule: { actions: [{ action: 'inspectFaction' }] },
    },
  }),
];
```

Complete both generated tasks:

```ts
assert.deepEqual(tasks.map((task) => Number(task.playerId)).sort((a, b) => a - b), [4, 5]);
for (const task of tasks) {
  task.status = 'succeeded';
  task.result = {
    payload: {
      target: 1,
      result: Number(task.playerId) === 4 ? '好人' : '狼人',
      reason: `check-${task.playerId}`,
    },
  };
}
```

Assert independent delivery:

```ts
const requested = delivered.filter((event) => event.type === 'action-requested');
assert.deepEqual(
  requested.map((event) => event.scopeKey).sort(),
  ['player:4', 'player:5'],
);
for (const event of requested) {
  const actorIds = (event.payload as { actorIds?: number[] }).actorIds || [];
  assert.equal(actorIds.length, 1);
}

const checks = delivered.filter((event) => event.type === 'seer-check');
assert.deepEqual(
  checks.map((event) => event.scopeKey).sort(),
  ['player:4', 'player:5'],
);
assert.equal(
  (checks.find((event) => event.scopeKey === 'player:4')?.payload as { seerCheck?: { result?: string } }).seerCheck?.result,
  '狼人',
);
assert.equal(
  (checks.find((event) => event.scopeKey === 'player:5')?.payload as { seerCheck?: { result?: string } }).seerCheck?.result,
  '好人',
);
```

- [ ] **Step 3: Run focused privacy tests**

Run:

```powershell
pnpm.cmd run test:unit -- werewolfChannelGuard.test.ts werewolfInteractionFeedbackTrace.test.ts gameEngineActionEffect.test.ts werewolfActionEngineBridge.test.ts
pnpm.cmd run test:workflow
```

Expected: FAIL while Seer events still use shared `scopeKey: "seer"` and only the first result is presented.

- [ ] **Step 4: Add actor-aware channel resolution**

In shared channel resolution:

```ts
import { CHANNEL_TYPES, SCOPE_KEYS } from '../types/channelTypes';

export function resolveActionChannel(
  actionType: string,
  actorId?: number | string | null,
): ChannelInfo {
  if (actionType === 'seer_check' && actorId !== null && actorId !== undefined && String(actorId)) {
    return {
      channel: CHANNEL_TYPES.SCOPE,
      scopeKey: SCOPE_KEYS.player(actorId),
    };
  }
  const scopeKey = SCOPE_ACTION_MAP[actionType];
  if (scopeKey) return { channel: CHANNEL_TYPES.SCOPE, scopeKey };
  return { channel: CHANNEL_TYPES.PUBLIC };
}
```

Keep the old no-actor resolution (`scope:seer`) only for generic legacy callers that carry no result or target. Guarded request/result events and any payload containing private Seer data must pass `actorId`; otherwise they fail closed to `system`.

Update the server wrapper:

```ts
function resolveActionChannel(
  actionType: string,
  actorId?: number | string | null,
): ActionChannelInfo {
  const { channel, scopeKey } = resolveChannel(actionType, actorId);
  return scopeKey ? { channel, scopeKey } : { channel };
}
```

Update the guard:

```ts
const GUARDED_PRIVATE_EVENTS = new Set([
  'werewolf_action_requested',
  'werewolf_action_submitted',
  'werewolf_phase_result',
]);

if (
  actionType === 'seer_check'
  && (input.payload.actorId === null || input.payload.actorId === undefined)
  && (GUARDED_PRIVATE_EVENTS.has(input.workflowEvent) || hasPrivatePayload(input.payload))
) {
  return {
    channel: CHANNEL_TYPES.SYSTEM,
    invariantIssues: [{
      code: 'PRIVATE_ACTION_ACTOR_MISSING',
      message: `${input.workflowEvent}:seer_check requires actorId`,
    }],
  };
}

const expected = resolveActionChannel(actionType, input.payload.actorId as number | string | undefined);
```

- [ ] **Step 5: Emit actor-private request events**

In `openActionWindow`, derive one recipient for every Seer checker and one shared recipient for every existing action:

```ts
const actionType = step.config.actionType || '';
const recipients: Array<{ id: number } | null> = actionType === 'seer_check'
  ? actors as Array<{ id: number }>
  : [null];
```

Replace the single traditional workflow event with:

```ts
const events = recipients.map((recipient) => {
  const actorId = recipient?.id;
  const channelInfo = resolveActionChannel(actionType, actorId);
  const scopedWindow = {
    ...cloneActionWindow(window),
    actorIds: actorId === undefined ? [...window.actorIds] : [actorId],
  };

  return createWerewolfEvent(
    match,
    step,
    nextState as Record<string, unknown>,
    'werewolf_action_requested',
    actionRequestedMessage(actionType, step.config.day),
    {
      actionType,
      ...(actorId === undefined ? {} : { actorId }),
      actionWindow: scopedWindow,
    },
    {
      ...channelInfo,
      idempotencyKey: `${match.id}:${step.id}:werewolf_action_requested:${actorId || 'shared'}`,
    },
  );
});
```

Replace the single EventBus publication with:

```ts
for (const recipient of recipients) {
  const actorId = recipient?.id;
  const channelInfo = resolveActionChannel(actionType, actorId);
  const scopedWindow = {
    ...cloneActionWindow(window),
    actorIds: actorId === undefined ? [...window.actorIds] : [actorId],
  };

  publishGameEvent(runtime.eventBus, runtime.gameEventBuilder, (builder) => {
    builder.setStep(step.id);
    builder.setPhase((step.config.phase as 'night' | 'day' | 'postgame') || 'night');
    builder.setDay(step.config.day || 1);
    return builder.buildActionRequested(
      actionType,
      actorId === undefined
        ? (actors as Array<{ id: number }>).map((actor) => actor.id)
        : [actorId],
      {
        actionWindow: scopedWindow,
        channel: channelInfo.channel,
        scopeKey: channelInfo.scopeKey,
      },
    );
  });
}
```

For all other actions, retain the existing single event unchanged.

The public `werewolf_phase_start` and public close narration remain one event and contain only `actionType` and message.

- [ ] **Step 6: Build and publish one phase context per check**

Add:

```ts
function buildPhaseContexts(
  actionType: string,
  results: ReducerActionResult[],
  round: Record<string, unknown>,
): Record<string, unknown>[] {
  if (actionType !== 'seer_check') return [buildPhaseContext(actionType, results, round)];
  const night = (round as { night?: { seerChecks?: Array<Record<string, unknown>> } }).night || {};
  const checks = Array.isArray(night.seerChecks) ? night.seerChecks : [];
  return results.map((result) => {
    const check = checks.find((item) => Number(item.actorId) === Number(result.actorId));
    return {
      actorId: result.actorId,
      target: check?.target,
      seerResult: check?.result || '无法验出结果',
      reason: check?.reason || null,
      seerCheck: check || null,
    };
  });
}
```

At completion:

```ts
const phaseContexts = buildPhaseContexts(
  step.config.actionType!,
  partialResults,
  completedRound,
);
for (const phaseContext of phaseContexts) {
  const messages = phaseConfig?.buildMessages(step.config.day || 1, phaseContext);
  const channel = step.config.actionType === 'seer_check'
    ? resolveActionChannel('seer_check', phaseContext.actorId as number)
    : resolvedChannel;
  publishScopedPhaseResultEvent(
    match,
    runtime,
    step,
    nextState as Record<string, unknown>,
    messages?.result || actionResolvedMessage(step.config.actionType, step.config.day),
    phaseContext,
    channel,
  );
  if (messages?.result) {
    completedEvents.push(createWerewolfEvent(
      match,
      step,
      nextState as Record<string, unknown>,
      'werewolf_phase_result',
      messages.result,
      { actionType: step.config.actionType, ...phaseContext },
      {
        ...channel,
        idempotencyKey: `${match.id}:${step.id}:werewolf_phase_result:${phaseContext.actorId || 'shared'}`,
      },
    ));
  }
}
```

Use only `phaseContexts[0]` to derive the one public close message. Do not publish an actor list or result in wake/close events.

- [ ] **Step 7: Scope GameEngine and Trace output to the actor**

In `createInspectResolver`:

```ts
const actorId = Number(effect.payload.actorId);
return [{
  id: `${effect.id}:seer_checked`,
  matchId: effect.matchId,
  type: 'seer_checked',
  channel: 'scope',
  scopeKey: `player:${actorId}`,
  actorId,
  causationId: effect.id,
  correlationId: effect.correlationId || effect.sourceActionId,
  idempotencyKey: `${effect.id}:seer_checked`,
  payload: {
    actorId,
    day: effect.payload.day,
    target: effect.payload.target,
    result: effect.payload.result || '无法验出结果',
    reason: effect.payload.decisionReason || null,
  },
}];
```

In Trace feedback, read the matching server record:

```ts
const actorId = toNumber(input.actorId);
const serverCheck = Array.isArray(night.seerChecks)
  ? (night.seerChecks as Array<Record<string, unknown>>)
      .find((item) => toNumber(item.actorId) === actorId)
  : null;
if (actorId == null) {
  return {
    ...common,
    feedbackKind: 'seer_check_result',
    target: null,
    result: 'unknown',
    channel: CHANNEL_TYPES.SYSTEM,
    visibleTo: ['system'],
  };
}
return {
  ...common,
  feedbackKind: 'seer_check_result',
  target: toNumber(serverCheck?.target) ?? toNumber(payload.target),
  result: String(serverCheck?.result || 'unknown'),
  channel: CHANNEL_TYPES.SCOPE,
  scopeKey: `player:${actorId}`,
  visibleTo: [`player:${actorId}`, 'system'],
  reason: normalizeReason(serverCheck?.reason ?? payload.reason),
};
```

- [ ] **Step 8: Run all privacy tests**

Run:

```powershell
pnpm.cmd run test:unit -- werewolfChannelGuard.test.ts werewolfInteractionFeedbackTrace.test.ts gameEngineActionEffect.test.ts werewolfActionEngineBridge.test.ts
pnpm.cmd run test:workflow
```

Expected: PASS with exactly two independently scoped Seer request/result events in the fake workflow.

- [ ] **Step 9: Commit**

```powershell
git add packages/shared/utils/channelResolution.ts packages/server/modules/werewolf/handlers/actionChannel.ts packages/server/modules/werewolf/handlers/channelGuard.ts packages/server/modules/werewolf/handlers/actionWindowHandler.ts packages/server/modules/werewolf/definition.ts packages/server/modules/werewolf/interactionFeedbackTrace.ts tests/unit/werewolfChannelGuard.test.ts tests/unit/werewolfInteractionFeedbackTrace.test.ts tests/unit/gameEngineActionEffect.test.ts tests/unit/werewolfActionEngineBridge.test.ts tests/workflow/werewolfFakeWorkflow.test.ts
git commit -m "fix: isolate seer results by player"
```

---

### Task 5: Synchronize Types, Debug Coverage, and Documentation

**Files:**

- Modify: `packages/shared/types/gameEvent.ts:300-312`
- Modify: `packages/client/src/types/werewolf.ts:25-94`
- Modify: `tests/workflow/werewolfDebugActions.test.ts`
- Modify: `docs/project-server.md`
- Modify: `docs/project-workflow.md`
- Modify: `docs/project-client.md`
- Modify: `docs/project-admin.md`
- Modify: `docs/project-shared.md`

**Interfaces:**

- Consumes: existing Seer result event and client Werewolf night state.
- Produces: additive optional `actorId`, additive `seerChecks`, and current architecture documentation.

- [ ] **Step 1: Add a failing debug first-night test**

Import `applyActionResults` and `getActorsForStep`, then add:

```ts
test('debug first night resolves both true and shadow seer checks', () => {
  const round = createRound();
  const runtime = {
    agents: [
      {
        id: 1,
        alive: true,
        faction: 'good',
        role: 'seer',
        roleConfig: { id: 'seer', rule: { actions: [{ action: 'inspectFaction' }] } },
        seerChecks: [],
      },
      {
        id: 2,
        alive: true,
        faction: 'good',
        role: 'shadow_seer',
        roleConfig: { id: 'shadow_seer', roleType: 'villager', rule: { actions: [{ action: 'inspectFaction' }] } },
        seerChecks: [],
      },
      {
        id: 3,
        alive: true,
        faction: 'wolves',
        role: 'werewolf',
        roleConfig: { id: 'werewolf', rule: { actions: [{ action: 'kill' }] } },
        seerChecks: [],
      },
    ],
    modeConfig: { id: 'shadow-seer-12' },
    state: { debugMode: true, rounds: [round] },
  };
  const step = { config: { day: 1, actionType: 'seer_check' } };
  const actors = getActorsForStep(runtime as never, step as never, round as never);
  const results = actors.map((actor) => ({
    actorId: actor.id,
    payload: runDebugWerewolfAction(runtime, round, actor, 'seer_check'),
  }));

  applyActionResults(runtime as never, step as never, results as never);

  assert.deepEqual(actors.map((actor) => actor.id), [1, 2]);
  assert.equal(round.night.seerChecks.length, 2);
  assert.deepEqual(
    round.night.seerChecks.map((check: { actorId: number }) => check.actorId),
    [1, 2],
  );
});
```

- [ ] **Step 2: Run the debug workflow test**

Run:

```powershell
pnpm.cmd run test:workflow
```

Expected: PASS after Tasks 2-4; this locks the debug path to the same reducer.

- [ ] **Step 3: Add backward-compatible shared and client types**

In `gameEvent.ts`:

```ts
export interface SeerCheckCompletedPayload {
  actionType: 'seer_check';
  message: string;
  seerCheck: {
    actorId?: number | string;
    target: number | string | null;
    result: string;
    reason?: string | null;
  };
  speech?: {
    playerId: number;
    text: string;
  };
}
```

In client Werewolf types:

```ts
export interface WerewolfSeerCheck {
  actorId?: string | number;
  target: string | number;
  result?: string;
  reason?: string | null;
}
```

```ts
seerCheck?: WerewolfSeerCheck;
seerChecks?: WerewolfSeerCheck[];
```

No rendering component changes are needed: player projection continues to provide `seerCheck` as the viewer's compatibility record, while god/debug state may inspect `seerChecks`.

- [ ] **Step 4: Update architecture documentation**

Add concise sections with these exact facts:

- `project-server.md`: default seed adds `shadow_seer`/`shadow-seer-12`; startup upsert reuses existing tables; no schema or endpoint change.
- `project-workflow.md`: `seer_check` selects all living `inspectFaction` actors; server calculator ignores model faction text; canonical `night.seerChecks`; results use `player:<actorId>`; wake/close remains result-free.
- `project-client.md`: player view aliases Shadow Seer to Seer and receives only its own singular compatibility result; god/debug may receive the canonical array; realtime and replay share projection.
- `project-admin.md`: existing role/mode managers show the new entries; god/debug Trace may show the real role and both checks.
- `project-shared.md`: `SeerCheckCompletedPayload.seerCheck.actorId?` and client `seerChecks?` are additive; public events/replay never contain private checks.

- [ ] **Step 5: Run the complete verification matrix**

Run:

```powershell
pnpm.cmd run test:unit
pnpm.cmd run test:workflow
pnpm.cmd --filter @ai-presenter/shared run build
pnpm.cmd --filter @ai-presenter/server run build
pnpm.cmd --filter @ai-presenter/client run build
pnpm.cmd --filter @ai-presenter/admin run build
```

Expected:

- all unit and workflow tests pass,
- all four package builds exit with code `0`,
- no test expects shared `scopeKey: "seer"` for a result event,
- standard single-Seer modes retain `night.seerCheck`,
- no database migration or generated dependency lock change appears.

- [ ] **Step 6: Inspect the final diff and commit**

Run:

```powershell
git diff --check
git status --short
```

Confirm unrelated pre-existing worktree files are neither staged nor modified by this implementation.

Commit:

```powershell
git add packages/shared/types/gameEvent.ts packages/client/src/types/werewolf.ts tests/workflow/werewolfDebugActions.test.ts docs/project-server.md docs/project-workflow.md docs/project-client.md docs/project-admin.md docs/project-shared.md
git commit -m "docs: document shadow seer privacy contract"
```

---

## Final Acceptance

- [ ] `shadow-seer-12` has exactly 12 configured seats and the approved lineup.
- [ ] The real `shadow_seer` role is good/civilian and remains visible only to god/debug/postgame views.
- [ ] Both Seer actors receive independent action tasks in the same night.
- [ ] True Seer result is real; Shadow Seer result is inverted; model faction text is ignored.
- [ ] `night.seerChecks` contains both records and `night.seerCheck` remains compatible for single-Seer modes.
- [ ] Each result/request/Trace record uses `player:<actorId>` and cannot cross viewers.
- [ ] Public wake/close, realtime audience delivery, and public replay contain no actor list or private result.
- [ ] Shadow Seer prompts, session history, and player view contain neither `shadow_seer` nor “灯影预言家”.
- [ ] Wolf strategy and sheriff prompts are unchanged.
- [ ] Side victory counts Shadow Seer as a civilian.
- [ ] Debug mode completes a first-night two-check reducer cycle.
- [ ] Full unit/workflow tests and shared/server/client/admin builds pass.
