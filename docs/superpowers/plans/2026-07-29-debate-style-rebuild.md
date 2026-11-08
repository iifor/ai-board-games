# Debate Style Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the debate match as a character-led dark debate stage and make AI speeches sound like focused competitive debate.

**Architecture:** Keep the existing `DebateGame` data flow and workflow contracts. Recompose only the existing debate presentation components, reuse `PlayerPosterSpotlight` with transparent cutouts, replace the background asset, and refine the existing debate prompt builders.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner, existing debate workflow and agent-core.

## Global Constraints

- Preserve the existing game steps, REST/WebSocket messages, shared types, and database schema.
- Keep unrelated dirty worktree changes intact.
- Reuse existing player cutouts and UI components; add no dependency or parallel screen.
- The active speaker must remain fully visible and subtitles must not cover the face or torso.

---

### Task 1: Lock the visual and prompt contracts with one focused test

**Files:**
- Create: `tests/unit/debateStyle.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**
- Consumes: `buildSystemPrompt`, `createDebateSkills`, and the existing debate component source files.
- Produces: a runnable regression check for cutout wiring, stage layout hooks, and action-specific debate instructions.

- [ ] **Step 1: Write the failing test**

```ts
test('uses a cutout speaker and stage-scoped layout', () => {
  assert.match(arenaSource, /variant="cutout"/);
  assert.match(arenaSource, /debate-speaker-spotlight/);
  assert.match(arenaCss, /\.debate-speaker-spotlight/);
});

test('gives each debate action a concrete speaking contract', () => {
  assert.match(systemPrompt, /先回应争点/);
  assert.match(opening.prompt, /评判标准/);
  assert.match(question.prompt, /只问一个/);
  assert.match(answer.prompt, /第一句直接回答/);
});
```

- [ ] **Step 2: Run the targeted test and verify it fails**

Run: `pnpm.cmd run test:unit -- tests/unit/debateStyle.test.ts`

Expected: FAIL because the selected cutout hook and concrete prompt language do not exist yet.

- [ ] **Step 3: Add the test file to the default unit test manifest**

Add `debateStyle.test.ts` to `tests/unit/runUnitTests.cjs`.

### Task 2: Implement the selected debate stage

**Files:**
- Create: `packages/client/src/asserts/debate-stage-v2.png`
- Modify: `packages/client/src/features/debate/DebateGame/index.tsx`
- Modify: `packages/client/src/features/debate/DebateGame/index.css`
- Modify: `packages/client/src/features/debate/components/DebateArena/index.tsx`
- Modify: `packages/client/src/features/debate/components/DebateArena/index.css`
- Modify: `packages/client/src/features/debate/components/DebateSide/index.css`
- Modify: `packages/client/src/features/debate/components/DebateSeat/index.css`
- Modify: `packages/client/src/features/debate/components/DebatePhaseTimeline/index.css`
- Modify: `packages/client/src/components/SpeechSubtitle/index.css`

**Interfaces:**
- Consumes: current game state, current speaker ID, transparent cutout assets, phase steps, and the existing subtitle component.
- Produces: the selected responsive stage without changing component props or server events.

- [ ] **Step 1: Generate the background-only debate stage asset**

Generate a dark modern debate stage with an acoustic-panel wall, circular speaking platform, shadowed audience edges, and no people, text, logos, landscape, or UI.

- [ ] **Step 2: Wire the existing current speaker to the cutout variant**

```tsx
<PlayerPosterSpotlight
  className="debate-speaker-spotlight"
  key={currentSpeaker.id}
  player={currentSpeaker}
  variant="cutout"
/>
```

- [ ] **Step 3: Implement the selected layout with scoped CSS**

Use a three-column arena, unboxed side seats, a central full-body speaker, a compact phase rail, a low judge row, and a subtitle safe area.

- [ ] **Step 4: Run the targeted test**

Run: `pnpm.cmd run test:unit -- tests/unit/debateStyle.test.ts`

Expected: the visual contract assertions pass.

### Task 3: Refine AI debate expression without changing workflow

**Files:**
- Modify: `packages/server/modules/debate/prompts.ts`
- Modify: `packages/server/modules/debate/skillRegistry.ts`

**Interfaces:**
- Consumes: existing persona, topic, phase, relationship memory, and action-specific skills.
- Produces: natural, direct, phase-aware speech while preserving the current return shapes and word limits.

- [ ] **Step 1: Add the shared speaking standard**

Require direct engagement with the current dispute, one clear claim with support, natural spoken language, and no empty neutrality or template-like numbering.

- [ ] **Step 2: Tighten each action instruction**

Opening defines the judging standard; crossfire asks one concrete question; answers respond in the first sentence before counterattacking; closing uses no new major argument; judges cite concrete strengths and weaknesses.

- [ ] **Step 3: Run the targeted test**

Run: `pnpm.cmd run test:unit -- tests/unit/debateStyle.test.ts`

Expected: all prompt assertions pass.

### Task 4: Document and visually verify the approved result

**Files:**
- Modify: `docs/project-client.md`
- Modify: `docs/project-workflow.md`
- Create: `design-qa.md`

**Interfaces:**
- Consumes: the approved reference image and the running debate page.
- Produces: documented presentation/prompt contracts and a passed same-viewport visual comparison.

- [ ] **Step 1: Update the client and workflow contracts**

Document the character-led debate stage, subtitle safe area, transparent cutout reuse, and phase-specific speech rules. State explicitly that APIs, database, shared types, and workflow steps did not change.

- [ ] **Step 2: Run automated verification**

Run:

```powershell
pnpm.cmd run test:unit -- tests/unit/debateStyle.test.ts
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd --filter @ai-presenter/client run build
pnpm.cmd --filter @ai-presenter/server run check
git diff --check
```

- [ ] **Step 3: Capture and compare the running page**

Open the same desktop viewport and debate state, compare it with the approved image, fix P0-P2 differences, and record `final result: passed` in `design-qa.md`.
