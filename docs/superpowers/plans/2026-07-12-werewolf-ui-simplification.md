# Werewolf UI Simplification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remove duplicate speech information from the V2 center stage and open MVP vote details by default.

**Architecture:** Keep the existing V2 stage, bottom subtitle, and native `<details>` result UI. Add only small pure display predicates to the existing interaction utility so the rendering rules remain testable without component scaffolding.

**Tech Stack:** React, TypeScript, Node test runner.

## Global Constraints

- Do not change WebSocket events, workflow state, TTS, database, or shared types.
- Keep the bottom subtitle as the only full speech-text surface.
- Reuse native `<details>`; add no dependency or React state.

---

### Task 1: Simplify the V2 center stage

**Files:**
- Modify: `packages/client/src/features/werewolf-v2/utils/interactionState.ts`
- Modify: `packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.tsx`
- Test: `tests/unit/werewolfV2InteractionState.test.ts`

**Interfaces:**
- Produces: `isWerewolfSpeechInteraction(interaction): boolean`
- Consumes: existing `WerewolfInteractionState.template`.

- [ ] **Step 1: Write a failing test asserting speech interactions hide duplicate narrative, flow and facts.**
- [ ] **Step 2: Run `pnpm.cmd run test:unit` and verify the new assertion fails because the predicate is missing.**
- [ ] **Step 3: Implement `isWerewolfSpeechInteraction` as `interaction.template === 'speech'`.**
- [ ] **Step 4: In `InteractionStage`, keep title and speaker identity, but skip narrative, flow and facts when the predicate is true.**
- [ ] **Step 5: Run `pnpm.cmd run test:unit` and verify all tests pass.**

### Task 2: Expand MVP vote details by default

**Files:**
- Modify: `packages/client/src/features/werewolf/components/WerewolfResult/index.tsx`
- Test: `tests/unit/werewolfClientUtils.test.ts`

**Interfaces:**
- Produces: native `<details open>` whenever MVP votes exist.
- Consumes: existing `mvpVotes` array.

- [ ] **Step 1: Add a failing source-level regression assertion that result vote details use `open` rather than `open={!game.mvp}`.**
- [ ] **Step 2: Run `pnpm.cmd run test:unit` and verify the assertion fails.**
- [ ] **Step 3: Replace `open={!game.mvp}` with `open` on the existing `<details>`.**
- [ ] **Step 4: Run unit tests, C-end type checking and the C-end production build.**
