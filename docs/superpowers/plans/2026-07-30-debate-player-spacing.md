# Debate Player Spacing Reduction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Keep the four Debate v2 player cards evenly spaced while reducing their vertical gaps by about 50% and preserving conditional judge-seat rendering.

**Architecture:** Keep `DebateArena`, `DebateSide`, `DebateSeat`, and the existing judge row unchanged. Change only the v2-scoped player-list flex alignment so the four cards form a centered group with an explicit responsive gap.

**Tech Stack:** React 18, TypeScript, CSS, Vite, in-app Browser.

## Global Constraints

- Only Debate v2 may change.
- Player cards use `justify-content: center` inside the existing full-height list.
- Player-card gaps use `clamp(52px, calc(13.44vh - 3.5vw), 78px)` to account for the existing 1920-based pixel-to-viewport transform.
- Target measured gaps are about 52px at 1280×720 and 66px at 2048×1024, within 2px.
- Keep the existing `judges.length > 0` rendering condition unchanged.
- Do not change player-card dimensions, avatars, component structure, classic Debate, API, database, or shared types.

---

### Task 1: Reduce player spacing and verify judge states

**Files:**
- Modify: `packages/client/src/features/debate-v2/DebateGameV2/index.css:142-146`
- Modify: `design-qa.md`

**Interfaces:**
- Consumes: the existing `.debate-seat-list` flex column and `judges.length > 0` judge-row condition
- Produces: centered, evenly spaced v2 side cards with about half the previous gap; no TypeScript or API changes

- [x] **Step 1: Apply the minimal CSS change**

Update the existing v2 rule to:

```css
.debate-shell--v2 .debate-seat-list {
  width: 100%;
  justify-content: center;
  gap: clamp(52px, calc(13.44vh - 3.5vw), 78px);
  overflow: hidden;
}
```

- [x] **Step 2: Run static verification**

Run:

```powershell
pnpm.cmd --filter @ai-presenter/client run check
pnpm.cmd --filter @ai-presenter/client run build
pnpm.cmd run test:unit
git diff --check
```

Expected: every command exits `0`.

- [x] **Step 3: Verify the no-judge layout**

Open `http://localhost:5173/game/v2/debate` at 1280×720 and 2048×1024. Confirm:

- four pro and four con cards are vertically centered and evenly spaced;
- measured gaps are about 52px at 1280×720 and 66px at 2048×1024, within 2px;
- all cards remain visible;
- no judge row is rendered when the game has no judges.

- [x] **Step 4: Verify the populated judge layout**

Use the existing Debate setup/debug flow to render a game with assigned judges. Confirm:

- the judge row is visible;
- the judge cards do not overlap the player columns, center stage, or subtitles;
- the four pro and con cards remain centered and evenly spaced.

- [x] **Step 5: Record visual evidence**

Capture both judge states, compare them with the supplied screenshot, and append the viewport, state, measurements, screenshot paths, findings, and `final result: passed` to `design-qa.md`.

- [x] **Step 6: Preserve the current workspace**

Do not stage, commit, merge, push, or clean implementation files. Preserve all unrelated user changes.
