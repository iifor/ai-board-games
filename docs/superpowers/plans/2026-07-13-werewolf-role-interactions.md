# Werewolf Role Interactions Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the four approved role-interaction mockups in the existing Werewolf v2 arena without changing game rules or visibility contracts.

**Architecture:** Keep `resolveWerewolfInteraction` as the single event-to-display projection. Add one focused visual component that consumes only the projected state, while the two perspective views pass already-public round status sets into the shared roster.

**Tech Stack:** React 18, TypeScript, lucide-react, scoped CSS, Node test runner.

## Global Constraints

- Reuse existing events, snapshots, view filtering, TTS, subtitles and replay.
- Do not add human action submission controls.
- Do not infer hidden roles, targets or results.
- Keep all new styles scoped to Werewolf v2.
- Do not add dependencies, REST APIs, WebSocket messages or database fields.

---

### Task 1: Project trustworthy visual metadata

**Files:**
- Modify: `tests/unit/werewolfV2InteractionState.test.ts`
- Modify: `packages/client/src/features/werewolf-v2/utils/interactionState.ts`

**Interfaces:**
- Produces: `getWerewolfInteractionVisualKind(action)` and `resultLabel` on `WerewolfInteractionState`.

- [ ] **Step 1: Write failing tests** for wolf, seer, witch, guard, hunter, self-destruct, knight, idiot and sheriff visual kinds, plus result labels sourced from event payloads.
- [ ] **Step 2: Run** `node tests/unit/runUnitTests.cjs werewolfV2InteractionState.test.ts` and verify the new assertions fail because the API is missing.
- [ ] **Step 3: Implement the minimum projection**:

```ts
export type WerewolfInteractionVisualKind = 'wolf' | 'seer' | 'witch' | 'guard' | 'hunter' | 'self-destruct' | 'knight' | 'idiot' | 'sheriff' | 'generic' | 'none';

export function getWerewolfInteractionVisualKind(action: string): WerewolfInteractionVisualKind {
  if (!action) return 'none';
  if (action.startsWith('sheriff_')) return 'sheriff';
  return ACTION_VISUALS[action] || 'generic';
}
```

- [ ] **Step 4: Re-run the focused test** and verify it passes.

### Task 2: Render the central role interaction motif

**Files:**
- Create: `packages/client/src/features/werewolf-v2/components/RoleInteractionVisual/index.tsx`
- Create: `packages/client/src/features/werewolf-v2/components/RoleInteractionVisual/index.css`
- Modify: `packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.tsx`

**Interfaces:**
- Consumes: `WerewolfInteractionState` and `getWerewolfInteractionVisualKind`.
- Produces: `<RoleInteractionVisual interaction={interaction} />`.

- [ ] **Step 1: Add a source-level failing assertion** that `InteractionStage` renders `RoleInteractionVisual` only for non-speech interaction details.
- [ ] **Step 2: Run the focused unit test** and verify the assertion fails.
- [ ] **Step 3: Implement the component** with lucide icons and variant-specific progress copy. Render no control buttons and no result copy unless `resultLabel` is present.
- [ ] **Step 4: Add scoped motion** for target lock, divination reveal, potion orbit, shield wave, shot line, self-destruct pulse, duel clash, card reveal and sheriff progress. Include `prefers-reduced-motion` fallback.
- [ ] **Step 5: Re-run the focused test and client type-check**.

### Task 3: Strengthen public seat states

**Files:**
- Modify: `packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.tsx`
- Modify: `packages/client/src/features/werewolf-v2/components/PerspectiveShared/index.css`
- Modify: `packages/client/src/features/werewolf-v2/components/GodWerewolfView/index.tsx`
- Modify: `packages/client/src/features/werewolf-v2/components/PlayerWerewolfView/index.tsx`
- Modify: `tests/unit/werewolfV2InteractionState.test.ts`

**Interfaces:**
- `PerspectiveRoster` consumes `withdrawnIds: Set<number>` and `revealedIdiotIds: Set<number>`.

- [ ] **Step 1: Add a failing source assertion** for the six public badges: `发言中`, `警长候选`, `警长`, `已退水`, `已翻牌`, `已出局`.
- [ ] **Step 2: Run the focused unit test** and verify the missing states fail.
- [ ] **Step 3: Pass current-round sets** from both perspective views and render one priority badge per seat.
- [ ] **Step 4: Add prominent cyan, violet and gold variants** for speaking, candidate and sheriff; keep withdrawn/dead subdued.
- [ ] **Step 5: Re-run focused tests and client type-check**.

### Task 4: Document and visually verify

**Files:**
- Modify: `docs/project-client.md`
- Modify: `design-qa.md`

- [ ] **Step 1: Document** the central visual variants and public seat-state priority without changing protocol documentation.
- [ ] **Step 2: Run** `pnpm.cmd --filter @ai-presenter/client run check`.
- [ ] **Step 3: Run** `pnpm.cmd --filter @ai-presenter/client run build` and `node tests/unit/runUnitTests.cjs werewolfV2InteractionState.test.ts`.
- [ ] **Step 4: Open** `http://localhost:5173/game/v2/werewolf`, capture the same viewport/state as the selected mockups, inspect console errors and compare layout.
- [ ] **Step 5: Record** the comparison in `design-qa.md`; fix P0-P2 mismatches until `final result: passed`, or report the exact blocker.

