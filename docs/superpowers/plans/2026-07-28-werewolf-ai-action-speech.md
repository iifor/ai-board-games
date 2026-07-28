# Werewolf AI Action Speech Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the normal-path server-composed “fixed action result + reason” narration for all 28 configured werewolf actions with natural first-person role speech, while keeping the server authoritative for targets and resolved facts.

**Architecture:** Add one pure action-speech policy module and reuse the existing `reason` and `presentation.speakableText` pipeline. Twenty-four decision-known actions keep their original model call; four result-dependent actions (`seer_check`, `lucky_seer_check`, `fox_inspect`, `black_merchant_gift`) use one additional `askTextOnce()` call after the server has deterministically calculated the result fact. Existing fixed text remains only as a failure/debug/human fallback.

**Tech Stack:** TypeScript, Node.js `node:test`, existing `BasePlayerAgent`, existing werewolf workflow/action-window pipeline.

## Global Constraints

- The 28 scoped actions are: `fortune_teller_mark`, `big_bad_wolf_kill`, `ghost_bride_link`, `ghost_bride_kill`, `demon_hunter_hunt`, `spirit_wolf_learn`, `spirit_wolf_guard`, `spirit_wolf_antidote`, `wolf_witch_curse`, `illusionist_illusion`, `crow_curse`, `black_merchant_gift`, `lucky_seer_check`, `lucky_witch_poison`, `younger_brother_kill`, `penguin_freeze`, `fox_inspect`, `seer_check`, `witch_save`, `witch_poison`, `guard_protect`, `butterfly_hug`, `stalker_assassinate`, `wolf_beauty_charm`, `nightmare_fear`, `dreamer_dream`, `magician_swap`, `elder_silence`.
- Only the four result-dependent actions receive a normal-path second model call.
- `use`, `target`, `targetSeat`, `secondTarget`, and server-resolved result fields remain authoritative; generated speech never mutates game rules.
- Keep action speech at the existing 80-character normalized limit.
- Preserve current public/scope/system channel visibility and TTS/ACK behavior.
- No C-end layout, REST API, database, WebSocket envelope, shared type, configuration, or dependency changes.
- Preserve unrelated working-tree changes in `playerAgent.ts`, model fallback services/tests, `docs/project-server.md`, and `docs/project-workflow.md`.

---

## File Structure

- Create `packages/server/modules/werewolf/actionSpeech.ts`: action sets, speech-contract text, effective-action detection, pure prompt construction, normalization, and fallback selection.
- Modify `packages/server/modules/werewolf/prompts/context.ts`: append the natural-speech contract only for the 28 scoped actions.
- Modify `packages/server/modules/werewolf/aiActions.ts`: reuse `askTextOnce()` to correct missing decision speech and generate result-aware speech for the four result-dependent actions.
- Modify `packages/server/modules/werewolf/reducers.ts`: expose and reuse pure authoritative result helpers needed by AI result narration.
- Modify `packages/server/modules/werewolf/actionPhases.ts`: prefer complete model speech and use fixed result text only when speech is absent.
- Modify `packages/server/modules/game-socket/narration.ts`: remove normal-path fallback prefix concatenation.
- Modify `packages/server/modules/game-socket/replay.ts`: stop rebuilding fixed prefixes when a saved model speech exists.
- Create `tests/unit/werewolfActionSpeech.test.ts`: policy, prompt, normalization, and fallback coverage.
- Modify `tests/unit/runUnitTests.cjs`: register the new unit test.
- Modify `tests/unit/werewolfPromptContext.test.ts`: verify the scoped prompt contract.
- Modify `tests/workflow/werewolfReducers.test.ts`: verify authoritative facts and phase-result messages.
- Modify `tests/workflow/werewolfPresentation.test.ts`: verify the role speech reaches `speakableText` unchanged.
- Modify `docs/project-workflow.md`: document the two-path generation and deterministic fallback.

---

### Task 1: Add the Pure Action-Speech Policy

**Files:**
- Create: `packages/server/modules/werewolf/actionSpeech.ts`
- Create: `tests/unit/werewolfActionSpeech.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**
- Produces: `isNaturalActionSpeechType(actionType: string): boolean`
- Produces: `isResultDependentActionSpeechType(actionType: string): boolean`
- Produces: `isEffectiveActionPayload(payload: Record<string, unknown>): boolean`
- Produces: `actionSpeechContract(actionType: string): string`
- Produces: `buildActionSpeechPrompt(input: ActionSpeechPromptInput): string`
- Produces: `resolveActionSpeech(existing: unknown, generated: unknown, fallback: string): string`

- [ ] **Step 1: Write the failing policy tests**

Add the following assertions to `tests/unit/werewolfActionSpeech.test.ts`:

```ts
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  actionSpeechContract,
  buildActionSpeechPrompt,
  isEffectiveActionPayload,
  isNaturalActionSpeechType,
  isResultDependentActionSpeechType,
  resolveActionSpeech,
} from '../../packages/server/modules/werewolf/actionSpeech';

test('action speech policy scopes natural and result-dependent actions', () => {
  assert.equal(isNaturalActionSpeechType('witch_save'), true);
  assert.equal(isNaturalActionSpeechType('day_vote'), false);
  assert.equal(isResultDependentActionSpeechType('seer_check'), true);
  assert.equal(isResultDependentActionSpeechType('witch_poison'), false);
  assert.match(actionSpeechContract('witch_poison'), /第一人称/);
  assert.equal(actionSpeechContract('day_vote'), '');
});

test('action speech policy detects effective payloads', () => {
  assert.equal(isEffectiveActionPayload({ use: true }), true);
  assert.equal(isEffectiveActionPayload({ use: false, target: 5 }), false);
  assert.equal(isEffectiveActionPayload({ target: 5 }), true);
  assert.equal(isEffectiveActionPayload({ target: null }), false);
});

test('action speech prompt includes authoritative result without granting rule authority', () => {
  const prompt = buildActionSpeechPrompt({
    actionType: 'seer_check',
    actorLabel: '2号预言家',
    actionSummary: '查验5号',
    decisionReason: '5号发言前后矛盾',
    resolvedFact: '服务端查验结果：5号是狼人',
  });
  assert.match(prompt, /5号是狼人/);
  assert.match(prompt, /不得修改目标或结果/);
  assert.match(prompt, /只输出一句/);
});

test('action speech selection prefers generated then existing then fallback', () => {
  assert.equal(resolveActionSpeech('原始理由', '模型完整台词', '固定结果'), '模型完整台词');
  assert.equal(resolveActionSpeech('原始理由', '', '固定结果'), '原始理由');
  assert.equal(resolveActionSpeech('', '', '固定结果'), '固定结果');
  assert.equal(resolveActionSpeech('', '  很长的台词  ', '固定结果'), '很长的台词');
});
```

- [ ] **Step 2: Run the new test and verify it fails**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs -- werewolfActionSpeech.test.ts
```

Expected: FAIL because `actionSpeech.ts` does not exist.

- [ ] **Step 3: Implement the minimal pure policy**

Create `actionSpeech.ts` with the exact 28-action set and four-action subset. Implement `resolveActionSpeech()` with `String(value || '').trim().slice(0, 80)` and the priority `generated -> existing -> fallback`. `buildActionSpeechPrompt()` must include:

```ts
interface ActionSpeechPromptInput {
  actionType: string;
  actorLabel: string;
  actionSummary: string;
  decisionReason?: string | null;
  resolvedFact?: string | null;
}
```

The generated prompt must require one first-person Chinese sentence, the action/target, the reasoning, any supplied resolved fact, no Markdown, no system commentary, and no alteration of the supplied target/result.

- [ ] **Step 4: Register and run the unit test**

Add `'werewolfActionSpeech.test.ts'` to the default file list in `tests/unit/runUnitTests.cjs`, then run the focused command from Step 2.

Expected: PASS.

- [ ] **Step 5: Commit the policy**

```powershell
git add -- packages/server/modules/werewolf/actionSpeech.ts tests/unit/werewolfActionSpeech.test.ts tests/unit/runUnitTests.cjs
git commit -m "feat(werewolf): add action speech policy"
```

---

### Task 2: Require Natural Speech and Stop Normal Prefix Concatenation

**Files:**
- Modify: `packages/server/modules/werewolf/prompts/context.ts:94-128`
- Modify: `packages/server/modules/werewolf/actionPhases.ts:92-443`
- Modify: `tests/unit/werewolfPromptContext.test.ts`
- Modify: `tests/workflow/werewolfReducers.test.ts:260-280`
- Modify: `tests/workflow/werewolfPresentation.test.ts:68-80`

**Interfaces:**
- Consumes: `actionSpeechContract()` and `isNaturalActionSpeechType()` from Task 1.
- Produces: all 28 phase-result builders return the model speech unchanged when it is non-empty.

- [ ] **Step 1: Write failing prompt and phase-result tests**

In `werewolfPromptContext.test.ts`, build prompts for `witch_poison` and `day_vote` and assert:

```ts
assert.match(witchPrompt, /执行行动时.*reason.*必须/);
assert.match(witchPrompt, /第一人称/);
assert.doesNotMatch(dayVotePrompt, /执行行动时.*reason.*必须/);
```

Replace the existing “divine action narration appends reasons” expectations in `werewolfReducers.test.ts` with:

```ts
assert.equal(
  getActionPhaseConfig('witch_poison')?.buildMessages(
    1,
    { witchPoisonUsed: true, target: 5, reason: '我今晚选择毒掉5号，因为他的投票和发言明显矛盾。' },
  ).result,
  '我今晚选择毒掉5号，因为他的投票和发言明显矛盾。',
);
assert.equal(
  getActionPhaseConfig('witch_poison')?.buildMessages(1, { witchPoisonUsed: true, target: 5 }).result,
  '女巫毒了5号。',
);
assert.equal(
  getActionPhaseConfig('guard_protect')?.buildMessages(
    1,
    { guardTarget: 2, reason: '我今晚守护2号，他很可能是关键神职。' },
  ).result,
  '我今晚守护2号，他很可能是关键神职。',
);
```

Update `werewolfPresentation.test.ts` so a `werewolf_phase_result` message containing role speech is expected unchanged in both `speakableText` and `displayText`.

- [ ] **Step 2: Run focused tests and verify old concatenation fails**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs -- werewolfPromptContext.test.ts
node --preserve-symlinks --preserve-symlinks-main .\tests\workflow\runWorkflowTests.cjs -- werewolfReducers.test.ts werewolfPresentation.test.ts
```

Expected: prompt assertions and reason-only phase-result assertions FAIL.

- [ ] **Step 3: Append the scoped prompt contract**

In `buildWerewolfPromptBundle()`, append `actionSpeechContract(input.actionType)` to `taskInstruction` and `outputContract` only when it is non-empty. The appended output rule must clarify that any older “reason 可选” example means optional only when the action is skipped; an effective action requires a complete first-person `reason`.

- [ ] **Step 4: Replace prefix concatenation with speech preference**

In `actionPhases.ts`, replace `withReason(result, context.reason)` with a local wrapper backed by Task 1:

```ts
function actionResultSpeech(result: string, reason?: string | null): string {
  return resolveActionSpeech(reason, '', `${result}。`);
}
```

Use it at all current 28 `withReason()` call sites, then delete `withReason()`. This retains deterministic text only when AI speech is absent.

- [ ] **Step 5: Run the focused tests**

Run the commands from Step 2.

Expected: PASS.

- [ ] **Step 6: Commit prompt and phase behavior**

```powershell
git add -- packages/server/modules/werewolf/prompts/context.ts packages/server/modules/werewolf/actionPhases.ts tests/unit/werewolfPromptContext.test.ts tests/workflow/werewolfReducers.test.ts tests/workflow/werewolfPresentation.test.ts
git commit -m "feat(werewolf): speak natural action reasons"
```

---

### Task 3: Generate Result-Aware Speech for Four Server-Resolved Actions

**Files:**
- Modify: `packages/server/modules/werewolf/reducers.ts:382-436, 688-820`
- Modify: `packages/server/modules/werewolf/aiActions.ts:64-155`
- Modify: `packages/server/modules/werewolf/actionSpeech.ts`
- Modify: `tests/unit/werewolfActionSpeech.test.ts`
- Modify: `tests/workflow/werewolfReducers.test.ts`

**Interfaces:**
- Produces from reducers: `resolveSeerFactionResult(runtime, target, fallback): string`
- Produces from reducers: `resolveFoxInspectResult(runtime, targetId): { targetIds: number[]; hasWolf: boolean } | null`
- Produces from reducers: `resolveBlackMerchantGiftSuccess(target): boolean`
- Produces in `aiActions.ts`: `resolveAiActionSpeech(input): Promise<string>`
- Consumes: existing `actor.playerAgent.askTextOnce(prompt, options)`.

- [ ] **Step 1: Write failing authoritative-result tests**

Extend `werewolfReducers.test.ts` to assert the exported pure helpers return the same values later stored by reducers:

```ts
assert.equal(resolveSeerFactionResult(ctx as never, hiddenWolf as never, undefined), '好人');
assert.deepEqual(resolveFoxInspectResult(ctx as never, 4), {
  targetIds: [3, 4, 5],
  hasWolf: false,
});
assert.equal(resolveBlackMerchantGiftSuccess(wolf as never), false);
assert.equal(resolveBlackMerchantGiftSuccess(villager as never), true);
```

Add a unit test around an exported `resolveAiActionSpeech()` with a fake actor:

```ts
const prompts: string[] = [];
const actor = {
  id: 2,
  roleLabel: '预言家',
  playerAgent: {
    askTextOnce: async (prompt: string) => {
      prompts.push(prompt);
      return '我验了5号，结果是狼人，之前他的发言果然有问题。';
    },
  },
};
```

Assert `seer_check` calls once with the authoritative fact, `witch_poison` with an existing reason does not call, and a failed call returns an empty string so the phase builder owns the deterministic fallback.

- [ ] **Step 2: Run focused tests and verify missing exports fail**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs -- werewolfActionSpeech.test.ts
node --preserve-symlinks --preserve-symlinks-main .\tests\workflow\runWorkflowTests.cjs -- werewolfReducers.test.ts
```

Expected: FAIL because the pure result helpers and `resolveAiActionSpeech()` are not exported.

- [ ] **Step 3: Extract and reuse authoritative result helpers**

Refactor, without changing results:

- `applySeerCheck()` and `applyLuckySeerCheck()` call exported `resolveSeerFactionResult()`.
- `applyFoxInspect()` calls exported `resolveFoxInspectResult()` rather than calculating the three-seat scope twice.
- `applyBlackMerchantGift()` calls exported `resolveBlackMerchantGiftSuccess()`.

Do not move state mutation, skill consumption, deaths, or visibility into these helpers.

- [ ] **Step 4: Implement the result-aware model call**

In `aiActions.ts`, after `runWerewolfAiAction()` returns and before `publishActionSubmitted()`:

```ts
const payloadWithSpeech = isWerewolfDebugMode(runtime)
  ? payload
  : {
      ...payload,
      reason: await resolveAiActionSpeech({
        runtime,
        round,
        actor,
        actionType: step.config.actionType!,
        payload,
      }),
    };
```

`resolveAiActionSpeech()` must:

1. Return the normalized existing reason immediately for a non-result-dependent effective action.
2. Return an empty string for a skipped action.
3. For the four result-dependent actions, calculate the authoritative fact with the exported reducer helpers and call `actor.playerAgent.askTextOnce()` exactly once.
4. For any other effective scoped action missing a reason, use one `askTextOnce()` correction call.
5. Pass `{ limit: 80, maxTokens: 120, skillId: \`action-speech:${actionType}\`, phase: 'night' }`.
6. On null/error, return an empty string; `actionPhases.ts` then supplies its existing deterministic action/result fallback. Never reject or delay workflow completion indefinitely.

Use `payloadWithSpeech` consistently for `rawOutput`, returned `payload`, and `publishActionSubmitted()`.

- [ ] **Step 5: Run focused tests**

Run the commands from Step 2.

Expected: PASS, including exact one-call assertions for the four result actions.

- [ ] **Step 6: Commit result-aware speech**

```powershell
git add -- packages/server/modules/werewolf/reducers.ts packages/server/modules/werewolf/aiActions.ts packages/server/modules/werewolf/actionSpeech.ts tests/unit/werewolfActionSpeech.test.ts tests/workflow/werewolfReducers.test.ts
git commit -m "feat(werewolf): narrate resolved action results"
```

---

### Task 4: Align Narration and Replay Fallbacks

**Files:**
- Modify: `packages/server/modules/game-socket/narration.ts:205-222`
- Modify: `packages/server/modules/game-socket/replay.ts:814-973`
- Create: `tests/unit/werewolfNarration.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**
- Consumes: `resolveActionSpeech()` from Task 1.
- Produces: live fallback narration and reconstructed replay use saved role speech unchanged when present.

- [ ] **Step 1: Write failing narration and replay tests**

Create `werewolfNarration.test.ts` and assert:

```ts
assert.equal(
  getWerewolfNarration({
    type: 'seer-check',
    seerCheck: { target: 5, result: '狼人', reason: '我验了5号，他果然是狼人。' },
  } as never),
  '我验了5号，他果然是狼人。',
);
assert.equal(
  getWerewolfNarration({
    type: 'guard-action',
    roleAction: { target: 2, reason: '我今晚守护2号，他像关键神职。' },
  } as never),
  '我今晚守护2号，他像关键神职。',
);
```

Add a replay snapshot containing saved seer/guard reasons and assert `buildWerewolfReplayPlaybackEvents()` does not prepend `5号玩家的身份是` or `守卫守护了2号`.

- [ ] **Step 2: Run the focused test and verify old prefixes fail**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs -- werewolfNarration.test.ts
```

Expected: FAIL because current narration/replay helpers prepend fixed facts.

- [ ] **Step 3: Prefer saved speech in narration and replay**

Replace each `fixed + reason` helper with `resolveActionSpeech(reason, '', fixedFallback)`. Preserve exact fixed fallback output when no speech exists, so old human/debug/model-failure events remain understandable.

Do not rewrite already stored historical `message` values; only change reconstruction from structured old snapshots.

- [ ] **Step 4: Register and run the test**

Add `'werewolfNarration.test.ts'` to `tests/unit/runUnitTests.cjs`, then run Step 2.

Expected: PASS.

- [ ] **Step 5: Commit fallback alignment**

```powershell
git add -- packages/server/modules/game-socket/narration.ts packages/server/modules/game-socket/replay.ts tests/unit/werewolfNarration.test.ts tests/unit/runUnitTests.cjs
git commit -m "fix(werewolf): preserve natural speech in playback"
```

---

### Task 5: Document and Verify the End-to-End Change

**Files:**
- Modify: `docs/project-workflow.md`

**Interfaces:**
- Consumes: completed behavior from Tasks 1-4.
- Produces: current workflow documentation and final verification evidence.

- [ ] **Step 1: Update workflow documentation**

Append a focused subsection documenting:

- 24 decision-known actions reuse their existing action call.
- Four result-dependent actions make one additional `askTextOnce()` call after authoritative fact calculation.
- Role speech uses the existing `reason -> werewolf_phase_result -> presentation.speakableText` path.
- Deterministic text is only the human/debug/model-failure fallback.
- No API, database, shared type, C-end layout, or channel visibility change.

Preserve the existing uncommitted upstream-model-disable paragraph already present in this file.

- [ ] **Step 2: Run targeted unit and workflow tests**

Run:

```powershell
node --preserve-symlinks --preserve-symlinks-main .\tests\unit\runUnitTests.cjs -- werewolfActionSpeech.test.ts werewolfPromptContext.test.ts werewolfNarration.test.ts
node --preserve-symlinks --preserve-symlinks-main .\tests\workflow\runWorkflowTests.cjs -- werewolfReducers.test.ts werewolfPresentation.test.ts werewolfFakeWorkflow.test.ts
```

Expected: all selected files PASS.

- [ ] **Step 3: Run type checks**

Run:

```powershell
pnpm.cmd run check:server
pnpm.cmd run check:shared
```

Expected: both commands exit 0.

- [ ] **Step 4: Run full directly affected suites**

Use isolated workflow databases:

```powershell
$env:DATABASE_PATH = Join-Path $env:TEMP 'consensus-action-speech-workflow.db'
$env:JSON_DATABASE_PATH = Join-Path $env:TEMP 'consensus-action-speech-workflow-json.db'
pnpm.cmd run test:unit
pnpm.cmd run test:workflow
```

Expected: both suites exit 0. If an unrelated pre-existing failure occurs, record its exact test and stack trace without changing unrelated code.

- [ ] **Step 5: Inspect the final diff**

Run:

```powershell
git diff --check
git status --short
git diff -- packages/server/modules/werewolf packages/server/modules/game-socket tests/unit tests/workflow docs/project-workflow.md
```

Expected: no whitespace errors; unrelated model-fallback edits remain intact and unstaged unless they are separately owned by the user.

- [ ] **Step 6: Commit documentation**

```powershell
git add -- docs/project-workflow.md
git commit -m "docs: document werewolf action speech"
```
