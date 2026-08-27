# Debate Style Optimization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix incomplete randomized debate teams and improve the existing debate v2 stage and setup accessibility without changing gameplay contracts.

**Architecture:** Keep `DebateGame`, the debate workflow, and the existing drag-and-drop assignment algorithm. Add one pure response-boundary normalizer, route click/keyboard actions through the existing slot assignment function, and scope presentation changes to `.debate-shell--v2`.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner, existing debate utilities and components.

## Global Constraints

- Preserve current debate phases, WebSocket events, REST response shapes, database schema, and shared types.
- Reuse the existing team normalization, swapping, player card, team board, and v2 stage components.
- Add no dependency, page, route, host-selection flow, or parallel setup implementation.
- Preserve all unrelated dirty worktree changes; do not stage or rewrite them.
- Keep classic debate visuals unchanged; stage styling must remain under `.debate-shell--v2`.
- Keep buttons and keyboard-operable controls at least 44px high where space permits.

---

### Task 1: Normalize Randomized Team Responses

**Files:**
- Modify: `packages/client/src/features/debate/debateUtils.ts:287-340`
- Modify: `packages/client/src/features/debate/components/DebateTopicDialog/index.tsx:138-175`
- Create: `tests/unit/debateSetup.test.ts`
- Modify: `tests/unit/runUnitTests.cjs`

**Interfaces:**
- Consumes: `Partial<DebateTeamDraft>` returned by `/api/toc/randomize-debate-teams`.
- Produces: `normalizeRandomizedDebateTeams(value: Partial<DebateTeamDraft>): DebateTeamDraft`, throwing `Error('随机分配结果不完整')` when fewer than eight unique debaters are returned.

- [ ] **Step 1: Write the failing regression test**

```ts
import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeRandomizedDebateTeams } from '../../packages/client/src/features/debate/debateUtils';

test('keeps any twelve players returned from a thirteen-player randomization request', () => {
  const result = normalizeRandomizedDebateTeams({
    proIds: [13, 2, 4, 6],
    conIds: [1, 3, 5, 7],
    judgeIds: [8, 9, 10, 11],
    proCaptainId: 13,
    conCaptainId: 1,
  });

  assert.deepEqual(result.proIds, [13, 2, 4, 6]);
  assert.deepEqual(result.conIds, [1, 3, 5, 7]);
  assert.equal(result.judgeIds.length, 4);
});

test('rejects an incomplete randomized response', () => {
  assert.throws(
    () => normalizeRandomizedDebateTeams({ proIds: [1, 2, 3], conIds: [4, 5, 6, 7] }),
    /随机分配结果不完整/,
  );
});
```

- [ ] **Step 2: Add the test to the existing unit manifest and verify RED**

Add `debateSetup.test.ts` beside the other `tests/unit/*.test.ts` entries in `tests/unit/runUnitTests.cjs`.

Run:

```powershell
pnpm.cmd run test:unit -- debateSetup.test.ts
```

Expected: FAIL because `normalizeRandomizedDebateTeams` is not exported.

- [ ] **Step 3: Implement the response-boundary normalizer**

```ts
export function normalizeRandomizedDebateTeams(value: Partial<DebateTeamDraft>): DebateTeamDraft {
  const playerIds = uniquePlayerIds([
    ...(value.proIds || []),
    ...(value.conIds || []),
    ...(value.judgeIds || []),
  ]);
  if (playerIds.length < 8) throw new Error('随机分配结果不完整');
  return normalizeDebateTeamDraft(value, playerIds);
}
```

- [ ] **Step 4: Use the helper and expose request failures in the dialog**

Import `normalizeRandomizedDebateTeams`, add `randomizeError` state, clear it before each request, and replace the existing `normalizeDebateTeamDraft(..., ids)` call with:

```ts
onTeamsChange(normalizeRandomizedDebateTeams({
  proIds: dt.proIds || [],
  conIds: dt.conIds || [],
  judgeIds: dt.judgeIds || [],
  proCaptainId: dt.captainEnabled ? dt.proCaptainId : null,
  conCaptainId: dt.captainEnabled ? dt.conCaptainId : null,
}));
```

For non-OK responses, missing `debateTeams`, incomplete responses, and fetch errors, leave the previous team draft unchanged and set:

```ts
const message = error instanceof Error && error.message
  ? error.message
  : '随机分配失败，请重试';
setRandomizeError(message);
```

Throw `new Error('随机分配结果不完整')` when the response has no `debateTeams`. Render `randomizeError` inside the dialog with `role="alert"`.

- [ ] **Step 5: Verify GREEN**

Run:

```powershell
pnpm.cmd run test:unit -- debateSetup.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: both commands pass.

---

### Task 2: Add Click and Keyboard Team Assignment

**Files:**
- Modify: `packages/client/src/features/debate/components/DebateTopicDialog/index.tsx`
- Modify: `packages/client/src/features/debate/components/DebatePlayerPool/index.tsx`
- Modify: `packages/client/src/features/debate/components/DebatePlayerPool/index.css`
- Modify: `packages/client/src/features/debate/components/DebateTeamBoard/index.tsx`
- Modify: `packages/client/src/features/debate/components/DebateTeamColumn/index.tsx`
- Modify: `packages/client/src/features/debate/components/DebateTeamColumn/index.css`
- Modify: `packages/client/src/features/debate/components/DraggableDebatePlayer/index.tsx`
- Modify: `packages/client/src/features/debate/components/DraggableDebatePlayer/index.css`
- Test: `tests/unit/debateSetup.test.ts`

**Interfaces:**
- `DraggableDebatePlayer` adds optional `selected?: boolean` and `onClick?: () => void`.
- `DebatePlayerPool` adds `selectedPlayerId`, `onPlayerSelect`, and `onReturnSelected`.
- `DebateTeamBoard` and `DebateTeamColumn` add `selectedPlayerId`, `onPlayerSelect`, and `onSlotClick`.
- All assignment still ends in `DebateTopicDialog.assignPlayerToSlot`.

- [ ] **Step 1: Add a focused rendered-component test**

```ts
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

const Module = require('node:module');
Module._extensions['.css'] = () => undefined;
const { DraggableDebatePlayer } = require('../../packages/client/src/features/debate/components/DraggableDebatePlayer');
const { DebateTeamColumn } = require('../../packages/client/src/features/debate/components/DebateTeamColumn');

test('renders player and empty-slot assignment as keyboard-operable buttons', () => {
  const player = { id: 13, nickname: '主持人' };
  const card = renderToStaticMarkup(
    React.createElement(DraggableDebatePlayer, { player, selected: true, onClick: () => undefined }),
  );
  const column = renderToStaticMarkup(
    React.createElement(DebateTeamColumn, {
      title: '正方',
      tone: 'pro',
      ids: [],
      slots: 1,
      labelPrefix: '正方',
      getPlayer: () => undefined,
      onDrop: () => undefined,
      onSlotClick: () => undefined,
    }),
  );

  assert.match(card, /^<button/);
  assert.match(card, /aria-pressed="true"/);
  assert.match(column, /<button[^>]*class="team-slot-empty"/);
});
```

Run:

```powershell
pnpm.cmd run test:unit -- debateSetup.test.ts
```

Expected: FAIL because the new props do not exist and `DraggableDebatePlayer` is still a `<div>`.

- [ ] **Step 2: Convert the player card root to a native button**

Replace the root `<div>` with `<button type="button">`, preserve all drag handlers, pass `aria-pressed={selected}`, and call the optional `onClick`. Add a `.selected` border/focus treatment using the existing blue/gold palette.

- [ ] **Step 3: Route pool and slot clicks through the existing algorithm**

In `DebateTopicDialog`, add `selectedPlayerId` state:

```ts
function selectPlayer(id: number): void {
  setSelectedPlayerId((current) => current === id ? null : id);
}

function assignSelectedPlayer(side: string, index: number): void {
  if (!selectedPlayerId) return;
  assignPlayerToSlot(selectedPlayerId, side, index);
  setSelectedPlayerId(null);
}
```

Pass these callbacks through `DebatePlayerPool`, `DebateTeamBoard`, and `DebateTeamColumn`. Empty positions use a native `.team-slot-empty` button. Clicking an occupied position selects that player when no different player is selected; otherwise it assigns the selected player to that position and reuses the current swap behavior.

- [ ] **Step 4: Add an accessible return-to-audience action**

Add a “移回观众席” button to `DebatePlayerPool`. Enable it only when `selectedPlayerId` belongs to a current pro, con, or judge slot. In the dialog, move the drag removal body into `removePlayerFromTeams(id)` and call it from both drop and button paths.

- [ ] **Step 5: Show the save requirement**

Derive one status message in `DebateTopicDialog`:

```ts
const missingPro = 4 - proIds.filter(Boolean).length;
const missingCon = 4 - conIds.filter(Boolean).length;
const validationMessage = randomizeError
  || [missingPro > 0 && `还缺正方 ${missingPro} 人`, missingCon > 0 && `还缺反方 ${missingCon} 人`]
    .filter(Boolean)
    .join('，');
```

Render it above the footer with `role={randomizeError ? 'alert' : 'status'}`. Update the pool instruction to mention both click and drag.

- [ ] **Step 6: Verify behavior and types**

Run:

```powershell
pnpm.cmd run test:unit -- debateSetup.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: the targeted test and type check pass.

---

### Task 3: Tighten the v2 Stage and Verify the Running Flow

**Files:**
- Modify: `packages/client/src/features/debate-v2/DebateGameV2/index.css`
- Modify: `docs/project-client.md`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: existing `.debate-shell--v2` stage, cutout speaker, seats, HUD, controls, and subtitle.
- Produces: a 1280×720 stage with one primary title, 44px controls, readable secondary text, and a stronger speaking state.

- [ ] **Step 1: Apply the smallest scoped CSS changes**

Under `.debate-shell--v2`:

```css
.debate-shell--v2 .debate-controls {
  height: 56px;
}

.debate-shell--v2 .debate-controls button {
  min-height: 44px;
  height: 44px;
}

.debate-shell--v2 .debate-hero h1 {
  display: none;
}

.debate-shell--v2 .debate-seat.speaking .debate-avatar {
  transform: scale(1.08);
}
```

Set `.seat-model-name` to `rgba(231, 237, 245, 0.74)`, `.debate-current span` to `rgba(239, 241, 245, 0.76)`, and `.debate-current strong` to `rgba(239, 242, 247, 0.82)`. Preserve the existing stage asset, column sizes, transparent cutout rules, and responsive breakpoints.

- [ ] **Step 2: Document the interaction and visual contract**

Add a concise `docs/project-client.md` note stating:

- randomized results are normalized against the returned participant set;
- setup supports drag plus click/keyboard assignment and visible validation;
- v2 keeps the broadcast HUD as the primary title and scopes its stage overrides under `.debate-shell--v2`;
- API, database, shared types, and workflow stages are unchanged.

- [ ] **Step 3: Run automated verification**

Run:

```powershell
pnpm.cmd run test:unit -- debateSetup.test.ts
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd --filter @ai-presenter/client run build
git diff --check
```

Expected: all commands pass. If the pre-existing `debateStyle.test.ts` fails because of unrelated mojibake or user edits, report it separately and do not rewrite it without approval.

- [ ] **Step 4: Verify the running page at 1280×720**

Using the existing in-app Browser:

1. Open the debate v2 page.
2. Open setup and randomize until the former 13-player case is exercised.
3. Confirm the save button enables with four pro and four con players.
4. Move one player using clicks, move them back to the audience, and repeat with keyboard activation.
5. Enable debug mode and start the match.
6. Capture idle/setup/active/complete screenshots.
7. Compare the screenshots at the same viewport, correct visible overlap or clipping, and record the evidence paths plus `final result: passed` in `design-qa.md`.

- [ ] **Step 5: Review only the task diff**

Run:

```powershell
git status --short
git diff --check
```

Do not stage or commit files that already contained unrelated user changes. Report the exact files changed by this task.
