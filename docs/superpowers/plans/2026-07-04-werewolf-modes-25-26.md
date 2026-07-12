# Werewolf Modes 25-26 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add playable debug/workflow support for modes 25-26: Cupid & Thief, Succubus & Thief.

**Architecture:** Reuse existing werewolf first-night action windows, reducers, night effects, win checks, debug actions, and AI action dispatch. Keep the first pass minimal: thief chooses one offered role, Cupid/Succubus bind lovers, lover death chains through existing effects, and mixed-faction lovers become third-party.

**Tech Stack:** TypeScript, Node test runner, existing workflow tests.

---

### Task 1: RED Tests

**Files:**
- Modify: `tests/workflow/werewolfReducers.test.ts`
- Modify: `tests/workflow/werewolfEffects.test.ts`
- Modify: `tests/workflow/werewolfDebugActions.test.ts`

- [x] Add failing tests for thief role choice, Cupid lovers, Succubus lovers, lover-linked death, and debug payloads.
- [x] Run focused workflow tests and confirm the new tests fail before production code changes.

### Task 2: Mode And Role Config

**Files:**
- Modify: `packages/server/modules/werewolf-config/constants.ts`
- Modify: `packages/server/modules/werewolf-config/utils.ts`

- [x] Add modes `cupid-thief-12` and `succubus-thief-12`.
- [x] Add roles `thief`, `cupid`, and `succubus`.
- [x] Add executable actions `stealRole`, `linkLovers`, and `succubusLink`.

### Task 3: First-Night Actions

**Files:**
- Modify: `packages/server/modules/werewolf/steps.ts`
- Modify: `packages/server/modules/werewolf/reducers.ts`
- Modify: `packages/server/modules/werewolf/aiActions.ts`
- Modify: `packages/server/modules/werewolf/debugActions.ts`
- Modify: `packages/server/modules/werewolf/prompts/actions.ts`

- [x] Insert thief and lover-link actions on day 1 only.
- [x] Record thief choice and lover ids on the current round.
- [x] Convert mixed-faction lovers and their linker to `third_party`.
- [x] Return legal deterministic debug payloads.

### Task 4: Effects And Win Check

**Files:**
- Modify: `packages/server/modules/werewolf/effects.ts`
- Modify: `packages/server/modules/werewolf/winCheck.ts`

- [x] When a lover dies, append the paired lover death once.
- [x] Suppress death-shot style follow-up for lover-linked death through existing disabled death reason checks.
- [x] Add third-party lover win when the only living players are the third-party lover group.

### Task 5: Types, Docs, Verification

**Files:**
- Modify: `packages/client/src/types/werewolf.ts`
- Modify: `docs/project-workflow.md`
- Modify: `docs/project-client.md`
- Modify: `docs/project-shared.md`

- [x] Add client snapshot fields for thief and lovers.
- [x] Document the 25-26 workflow/debug scope.
- [ ] Run focused workflow tests.
- [ ] Run full workflow debug suite.
