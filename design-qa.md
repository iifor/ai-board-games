# Werewolf v2 Transparent Speaker Design QA

- source visual truth path:
  - `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-a1ac2d1c-c0bb-4a04-8311-4b355780ea68.png`
  - `C:\Users\Administrator\Desktop\AI项目\CONSENSUS\.superpowers\brainstorm\1865-1784904306\content\transparent-layout-preview.png`
- implementation route: `http://127.0.0.1:5173/game/v2/werewolf`
- implementation screenshot paths:
  - `.superpowers/qa/werewolf-speaker-2048x1059.png`
  - `.superpowers/qa/werewolf-speaker-1920x1080.png`
  - `.superpowers/qa/werewolf-speaker-1440x810.png`
  - `.superpowers/qa/compare-before-after.png`
- source pixels: original problem `3840 x 1984`; confirmed transparent-layout preview `703 x 1032`
- viewport and implementation pixels:
  - CSS viewport/root `2048 x 1059`; IAB non-fullPage output `1966 x 1059`
  - CSS viewport/root `1920 x 1080`; output `1920 x 1080`
  - CSS viewport/root `1440 x 810`; output `1440 x 810`
- density normalization: no density resampling; screenshots were compared at their native IAB output size. The `2048 x 1059` backend capture omitted 82 px on the right, while DOM root and geometry remained `2048 x 1059`; this capture-backend crop is not a product layout defect.
- state: standard 12-player board, god view, debug mode, real workflow player-attributed speech; day and night states.

**Findings**

- No actionable P0/P1/P2 mismatch remains.
- The `2048 x 1059` screenshot backend cropped 82 px from the right edge. DOM measurements, the complete `1920 x 1080` and `1440 x 810` captures, and successful right-seat interaction confirm that the application itself did not clip the viewport.

**Required fidelity surfaces**

- Fonts and typography: the phase title, seat metadata, speaker identity, and subtitle keep a readable hierarchy without clipping, awkward wrapping, or density drift at all three viewports.
- Spacing and layout rhythm: at the `2048 x 1059` DOM viewport, left seats occupy x `203..454`, right seats x `1594..1845`, the cutout y `106..826`, and the subtitle y `853..964`; the 27 px cutout-to-subtitle gap preserves the intended safe area. The head remains below the phase bar.
- Colors and visual tokens: day captures retain the warm mountain/lake palette and night retains the dark moonlit palette; speaker and sheriff accents remain legible in both states.
- Image quality and asset fidelity: transparent cutouts show only the characters, with no source background rectangle, poster card, black border, or visible framing halo. Pale/dark hair and different clothing silhouettes remain natural against day and night scenes.
- Copy and content: the selected speaker identity, seat number, and workflow subtitle agree; the central legacy “正在发言” title is absent.
- Icons and controls: all 12 seats remain visible with consistent icon treatment; active speaker and sheriff badges remain distinguishable.
- Accessibility and reduced motion: seats remain real interactive controls. Left and right seat clicks opened the correct player details; no new motion or focus-blocking overlay was observed.

**Full-view comparison evidence**

- `.superpowers/qa/compare-before-after.png` places the original problem state and browser-rendered implementation in the same comparison input.
- Before: the character carried the source poster background, was enlarged under the phase bar, and was pressed into the subtitle region.
- After: the isolated character stands within the center safe area, the background/card framing is absent, and the phase bar, both seat columns, and subtitle remain unobstructed.
- Responsive captures confirm the same composition at `2048 x 1059`, `1920 x 1080`, and `1440 x 810`.

**Focused region comparison evidence**

- Center character: 文心一言 and 讯飞星火 covered day speech; 智谱清言 covered night speech. The session included at least three speakers with pale/dark hair and distinct clothing edges.
- Top and bottom safe areas: the character head clears the phase bar, the body clears the subtitle, and the measured `2048 x 1059` layout retains 27 px between them.
- Side seats: all 12 seats remain visible. Clicking left-side 豆包 and right-side Claude Code opened the corresponding player-detail panel.
- Focused inspection found no background rectangle, poster border, black edge, head clipping, or subtitle overlap.

**Automated verification outcomes**

- Alpha validation: 13/13 passed (`validated 13 transparent cutouts`).
- Targeted unit test: 6/6 passed (`pnpm.cmd test:unit -- playerPosterSpotlight.test.ts`).
- Client type check: passed (`pnpm.cmd --filter @ai-presenter/client run check`).
- Production client build: passed; 1726 modules transformed in 5.08s (`pnpm.cmd build:client`).

**Console and interaction checks**

- Browser console: `error=[]`, `warn=[]`.
- Primary interactions:
  - entered `/game/v2/werewolf`
  - selected standard 12-player mode, god view, and debug mode
  - reached real workflow player speech
  - observed day and night states
  - observed at least three different speakers
  - clicked one left seat and one right seat; both opened the correct details

**Comparison history**

- Pass 0: the original implementation used a framed poster/background treatment and let the oversized character compete with the phase bar and subtitle.
- Fixes made in Tasks 1–4: add 13 transparent cutouts, select the cutout variant only for Werewolf v2 player speech, remove backdrop/card/caption framing, hide the center interaction layer during speech, and constrain the character to the safe area.
- Pass 1: IAB browser captures and the combined before/after comparison confirm that the earlier P1 framing/overlap mismatch is resolved. No actionable P0/P1/P2 issue remains.

**Implementation Checklist**

- [x] Verify 13 transparent cutouts.
- [x] Verify day and night speech states.
- [x] Verify three required desktop viewports.
- [x] Verify at least three speakers and varied hair/clothing edges.
- [x] Verify top/subtitle safe areas.
- [x] Verify left/right seat interaction.
- [x] Verify browser console.
- [x] Compare source and implementation in one combined input.

**Follow-up Polish**

- None required for acceptance.

final result: passed

---

# Avalon v2 option 1 redesign QA — 2026-08-27

- Source visual truth: `C:\Users\Administrator\.codex\generated_images\01a02f41-10ef-7a32-b873-4d2958dfb56d\exec-e834a306-5edb-4b65-9d42-d29db805881f.png`
- Implementation: `http://127.0.0.1:5173/game/v2/avalon?visualQaAvalon=1`
- Final implementation screenshot: `artifacts/avalon-v2-redesign/implementation-final-1433x806.png`
- Final combined comparison: `artifacts/avalon-v2-redesign/comparison-final-normalized.png`
- Source pixels: `1672 × 941`
- CSS viewport and implementation pixels: `1433 × 806`, device density `1`
- Density normalization: the source was bicubic-scaled to `1433 × 806`; the implementation remained at native `1433 × 806`. Both full views were placed in one `2866 × 806` comparison image without cropping.
- State: mission 2, proposal attempt 1, public team vote with aggregate `2/5` progress, Gemini as leader, players 3/4/5 selected, host narration active.

## Findings

No actionable P0/P1/P2 mismatch remains.

- Fonts and typography: the product font stack is retained; brand, mission HUD, player names, statuses, narration, and score labels preserve the reference hierarchy without wrapping or truncation.
- Spacing and layout rhythm: the implementation retains the top mission track, two left seats, two right seats, one centered lower seat, central host, lower-third narration, and centered score line. At `1024 × 576`, all five seat rectangles and all three control buttons remained inside the viewport.
- Colors and visual tokens: midnight navy surfaces, pale blue borders, gold active state, green success/good state, and red evil state match the approved direction while reusing the product's game tokens.
- Image quality and asset fidelity: the stage uses the existing real `/assets/undercover/stage-background.png`; the host uses the shared transparent `/player-poster-cutouts/host.webp`; player cards use real player poster assets. No placeholder, emoji, inline SVG, or rasterized UI substitute was introduced.
- Copy and content: mission sizes, phase, proposal attempt, aggregate public vote count, team membership, leader, narration, and scores agree with the fixture. Individual secret votes are intentionally not shown.
- Intentional product-system deviations: the generated reference host and abstract backdrop were replaced by the shared production host and shared broadcast stage so Avalon stays coherent with Werewolf, Debate, and Undercover v2. This is an approved consistency constraint, not unresolved visual drift.
- Accessibility and controls: the stage has named regions and live narration; mission progress uses `aria-current`; pause/continue and speech on/off toggles were both exercised successfully; browser console warnings and errors were empty.

## Full-view comparison evidence

`artifacts/avalon-v2-redesign/comparison-final-normalized.png` places the selected option 1 reference and the final browser-rendered implementation in the same normalized input. It confirms the same overall hierarchy, five-seat composition, mission progress, gold active treatment, central host, narration strip, and score region.

## Focused region comparison evidence

No separate crop was required: at the normalized `1433 × 806` size, the mission HUD, all five player cards, narration, and score labels are readable in the full comparison. Browser DOM geometry at `1024 × 576` separately verified that persistent controls and all seats remain within bounds.

## Comparison history

1. Pass 1 found three P2 differences: the mission HUD lacked the reference capsule, scores were split to the far viewport edges, and the visual fixture showed `继续` instead of the reference `暂停` state.
2. The HUD received the restrained capsule border, the score group moved beneath the narration, the development fixture received a real local playback toggle, and the Avalon gold focus ring was added to the reused stage.
3. Pass 2 and the final normalized comparison confirmed the earlier P2 findings were resolved. No actionable P0/P1/P2 issue remains.

## Automated and runtime verification

- Client type check: passed.
- Focused Avalon unit tests: `7/7` passed.
- Production client build: passed; `1736` modules transformed.
- Browser console: no warnings or errors.
- Primary interactions: pause → continue → pause and speech on → off → on both passed.
- Responsive geometry: `1024 × 576` controls and all five seats stayed within viewport bounds.

## Implementation checklist

- [x] Reuse the shared production stage, host, icons, and player assets
- [x] Keep classic Avalon unchanged and scope the redesign to v2
- [x] Render top mission progress and real public phase state
- [x] Render the five-player stage without exposing individual secret votes
- [x] Add host narration, centered scores, leader and team states
- [x] Verify controls, console, type check, focused tests, and production build
- [x] Compare source and implementation in one normalized visual input

## Follow-up polish

- P3: if Avalon later receives its own production stage illustration, it can replace the shared stage asset without changing the component layout or state model.

final result: passed

---

# Shared player detail avatar title QA — 2026-08-01

- Source visual truth: `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-ecf06976-dbb3-41b7-8755-93ef8de48aaa.png`
- Implementation: `http://localhost:5173/game/v2/werewolf`
- Desktop capture: `artifacts/player-detail-avatar-title-2026-08-01/01-qwen-1852x1176.png`
- Narrow-layout capture: `artifacts/player-detail-avatar-title-2026-08-01/02-qwen-640x800.png`
- Full-view comparison: `artifacts/player-detail-avatar-title-2026-08-01/03-full-comparison.png`
- Focused title comparison: `artifacts/player-detail-avatar-title-2026-08-01/04-title-comparison.png`
- Source pixels: `1852 × 1176`
- CSS viewport: `1852 × 1176`, device density `1`
- Implementation pixels: `1353 × 1176`; the in-app capture backend cropped the right side of the requested `1852 × 1176` viewport while DOM measurements retained the complete viewport
- Normalization: the source and implementation were proportionally contained in equal `926 × 588` panels; the focused comparison used the visible title regions from both images
- State: Werewolf v2 debug match, Qwen player detail open, role-visible god view

## Findings

No actionable P0/P1/P2 difference remains for the requested avatar-title change.

- Fonts and typography: the existing nickname scale, weight, line height, and hierarchy are unchanged. The avatar and nickname are vertically centered in one title row.
- Spacing and layout rhythm: the title uses a `14 px` gap. Browser measurement found a `50.16 px` avatar followed by the Qwen heading; the document retained `1852 × 1176` dimensions without page overflow.
- Colors and visual tokens: the existing blue modal, white nickname, avatar border, and glow tokens are preserved.
- Image quality and asset fidelity: the title reuses the real player avatar. The transparent full-body cutout remains unchanged and the portrait region contains no avatar disc.
- Copy and content: nickname, player profile, authorized role description, and status copy are unchanged.
- Accessibility and interaction: the dialog remains labelled `千问信息`; the close button removed the dialog and the same player control reopened it.
- Browser console: no warning or error entries were recorded.
- Fallback: the focused shared-component test covers the no-avatar path through the existing `PlayerAvatar` fallback.

## Full-view comparison evidence

The combined image preserves the existing modal composition and information hierarchy. The only intended structural change is visible in the implementation: the formerly obscured avatar disc is removed from behind the full-body cutout and appears beside the nickname.

## Focused region comparison evidence

The focused comparison makes the requested change readable at title scale. The source shows a standalone `千问` heading, while the implementation shows the existing Qwen avatar immediately before `千问`.

## Comparison history

1. The source screenshot exposed the avatar behind the character cutout, where most of it was obscured.
2. The shared component moved the existing avatar into a dedicated title row and left the portrait region cutout-only.
3. Browser DOM inspection measured `portraitAvatarCount: 0`, `titleAvatarCount: 1`, and the title child order `player-detail-avatar`, then `H3`.
4. A `640 × 800` check retained the same title order and no document-level overflow; the desktop source remains the visual-fidelity target.

## Implementation checklist

- [x] Remove the avatar disc from behind the character cutout
- [x] Render the existing player avatar before the nickname
- [x] Preserve avatar fallback behavior
- [x] Preserve profile and authorized match fields
- [x] Verify close and reopen behavior
- [x] Check browser console
- [x] Compare full view and focused title region against the supplied screenshot

final result: passed

---

# Debate v2 player roster rail QA — 2026-07-31

- Source visual truth: `C:\Users\Administrator\.codex\generated_images\019fae67-10e9-7a40-a749-7ba8748ded96\call_qU57YWp5kUQPt2DMVgQxqpQi.png`
- Implementation: `http://localhost:5173/game/v2/debate`
- Final 1280 capture: `artifacts/debate-seat-roster-rail-2026-07-31/09-final-players-and-judges-1280x720.png`
- Final 2048 viewport capture: `artifacts/debate-seat-roster-rail-2026-07-31/10-final-players-and-judges-2048x1024.png`
- No-judge conditional capture: `artifacts/debate-seat-roster-rail-2026-07-31/04-no-judges-1280x720.png`
- Full-view comparison: `artifacts/debate-seat-roster-rail-2026-07-31/11-final-reference-vs-implementation.png`
- Focused pro-rail comparison: `artifacts/debate-seat-roster-rail-2026-07-31/12-final-focused-pro-rail-comparison.png`
- Source pixels: `1798 × 875`
- CSS viewports: `1280 × 720` and `2048 × 1024`, device density `1`
- Implementation pixels: `1280 × 720`; the in-app capture backend returned `1337 × 1024` for the `2048 × 1024` viewport while DOM measurements retained the full `2048 × 1024` layout
- Normalization: full views were proportionally contained in equal `960 × 540` panels without cropping; the focused comparison used the visible pro-rail regions from both images
- States: four players per side with four assigned judges, speaking player, captain, keyboard focus, player-detail dialog, and zero assigned judges

## Findings

No actionable P0/P1/P2 visual difference remains.

- Fonts and typography: role, player name, model name, and two-digit seat number form a consistent hierarchy. Long model names use single-line ellipsis and no longer increase individual card height.
- Spacing and layout rhythm: at `1280 × 720`, all eight player rails are `48.625 px` high and both columns use `51.958 px` gaps. At `2048 × 1024`, all rails are `77.042 px` high. The left and right grids remain mirrored.
- Colors and visual tokens: cyan pro rails, red con rails, and the existing gold speaking state match the approved restrained esports direction without introducing a new palette.
- Image quality and asset fidelity: existing real player avatars remain sharp, square, and correctly contained. No placeholder image or generated runtime asset was introduced.
- Copy and content: all cards retain debate role, player name, model name, captain state, and visible `01`–`04` numbering.
- Judge state: four existing judge cards remain intact when assigned. After removing all four judges in setup, the rendered judge-card count was `0` and no placeholder judge row was visible.
- Accessibility: player avatars render as native `button` elements. Browser inspection confirmed `:focus-visible` on the focused player button with a solid white outline; clicking the same control opened the correct player-detail dialog.
- Browser console: no warning or error entries were recorded in the final populated-player pass.

## Full-view comparison evidence

The final combined image shows the same opposing roster-rail concept as option
2: compact dark plates, squared avatars, cyan/red side rails, mirrored
alignment, two-digit ordering, and four evenly distributed seats per side. The
implementation keeps the existing center speaker, judge row, subtitle, and
arena proportions rather than copying mock-only empty-stage content.

## Focused region comparison evidence

The focused pro-rail comparison makes the card-level treatment readable. Both
versions use a squared avatar cell, small debate-role label, numbered order,
strong player identity, dark translucent surface, and a thin team-colored
edge. The implementation intentionally retains the real model-name line and
captain badge from the product.

## Comparison history

1. Pass 1 found a P2 typography/rhythm issue: long model names wrapped and made
   individual cards taller; avatars also read smaller than the selected option
   at the `1280 × 720` viewport.
2. The v2-scoped rail was adjusted from a `48 px` to `54 px` avatar, from a
   `64 px` to `72 px` base card, and model names were constrained to one line
   with ellipsis.
3. Pass 2 measured all four pro and all four con cards at the same height and
   found no remaining actionable P0/P1/P2 visual issue.

## Automated and runtime verification

- `git diff --check`: passed.
- Vite-rendered local page: loaded successfully at both target viewports.
- Player detail click: opened the correct player.
- Focus-visible state: confirmed by DOM and computed-style inspection.
- Browser console warnings/errors: none.
- Unit tests, client type check, and production build were not rerun because
  the command approval service rejected execution after its usage limit was
  reached; the user explicitly approved continuing with browser verification.
- The no-judge save attempt displayed the existing `无效的游戏指令` runtime
  response, so this QA claims only the requested conditional absence of the
  judge row, not a complete judge-free match workflow.

## Implementation checklist

- [x] Use compact option-2 roster rails
- [x] Mirror pro and con card composition
- [x] Show `01`–`04` on both sides
- [x] Keep four equal-height cards evenly distributed
- [x] Preserve captain, speaking, MVP, vote, model, and player-detail states
- [x] Keep assigned judge cards intact
- [x] Render no judge cards when no judges are assigned
- [x] Verify `1280 × 720` and `2048 × 1024`
- [x] Check browser console
- [x] Compare full view and focused player rail against the selected reference

## Follow-up polish

- P3: if the roster should match the mock more literally, the seat number can
  move beside the role label in a later iteration. The approved design spec
  places the number at the inner edge, which the current implementation follows.

final result: passed

---

# Debate v2 player spacing reduction QA — 2026-07-30

- Source visual truth: `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-60148280-c591-43e0-ba5a-c48dd9854d66.png`
- Implementation: `http://localhost:5173/game/v2/debate`
- No-judge screenshots: `artifacts/debate-player-spacing-half-2026-07-30/01-no-judges-1280x720.png`, `02-no-judges-2048x1024.png`
- Populated-judge screenshots: `artifacts/debate-player-spacing-half-2026-07-30/04-with-judges-1280x720.png`, `03-with-judges-2048x1024.png`
- Combined full-view comparison: `artifacts/debate-player-spacing-half-2026-07-30/07-reference-vs-no-judges-preview.png`
- CSS viewports: 1280 × 720 and 2048 × 1024, device density 1
- Source pixels: 3840 × 1870
- Implementation pixels: 1280 × 720 and 2048 × 1024
- Normalization: the 2048-wide source and implementation views were proportionally fitted into equal 1024 × 512 comparison panels without cropping
- States: idle roster without judges; debug match with four assigned judges

## Findings

No actionable P0/P1/P2 differences remain.

- Spacing and layout rhythm: both player lists are vertically centered and use equal gaps. Measured gaps are 51.96 px at 1280 × 720 and 65.94 px at 2048 × 1024, matching the approved 52 px and 66 px targets within 0.1 px.
- Judge state: zero judge cards render without assigned judges; four judge cards render after debug setup.
- Overlap: measured judge rectangles do not intersect the pro column, con column, or subtitle at either viewport.
- Fonts and typography: unchanged from the approved Debate v2 stage.
- Colors and visual tokens: unchanged cyan, red, gold, and neutral stage palette.
- Image quality and assets: existing stage, avatar, and speaker assets remain unchanged and uncropped.
- Copy and content: player, topic, phase, and judge labels remain unchanged.
- Browser console: no warning or error entries were recorded during the final pass.

## Full-view comparison evidence

The combined comparison shows the revised four-card group centered in each side column with visibly tighter vertical rhythm. The stage composition, headers, controls, and center content remain unchanged.

## Focused region comparison evidence

The populated-judge screenshots were inspected separately at both target viewports. All four judge cards remain visible, and measured bounds confirm that the judge row stays clear of both player columns and the subtitle.

## Comparison history

1. Approved first implementation used `clamp(52px, 7vh, 66px)`.
2. Browser measurement found a P2 mismatch: the existing 1920-based pixel-to-viewport transform reduced the 1280 × 720 gap to 44 px.
3. Calibrated the same v2-scoped rule to `clamp(52px, calc(13.44vh - 3.5vw), 78px)`.
4. Revised measurements reached 51.96 px and 65.94 px; no P0/P1/P2 issue remains.

## Implementation checklist

- [x] Reduce the previous full-column gaps by about 50%
- [x] Keep four player cards evenly spaced and vertically centered
- [x] Hide the judge row when no judges are assigned
- [x] Preserve all four judge cards when judges are assigned
- [x] Avoid player, judge, speaker, and subtitle overlap
- [x] Check the browser console

final result: passed

---

# Debate v2 player spacing QA — 2026-07-30

- Source: `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-60148280-c591-43e0-ba5a-c48dd9854d66.png`
- Implementation: `http://localhost:5173/game/v2/debate`
- Evidence: `artifacts/debate-player-spacing-2026-07-30/01-spacing-1280x720.png`, `02-spacing-2048x1024.png`
- Comparison: `artifacts/debate-player-spacing-2026-07-30/03-reference-vs-implementation.png`
- State: idle arena with four empty seats on each side
- Viewports: 1280 × 720 and 2048 × 1024 CSS px

## Findings

- Player spacing now uses `clamp(16px, 2vh, 20px)` instead of `8px`.
- Both rails retain all four seats inside the viewport at both tested sizes.
- No card, avatar, typography, control, or arena-position changes were introduced.

final result: passed

---

# Debate style optimization QA — 2026-07-30

- Viewport: 1280 × 720 CSS px
- Before: `artifacts/debate-style-audit-2026-07-30/01-idle.png`, `02-setup.png`, `03-randomized-blocked.png`
- After: `artifacts/debate-style-audit-2026-07-30/04-idle-optimized.png`, `05-setup-accessible.png`, `06-randomized-valid.png`
- Verified: one primary HUD title, 44 px minimum controls, visible setup validation, 4/4/4 randomized teams, enabled start action, click assignment, and return-to-audience flow
- Accessibility: rendered unit coverage confirms native buttons for player cards and empty slots; browser automation did not prove Enter/Space activation, so keyboard end-to-end is not claimed
- Runtime note: the current server accepts the debug start payload directly; the temporary Vite proxy path still returned `INVALID_MESSAGE`, so no active-state browser pass is claimed here

## Implementation checklist

- [x] Preserve the existing v2 visual direction
- [x] Remove the duplicate hero title
- [x] Increase persistent control hit areas
- [x] Improve secondary-copy contrast and speaking emphasis
- [x] Make setup assignment usable without drag-and-drop
- [x] Show incomplete/randomization errors in the dialog
- [x] Verify client types, production build, focused unit coverage, and static diff hygiene

final result: passed with runtime note

---

# Debate v2 design QA

- Source visual truth: `C:\Users\Administrator\.codex\generated_images\019fa8c9-3149-7ea3-9591-8a926ab57849\call_4GmkOQCCgPh1aoKKfk0hsmCi.png`
- Implementation: `http://localhost:5173/`
- Implementation screenshot evidence: right panel of `C:\Users\Administrator\.codex\generated_images\019fa8c9-3149-7ea3-9591-8a926ab57849\call_BRB6bVUPLW3JTgQsnslxeiUZ.png`
- Viewport: 1280 × 720 CSS px, device density 1
- Source pixels: 1488 × 1056
- Implementation pixels: 1280 × 720
- Normalization: both full views were proportionally fitted into equal comparison panels; no crop was used
- State: current speaker visible, four players per side, three judges and fallback subtitle visible

## Findings

No actionable P0/P1/P2 visual differences remain.

- Typography: title, topic, current phase and compact labels retain the approved hierarchy at the smaller 1280 × 720 viewport.
- Spacing and layout: the viewport has no outer border or clipped persistent controls; player rails, center speaker, judges and subtitle use separate safe areas.
- Colors: cyan pro, red con, gold active state and neutral dark stage match the selected direction.
- Image quality: the generated debate-stage raster is sharp at the tested viewport; the transparent player asset is rendered with `contain`, with no CSS crop or opaque card.
- Copy: team positions, phase state, player names, judge labels and subtitle stay readable.

## Full-view comparison evidence

The comparison board shows the same three-column debate composition, central speaker, opposing color split, bottom judging area and compact controls. The implementation intentionally compresses the vertical rhythm for 16:9 while preserving the source hierarchy.

## Focused region comparison evidence

The center speaker and subtitle region was checked separately in the browser because it was the reported failure area. The character remains entirely visible within the available source artwork, and the fallback subtitle now sits below the character and judges instead of covering the torso.

## Comparison history

1. Initial active-state capture: P1 — fallback subtitles inherited the shared centered modal layout and covered the speaker's torso.
2. Fix: added a debate-v2 scoped fallback subtitle layout at the bottom safe area.
3. Revised capture: the speaker, judges and subtitle no longer overlap; no P0/P1/P2 issue remains.

## Follow-up polish

- P3: current player cutout files are three-quarter-body source art. All source pixels are visible; regenerate the 13 cutouts only if ankle-to-shoe framing is required for every player.

## Implementation checklist

- [x] Remove outer frame and viewport clipping
- [x] Use the approved debate-stage background
- [x] Keep side rosters transparent and compact
- [x] Render the current speaker as a transparent cutout
- [x] Separate speaker, judges and subtitle safe areas
- [x] Verify idle and active layouts at 1280 × 720

final result: passed

---

# Debate v2 player distribution QA — 2026-07-30

- Source visual truth: `C:\Users\Administrator\AppData\Local\Temp\codex-clipboard-60148280-c591-43e0-ba5a-c48dd9854d66.png`
- Implementation: `http://localhost:5173/game/v2/debate`
- No-judge screenshots: `artifacts/debate-player-distribution-2026-07-30/01-no-judges-1280x720.png`, `04-no-judges-2048x1024.png`
- Populated-judge screenshots: `artifacts/debate-player-distribution-2026-07-30/02-with-judges-1280x720.png`, `03-with-judges-2048x1024.png`
- Combined comparison: `artifacts/debate-player-distribution-2026-07-30/05-reference-vs-no-judges.png`
- CSS viewports: 1280 × 720 and 2048 × 1024
- Source pixels: 3840 × 1870
- Implementation pixels: 1280 × 720 and 1974 × 1024; the 2048-wide in-app viewport reserves 74 px for browser chrome
- Normalization: the source and 2048 viewport capture were both scaled to 2048 × 1024 before horizontal comparison

## Findings

No actionable P0/P1/P2 differences remain.

- Spacing and layout rhythm: both player lists use `space-between`; at 1280 × 720 the empty-seat gaps are 104–105 px, and at 2048 × 1024 they are 133 px.
- Judge state: zero judge cards render without assigned judges; four judge cards render after debug setup and do not overlap either player column or the subtitle.
- Fonts and typography: unchanged from the approved v2 stage.
- Colors and visual tokens: unchanged cyan, red, gold, and neutral stage palette.
- Image quality and assets: existing stage, avatar, and speaker assets remain unchanged and uncropped.
- Copy and content: player, topic, phase, and judge labels remain unchanged.

## Full-view comparison evidence

The combined comparison shows the requested change clearly: the four cards no longer cluster near the top and instead span the complete side-column height while the center stage composition remains unchanged.

## Focused region comparison evidence

The 1280 × 720 populated-judge capture was reviewed separately because judge labels are too small in the full-view comparison. Four judge cards remain legible below the speaker; measured rectangles show no overlap with either side column or the subtitle.

## Comparison history

1. Previous pass used a larger fixed responsive gap, but the cards still clustered near the top.
2. Replaced fixed-only spacing with `justify-content: space-between` while retaining the minimum responsive gap.
3. Revised captures show even full-column distribution with conditional judge rendering intact.

## Implementation checklist

- [x] Distribute four player cards across the full side-column list
- [x] Keep all cards visible at both desktop viewports
- [x] Hide the judge row when no judges are assigned
- [x] Preserve all four judge cards when judges are assigned
- [x] Avoid player, judge, speaker, and subtitle overlap

final result: passed
