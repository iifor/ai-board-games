# Debate v2 Player Seat Roster Rail Design

## Goal

Restyle the eight Debate v2 player seats as compact esports roster rails so each
side is easier to scan without competing with the central stage.

The change is visual only. Debate phases, player assignment, judge behavior,
WebSocket messages, APIs, persistence, and shared types remain unchanged.

## Selected Direction

The approved target is ideation option 2: a restrained roster rail with a slim
dark plate, a squared avatar cell, a strong player name, a smaller debate-role
label, and a visible `01`–`04` seat number.

The existing blue/red arena remains the visual foundation:

- pro seats use cyan-blue accents;
- con seats use red accents;
- the two sides mirror one another;
- cards stay horizontal and compact;
- decoration remains subordinate to player identity and speaking state.

## Layout

- Each side keeps exactly four player cards.
- The four cards remain vertically centered and evenly distributed within the
  existing player column.
- The current responsive inter-card spacing is preserved unless the new card
  height requires a small visual correction.
- Cards must not touch the viewport edge, central stage, judge row, subtitles,
  or bottom controls at supported desktop viewports.
- The pro rail reads from avatar to text to seat number.
- The con rail mirrors that order from seat number to text to avatar.

## Card Anatomy

Each card reuses the existing `DebateSeat` content and state:

1. squared avatar cell with a subtle side-colored outline;
2. debate-role label such as `一辩`;
3. player name as the primary text;
4. model name as quiet tertiary metadata when present;
5. two-digit seat number `01`–`04` at the inner edge of the rail;
6. existing captain, MVP, vote, and speaking indicators.

No new player data is introduced. The seat number is derived from the existing
zero-based seat index and is presentation-only.

## Visual Treatment

- Use a near-black translucent card surface that allows a small amount of the
  arena background to remain visible.
- Prefer a thin border and one side-colored rail over large glow effects.
- Keep corners modest and mostly squared to match the selected editorial grid.
- Use compact vertical padding and a clear text baseline.
- Preserve high contrast for the player name; role and model text must remain
  readable but visually secondary.
- Avoid gradients or ornamental assets that are not already part of the stage.

## Interaction States

- **Idle:** low-intensity team rail and avatar outline.
- **Hover/focus:** slightly brighter border and surface; keyboard focus remains
  clearly visible.
- **Speaking:** team rail, avatar outline, and player name brighten together;
  the state must remain obvious without relying on animation alone.
- **Captain/MVP/vote:** existing badges remain visible and may move within the
  card, but their meaning and triggering logic do not change.

Reduced-motion preferences must keep all state changes readable without
movement.

## Judge Seats

Judge behavior is unchanged:

- when no judges are assigned, no judge row or placeholder space is rendered;
- when judges are assigned, the existing judge row remains visible;
- player cards must not overlap the judge row in either state.

Judge cards are outside this visual redesign.

## Responsive Behavior

- Primary validation viewports are `1280×720` and `2048×1024`.
- The roster rail may reduce width and text size within the existing v2
  responsive rules, but must not wrap player names or clip the avatar.
- The classic debate page remains unchanged; all overrides stay scoped beneath
  `.debate-shell--v2`.

## Implementation Boundary

Reuse the existing components:

- `DebateSide` continues to create four seats per side.
- `DebateSeat` continues to render player identity and gameplay state.
- The implementation should be CSS-only unless the current markup cannot expose
  the existing seat index accessibly; in that case, add only the minimum
  presentation markup needed for the two-digit number.

Expected runtime file:

- `packages/client/src/features/debate-v2/DebateGameV2/index.css`

Possible minimal component file only if required:

- `packages/client/src/features/debate/components/DebateSeat/index.tsx`

No dependency, route, page, service, API, database, workflow, or shared-type
change is allowed.

## Acceptance Criteria

- Both sides show four compact, evenly distributed roster rails.
- Pro and con layouts are visibly mirrored.
- Every rail shows a clear avatar, role, player name, and `01`–`04` seat number.
- Model names and existing gameplay badges remain available and readable.
- Idle, hover/focus, speaking, captain, MVP, and vote states remain
  distinguishable.
- At `1280×720` and `2048×1024`, no player rail overlaps the central stage,
  viewport edge, judge row, subtitles, or controls.
- With zero judges, no judge row or reserved judge space is visible.
- With assigned judges, the judge row remains intact and unobstructed.
- Client type checking, production build, existing unit tests, and
  `git diff --check` pass.
- Visual QA compares the approved option 2 reference with matching browser
  captures and records `final result: passed`.

## Non-Goals

- Redesigning the arena background, center stage, HUD, controls, subtitles, or
  judge cards.
- Changing player assignment, debate workflow, scoring, audio, replay, or debug
  mode.
- Adding new animation libraries, image assets, design tokens, or configuration.
