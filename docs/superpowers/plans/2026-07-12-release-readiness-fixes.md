# Release Readiness Fixes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the current workspace pass every production release gate without changing APIs, database schemas, or confirmed gameplay behavior.

**Architecture:** Keep existing module boundaries and tests. Align local TypeScript contracts with their actual workflow consumers, restore prompt/memory behavior at the existing shared helpers, remove unreachable client code, and make GitHub Actions run all repository gates before SSH deployment.

**Tech Stack:** TypeScript, React, Node test runner, pnpm workspace, Docker, GitHub Actions.

## Global Constraints

- Add no dependency or runtime module.
- Preserve existing dirty-worktree changes.
- Do not change REST, WebSocket, database, or shared payload contracts.
- Use `pnpm.cmd` for local verification on Windows.

---

### Task 1: Align server workflow types

**Files:**
- Modify: `packages/server/modules/agent-core/index.ts`
- Modify: `packages/server/modules/debate/helpers.ts`
- Modify: `packages/server/modules/debate/workflow.ts`

**Interfaces:**
- Consumes: existing observability `createTraceContext`, workflow handler results, and serialized debate state.
- Produces: type-correct exports and handler contracts; no runtime protocol change.

- [ ] Run `pnpm.cmd run build:server` and retain the four existing compiler failures as RED.
- [ ] Export `createTraceContext` through the existing agent-core barrel or import it from its owning observability module, choosing the existing barrel pattern.
- [ ] Add `blockers?: unknown[]` and `tasks?: unknown[]` to the local debate `HandlerResult`.
- [ ] Make the local `WorkflowStep` structurally acceptable to the helper receiving `{ id: string; [key: string]: unknown }`.
- [ ] Type `WorkflowState.host` with the existing debate host type, or cast only at the serialization boundary if that is the established local pattern.
- [ ] Run `pnpm.cmd run build:server`; expect exit code 0.

### Task 2: Restore prompt and memory contracts

**Files:**
- Modify: `packages/server/modules/werewolf/prompts/actions.ts`
- Modify: the existing player-memory implementation located by CodeGraph.
- Test: `tests/unit/werewolfPromptContext.test.ts`
- Test: `tests/unit/playerMemory.test.ts`

**Interfaces:**
- Consumes: existing action prompt builders and persisted relationship-memory rows.
- Produces: hunter JSON without `reason`, divine prompts with normalized optional reasons, and the existing confidence/ranking/cap behavior.

- [ ] Run `pnpm.cmd run test:unit`; retain the three existing failures as RED.
- [ ] Give `buildHunterShootActionPrompt` its existing no-reason JSON contract instead of the generic reason-bearing helper.
- [ ] Keep `buildSaveActionPrompt` reason-bearing and include the established antidote wording used by the action prompt contract.
- [ ] Correct the relationship-memory confidence boundary at the shared formatter/source rather than weakening its test.
- [ ] Run `pnpm.cmd run test:unit`; expect 174 tests passing.

### Task 3: Remove unreachable client code

**Files:**
- Modify: `packages/client/src/pages/GameSelectPage/index.tsx`

**Interfaces:**
- Consumes: existing game cards and start/replay callbacks.
- Produces: the same visible selection page without unused imports or unreachable editor state.

- [ ] Run `pnpm.cmd --filter @ai-presenter/client run check`; retain the two unused-declaration failures as RED.
- [ ] Remove the unused `UsersRound` import and the unreachable `openEditor` function; remove any state/editor branch that becomes dead only if it has no rendered trigger.
- [ ] Run the client check; expect exit code 0.

### Task 4: Enforce release gates before deployment

**Files:**
- Modify: `.github/workflows/deploy-master.yml`
- Modify: `Dockerfile` only if the workflow cannot validate server compilation through existing scripts.
- Modify: `docs/project-summary.md` if deployment behavior changes from its current documented contract.

**Interfaces:**
- Consumes: existing root `check`, `build`, `test:unit`, `test:workflow`, and `test:migration` scripts.
- Produces: a deploy job that cannot reach SSH after a failed gate.

- [ ] Add Node 20 and pnpm 9.15.4 setup after checkout.
- [ ] Install with `pnpm install --frozen-lockfile`.
- [ ] Run `pnpm run check`, `pnpm run build`, and all three test scripts before SSH configuration.
- [ ] Keep Docker image validation before SSH and leave production secrets scoped to the deploy steps.
- [ ] Update deployment documentation only where the gate sequence changed.

### Task 5: Full release verification

**Files:**
- Verify only; do not rewrite unrelated files.

- [ ] Run `pnpm.cmd run check`; expect exit code 0.
- [ ] Run `pnpm.cmd run build`; expect exit code 0.
- [ ] Run `pnpm.cmd run test:unit`; expect all tests passing.
- [ ] Run `pnpm.cmd run test:workflow`; expect all tests passing.
- [ ] Run `pnpm.cmd run test:migration`; expect all tests passing.
- [ ] Run Docker builder validation if Docker is available; otherwise report it as an explicit external gate.
- [ ] Run `git diff --check` and inspect `git status --short` to define the exact release commit set.
