# Werewolf Modes 14-16 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement werewolf modes 14-16 with debug-mode coverage and C-side display support.

**Architecture:** Reuse the existing werewolf role seed, action window, reducer/effects, EventBus, shared payload, and client merge/display pipeline. Add only the fields and action types required by the three boards.

**Tech Stack:** TypeScript, React, Node workflow tests, shared package types.

---

### Task 1: Tests

**Files:**
- Modify: `tests/unit/werewolfDefaultConfig.test.ts`
- Modify: `tests/workflow/werewolfReducers.test.ts`
- Modify: `tests/workflow/werewolfEffects.test.ts`
- Modify: `tests/workflow/werewolfDebugActions.test.ts`

- [ ] Add default mode assertions for mode ids `big-bad-wolf-fortune-teller-12`, `hidden-wolf-crow-12`, and `bear-tamer-hidden-wolf-12`.
- [ ] Add reducer tests for fortune teller mark, crow curse non-repeat, big bad wolf kill, and bear roar state.
- [ ] Add effects tests for big bad wolf extra kill, seer hidden wolf check, crow vote weight, and weak hidden wolf death.
- [ ] Add debug tests for new actions returning legal payloads.

### Task 2: Server Rules

**Files:**
- Modify: `packages/server/db/seed.ts`
- Modify: `packages/server/modules/werewolf-config/constants.ts`
- Modify: `packages/server/modules/werewolf-config/utils.ts`
- Modify: `packages/server/modules/werewolf/steps.ts`
- Modify: `packages/server/modules/werewolf/reducers.ts`
- Modify: `packages/server/modules/werewolf/effects.ts`
- Modify: `packages/server/modules/werewolf/roles.ts`
- Modify: `packages/server/modules/werewolf/aiActions.ts`
- Modify: `packages/server/modules/werewolf/debugActions.ts`
- Modify: `packages/server/modules/werewolf/prompts/actions.ts`
- Modify: `packages/server/modules/werewolf/actionPhases.ts`
- Modify: `packages/server/modules/werewolf/handlers/actionWindowHandler.ts`
- Modify: `packages/server/modules/werewolf/presentation.ts`

- [ ] Add roles and modes to default configuration.
- [ ] Add action types and target selection.
- [ ] Apply reducer state changes.
- [ ] Apply night/death/vote effects.
- [ ] Add debug fallbacks.

### Task 3: Shared and Client

**Files:**
- Modify: `packages/shared/types/gameEvent.ts`
- Modify: `packages/shared/constants/channelMaps.ts`
- Modify: `packages/client/src/features/werewolf/constants.tsx`
- Modify: `packages/client/src/features/werewolf/utils/gameState.ts`
- Modify: `packages/client/src/features/werewolf/werewolfUtils.tsx`
- Modify: `packages/client/src/types/game.ts`
- Modify: `packages/client/src/types/werewolf.ts`

- [ ] Add shared payloads and event type strings.
- [ ] Merge event state into C-side rounds.
- [ ] Show role names/icons and simple skill badges.

### Task 4: Docs and Verification

**Files:**
- Modify: `docs/project-server.md`
- Modify: `docs/project-workflow.md`
- Modify: `docs/project-client.md`
- Modify: `docs/project-shared.md`
- Modify: `TODO.md`

- [ ] Document mode 14-16 contracts.
- [ ] Run workflow tests.
- [ ] Run relevant unit tests.
- [ ] Run package type checks and report existing unrelated failures separately.
