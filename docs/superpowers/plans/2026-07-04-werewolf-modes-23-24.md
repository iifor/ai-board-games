# Werewolf Modes 23-24 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add playable mode 23 `种狼` and mode 24 `天眼&祈求者`.

**Architecture:** Reuse existing werewolf mode config, action-window, reducer/effects, EventBus, snapshot and C-side badge pipelines. Keep third-party requester victory minimal: requester becomes `third_party` and wins only when it is the last living player.

**Tech Stack:** TypeScript, Node test runner, React display constants, shared event types.

---

### Task 1: Tests First

**Files:**
- Modify: `tests/workflow/werewolfReducers.test.ts`
- Modify: `tests/workflow/werewolfEffects.test.ts`
- Modify: `tests/workflow/werewolfDebugActions.test.ts`

- [x] Add failing reducer tests for wolf-seed actor selection, heavenly-eye role check, requester prayer rewards, and requester solo kill.
- [x] Add failing effect tests for successful infection and guarded/saved infection failure.
- [x] Add failing debug-action tests for mode 23-24 legal payload generation.

### Task 2: Server Rules

**Files:**
- Modify: `packages/server/db/seed.ts`
- Modify: `packages/server/modules/werewolf-config/constants.ts`
- Modify: `packages/server/modules/werewolf-config/utils.ts`
- Modify: `packages/server/modules/werewolf/steps.ts`
- Modify: `packages/server/modules/werewolf/reducers.ts`
- Modify: `packages/server/modules/werewolf/effects.ts`
- Modify: `packages/server/modules/werewolf/winCheck.ts`
- Modify: `packages/server/modules/werewolf/wolfTeam.ts`

- [x] Add roles `wolf_seed`, `heavenly_eye`, `requester`.
- [x] Add modes `wolf-seed-hidden-wolf-12` and `heavenly-eye-requester-12`.
- [x] Add action windows `wolf_seed_infect`, `heavenly_eye_check`, `requester_pray`, `requester_kill`.
- [x] Infection turns the successful wolf-kill victim into wolves and prevents the wolf-kill death; blocked/saved kill consumes no infection.
- [x] Requester prayer grants vote weight, gun, poison, inspect, or third-party solo kill.

### Task 3: Events And Client

**Files:**
- Modify: `packages/shared/types/gameEvent.ts`
- Modify: `packages/shared/constants/channelMaps.ts`
- Modify: `packages/server/modules/werewolf/actionPhases.ts`
- Modify: `packages/server/modules/werewolf/handlers/actionWindowHandler.ts`
- Modify: `packages/server/modules/werewolf/eventDeliverySubscriber.ts`
- Modify: `packages/client/src/types/game.ts`
- Modify: `packages/client/src/types/player.ts`
- Modify: `packages/client/src/types/werewolf.ts`
- Modify: `packages/client/src/features/werewolf/constants.tsx`
- Modify: `packages/client/src/features/werewolf/utils/gameState.ts`
- Modify: `packages/client/src/features/werewolf/werewolfUtils.tsx`

- [x] Add display event payloads and snapshot fields.
- [x] Add role names/icons and night badges.
- [x] Keep REST and WebSocket start/control/ack unchanged.

### Task 4: Docs And Verification

**Files:**
- Modify: `docs/project-workflow.md`
- Modify: `docs/project-client.md`
- Modify: `docs/project-shared.md`
- Modify: `TODO.md`

- [x] Document 23-24 behavior and contract fields.
- [x] Run focused workflow/debug tests.
- [ ] Report current Node/better-sqlite3 blocker if full server debug cannot start.
