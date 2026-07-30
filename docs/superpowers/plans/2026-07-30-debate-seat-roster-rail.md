# Debate v2 Player Seat Roster Rail Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recreate approved ideation option 2 as compact, mirrored Debate v2 player roster rails while preserving all gameplay and conditional judge behavior.

**Architecture:** Keep `DebateSide`, `DebateArena`, and the existing four-seat mapping. Add one native-control correction to the existing avatar trigger, then implement the selected layout with v2-scoped CSS counters and grid placement; no new component or data field is required.

**Tech Stack:** React 18, TypeScript, CSS, Node test runner, existing in-app browser.

## Global Constraints

- Treat `C:\Users\Administrator\.codex\generated_images\019fae67-10e9-7a40-a749-7ba8748ded96\call_qU57YWp5kUQPt2DMVgQxqpQi.png` as the visual source of truth.
- Preserve the current four-seat-per-side mapping and `judges.length > 0` conditional rendering.
- Keep all visual overrides under `.debate-shell--v2`; classic debate and judge-card visuals must remain unchanged.
- Reuse the existing avatar, role label, player name, model name, captain, MVP, vote, and speaking state.
- Add no dependency, route, page, asset, service, API, database, workflow, or shared type.
- Preserve all unrelated dirty-worktree changes. Append a new QA section to `design-qa.md`; do not replace its existing reports.
- Do not commit runtime files that already contain unrelated or earlier uncommitted work unless the user explicitly asks.

---

### Task 1: Add the Roster Rail Contract and Native Avatar Trigger

**Files:**
- Modify: `tests/unit/debateStyle.test.ts:10-19`
- Modify: `packages/client/src/features/debate/components/DebateSeat/index.tsx:33-43`
- Modify: `packages/client/src/features/debate/components/DebateSeat/index.css:71-87`

**Interfaces:**
- Consumes: existing `player`, `name`, `onPlayerSelect`, and `aria-label` values in `DebateSeat`.
- Produces: the same player-detail action through a native `<button type="button">`; no prop or callback signature changes.

- [ ] **Step 1: Add a failing source-contract test**

Extend the first test in `tests/unit/debateStyle.test.ts`:

```ts
const seat = read('packages/client/src/features/debate/components/DebateSeat/index.tsx');

assert.match(seat, /<button[\s\S]*?type="button"[\s\S]*?className="debate-avatar player-detail-trigger"/);
assert.match(arenaCss, /counter-reset:\s*debate-seat/);
assert.match(arenaCss, /counter-increment:\s*debate-seat/);
assert.match(arenaCss, /counter\(debate-seat,\s*decimal-leading-zero\)/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
pnpm.cmd run test:unit -- debateStyle.test.ts
```

Expected: the first test fails because the avatar trigger is still a `<div>`
and the v2 CSS has no seat counter.

- [ ] **Step 3: Convert only the existing avatar trigger to a native button**

In `DebateSeat/index.tsx`, replace the avatar wrapper with:

```tsx
<button
  type="button"
  className="debate-avatar player-detail-trigger"
  style={getPlayerAvatar(player) ? { backgroundImage: `url("${formatAvatarUrl(getPlayerAvatar(player))}")` } : undefined}
  onClick={() => player && onPlayerSelect?.(player)}
  disabled={!player}
  aria-label={player ? `查看${name}信息` : `${slotLabel}席位空缺`}
>
  {!getPlayerAvatar(player) && <span className="avatar-sprite" />}
  {isCaptain && <span className="captain-avatar-badge">队长</span>}
  {isMvp && <span className="mvp-avatar-badge"><Crown size={18} strokeWidth={3} />最佳</span>}
</button>
```

In the existing `.debate-avatar` rule, add only the button reset needed to
preserve current visuals:

```css
padding: 0;
appearance: none;
color: inherit;
font: inherit;
```

Add a keyboard-visible focus treatment:

```css
.debate-avatar:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 3px;
}
```

- [ ] **Step 4: Run the focused test**

Run:

```powershell
pnpm.cmd run test:unit -- debateStyle.test.ts
pnpm.cmd --filter @ai-presenter/client run check
```

Expected: the source-contract test and client type check pass.

---

### Task 2: Implement the Mirrored v2 Roster Rails

**Files:**
- Modify: `packages/client/src/features/debate-v2/DebateGameV2/index.css:142-255`
- Test: `tests/unit/debateStyle.test.ts`

**Interfaces:**
- Consumes: `.debate-seat-list`, `.debate-seat.pro`, `.debate-seat.con`, `.debate-avatar`, `.debate-nameplate`, and existing state classes.
- Produces: visual seat numbers `01`–`04` via a CSS counter; no accessible name or player data changes.

- [ ] **Step 1: Add the side-local seat counter**

Extend the existing v2 list rule:

```css
.debate-shell--v2 .debate-seat-list {
  counter-reset: debate-seat;
}
```

Each list resets independently, so both pro and con sides display `01`–`04`.

- [ ] **Step 2: Replace the v2 card geometry with the approved grid**

Update the v2 player-card rule:

```css
.debate-shell--v2 .debate-seat {
  counter-increment: debate-seat;
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) 34px;
  min-height: 64px;
  gap: 10px;
  padding: 7px 10px;
  border: 1px solid rgba(82, 215, 255, 0.2);
  border-left: 3px solid rgba(82, 215, 255, 0.76);
  border-radius: 4px;
  background: rgba(6, 12, 20, 0.76);
  box-shadow: inset 0 0 0 1px rgba(82, 215, 255, 0.04);
}

.debate-shell--v2 .debate-seat::after {
  content: counter(debate-seat, decimal-leading-zero);
  grid-column: 3;
  grid-row: 1;
  align-self: center;
  justify-self: end;
  color: rgba(158, 225, 245, 0.58);
  font-size: 12px;
  font-weight: 900;
  letter-spacing: 0.08em;
}
```

- [ ] **Step 3: Mirror the con rail without changing DOM order**

Use explicit grid placement:

```css
.debate-shell--v2 .debate-seat.con {
  grid-template-columns: 34px minmax(0, 1fr) 48px;
  border: 1px solid rgba(255, 107, 114, 0.2);
  border-right: 3px solid rgba(255, 107, 114, 0.76);
  background: rgba(18, 8, 12, 0.76);
  box-shadow: inset 0 0 0 1px rgba(255, 107, 114, 0.04);
}

.debate-shell--v2 .debate-seat.con::after {
  grid-column: 1;
  justify-self: start;
  color: rgba(255, 181, 186, 0.58);
}

.debate-shell--v2 .debate-seat.con .debate-avatar {
  grid-column: 3;
}
```

- [ ] **Step 4: Square the avatar and make the text column fluid**

Replace only the v2 dimensions:

```css
.debate-shell--v2 .debate-avatar {
  grid-column: 1;
  grid-row: 1;
  flex: none;
  width: 48px;
  height: 48px;
  border-radius: 5px;
}

.debate-shell--v2 .debate-nameplate {
  grid-column: 2;
  grid-row: 1;
  width: 100%;
  min-width: 0;
}

.debate-shell--v2 .debate-nameplate strong,
.debate-shell--v2 .seat-model-name,
.debate-shell--v2 .debate-nameplate > span:last-child:not(.seat-badge) {
  width: 100%;
}
```

Keep the existing role, name, model, captain, MVP, vote, hover, and speaking
selectors. Tune only opacity, border intensity, or one-pixel alignment when
browser comparison finds a P1/P2 mismatch.

- [ ] **Step 5: Run focused and broad automated checks**

Run:

```powershell
pnpm.cmd run test:unit -- debateStyle.test.ts
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd --filter @ai-presenter/client run build
pnpm.cmd run test:unit
git diff --check
```

Expected: all checks pass. The focused test proves the selected structural CSS
hooks remain present; visual fidelity is verified in Task 3.

---

### Task 3: Compare the Browser Result with Option 2

**Files:**
- Create: `artifacts/debate-seat-roster-rail-2026-07-30/01-1280x720.png`
- Create: `artifacts/debate-seat-roster-rail-2026-07-30/02-2048x1024.png`
- Create: `artifacts/debate-seat-roster-rail-2026-07-30/03-with-judges-1280x720.png`
- Create: `artifacts/debate-seat-roster-rail-2026-07-30/04-reference-vs-implementation.png`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: the approved option 2 image and the running route `http://localhost:5173/game/v2/debate`.
- Produces: same-state visual evidence and an appended QA section ending in exactly `final result: passed` or `final result: blocked`.

- [ ] **Step 1: Capture the no-judge roster at both target viewports**

Open the running Debate v2 page and capture:

- `1280×720`, device density `1`;
- `2048×1024`, device density `1`.

Record card bounds, inter-card gaps, and viewport overflow. Confirm each side
shows four complete cards numbered `01`–`04`.

- [ ] **Step 2: Capture populated judge and interaction states**

Use the existing setup/debug flow to assign judges and start the match. At
`1280×720`:

- confirm the judge row appears only after judges are assigned;
- confirm player cards do not overlap judges, subtitles, controls, or center stage;
- hover one player card;
- keyboard-focus one player avatar button;
- advance to a speaking state and confirm the active player remains clear;
- open a player detail from the avatar button;
- check the browser console for warnings and errors.

- [ ] **Step 3: Build one combined comparison image**

Place the option 2 source image and the matching `1280×720` implementation
capture in one comparison canvas without cropping either player column. Save it
as:

```text
artifacts/debate-seat-roster-rail-2026-07-30/04-reference-vs-implementation.png
```

- [ ] **Step 4: Run the blocking design QA pass**

Open the combined image and inspect the required fidelity surfaces:

- typography hierarchy;
- card width, vertical rhythm, avatar alignment, and mirrored grid;
- cyan/red opacity and border intensity;
- avatar quality;
- role, player name, model name, and `01`–`04` copy;
- idle, hover/focus, speaking, captain, MVP, vote, no-judge, and judge states.

If a P0/P1/P2 issue is found, append the finding to `design-qa.md`, fix it,
capture the same viewport/state again, and compare again. Do not hand off while
an actionable P0/P1/P2 issue remains.

- [ ] **Step 5: Append the final QA evidence**

Append a new `# Debate v2 player roster rail QA — 2026-07-30` section to
`design-qa.md`. Include the source path, implementation screenshot paths,
viewport and density, state, full-view comparison, focused card comparison,
console result, interaction checks, comparison history, and final result.

- [ ] **Step 6: Review only the task diff**

Run:

```powershell
git status --short
git diff --check
```

Confirm no unrelated file was changed, removed, staged, or reverted. Leave the
verified local preview open for user inspection.
